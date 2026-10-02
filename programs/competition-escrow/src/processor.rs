use pinocchio::{error::ProgramError, sysvars::Sysvar, AccountView, Address, ProgramResult};
use crate::state::*;

fn invalid() -> ProgramError { ProgramError::InvalidAccountData }
fn clock() -> Result<i64, ProgramError> { Ok(pinocchio::sysvars::clock::Clock::get()?.unix_timestamp) }
fn signer(a: &AccountView) -> ProgramResult {
    if !a.is_signer() { return Err(ProgramError::MissingRequiredSignature); } Ok(())
}
fn exact(a: &AccountView, id: &Address) -> ProgramResult {
    if a.address() != id { return Err(ProgramError::IncorrectProgramId); } Ok(())
}
fn read_u64(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(data.get(offset..offset+8).ok_or(ProgramError::InvalidInstructionData)?.try_into().unwrap()))
}
fn room(program: &Address, a: &AccountView) -> Result<Room, ProgramError> {
    if !a.owned_by(program) { return Err(ProgramError::InvalidAccountOwner); }
    let r = Room::load(&a.try_borrow()?)?;
    let pda = Address::create_program_address(&[Room::SEED, &r.id.to_le_bytes(), &[r.bump]], program).map_err(|_| ProgramError::InvalidSeeds)?;
    exact(a, &pda)?; Ok(r)
}
fn entry(program: &Address, a: &AccountView, room: &AccountView) -> Result<Entry, ProgramError> {
    if !a.owned_by(program) { return Err(ProgramError::InvalidAccountOwner); }
    let e = Entry::load(&a.try_borrow()?)?;
    if &e.room != room.address().as_array() { return Err(invalid()); }
    let pda = Address::create_program_address(&[Entry::SEED, &e.room, &e.wallet, &[e.bump]], program).map_err(|_| ProgramError::InvalidSeeds)?;
    exact(a, &pda)?; Ok(e)
}
fn save_room(a: &mut AccountView, r: &Room) -> ProgramResult { r.save(&mut a.try_borrow_mut()?) }
fn save_entry(a: &mut AccountView, e: &Entry) -> ProgramResult { e.save(&mut a.try_borrow_mut()?) }
fn active(r: &Room, now: i64) -> ProgramResult {
    if r.status != OPEN || now >= r.ends_at { return Err(invalid()); } Ok(())
}
fn mint(a: &AccountView, expected: &[u8;32]) -> ProgramResult {
    if !a.owned_by(&pinocchio_token::ID) || a.address().as_array() != expected { return Err(invalid()); }
    let data = a.try_borrow()?;
    // Classic SPL mint, initialized, no freeze authority: operator cannot freeze deposited funds.
    if data.len() != 82 || data[45] != 1 || data[46..50] != [0;4] { return Err(invalid()); }
    Ok(())
}
fn token(a: &AccountView, mint: &Address, wallet: &Address) -> ProgramResult {
    if !a.owned_by(&pinocchio_token::ID) { return Err(ProgramError::InvalidAccountOwner); }
    let data = a.try_borrow()?;
    if data.len() != 165 || &data[..32] != mint.as_ref() || &data[32..64] != wallet.as_ref() || data[108] != 1 { return Err(invalid()); }
    Ok(())
}
fn ata(a: &AccountView, mint: &AccountView, wallet: &AccountView) -> ProgramResult {
    let (pda, _) = Address::find_program_address(&[wallet.address().as_ref(), pinocchio_token::ID.as_ref(), mint.address().as_ref()], &pinocchio_associated_token_account::ID);
    exact(a, &pda)
}
fn pay(r: &Room, room: &AccountView, vault: &AccountView, to: &AccountView, amount: u64) -> ProgramResult {
    let id = r.id.to_le_bytes(); let bump = [r.bump];
    let seeds = [pinocchio::cpi::Seed::from(Room::SEED), pinocchio::cpi::Seed::from(&id), pinocchio::cpi::Seed::from(&bump)];
    pinocchio_token::instructions::Transfer { from: vault, to, authority: room, multisig_signers: &[] as &[&AccountView], amount }
        .invoke_signed(&[pinocchio::cpi::Signer::from(&seeds)])
}
fn initialize_pda(program: &Address, account: &AccountView, payer: &AccountView, size: usize, signers: &[pinocchio::cpi::Signer]) -> ProgramResult {
    // A third party may send lamports to a predictable PDA. Accept prefunding without allowing reinitialization.
    if !account.owned_by(&pinocchio_system::ID) || !account.try_borrow()?.is_empty() { return Err(ProgramError::AccountAlreadyInitialized); }
    let rent = pinocchio::sysvars::rent::Rent::get()?.try_minimum_balance(size)?;
    if account.lamports() < rent {
        pinocchio_system::instructions::Transfer { from: payer, to: account, lamports: rent - account.lamports() }.invoke()?;
    }
    pinocchio_system::instructions::Allocate { account, space: size as u64 }.invoke_signed(signers)?;
    pinocchio_system::instructions::Assign { account, owner: program }.invoke_signed(signers)
}
fn create_entry(program: &Address, receipt: &mut AccountView, room: &AccountView, wallet: &AccountView) -> Result<Entry, ProgramError> {
    let (pda, bump) = Address::find_program_address(&[Entry::SEED, room.address().as_ref(), wallet.address().as_ref()], program);
    exact(receipt, &pda)?;
    // Never reinitialize an existing receipt (including refunded entries).
    let bump_bytes = [bump];
    let seeds = [pinocchio::cpi::Seed::from(Entry::SEED), pinocchio::cpi::Seed::from(room.address().as_ref()), pinocchio::cpi::Seed::from(wallet.address().as_ref()), pinocchio::cpi::Seed::from(&bump_bytes)];
    initialize_pda(program, receipt, wallet, Entry::LEN, &[pinocchio::cpi::Signer::from(&seeds)])?;
    Ok(Entry { room: *room.address().as_array(), wallet: *wallet.address().as_array(), started_at: 0, completed_ms: 0, status: JOINED, bump })
}

pub fn process_instruction(program: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let (&op, args) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match op { 0 => open(program, accounts, args), 1 => join(program, accounts, args),
        2 => start(program, accounts, args), 3 => finish(program, accounts, args),
        4 => settle(program, accounts, args), 5 => refund(program, accounts, args),
        6 => extend(program, accounts, args), _ => Err(ProgramError::InvalidInstructionData) }
}

// 0: room, receipt, mint, source ATA, vault ATA, creator signer, result-authority signer,
// token program, associated-token program, system program. Args: id, stake, end (u64 LE), grid hash (32).
fn open(program: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [room_account, receipt, mint_account, source, vault, creator, authority, token_program, associated_program, system_program] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    if args.len() != 56 { return Err(ProgramError::InvalidInstructionData); }
    signer(creator)?; signer(authority)?;
    exact(token_program, &pinocchio_token::ID)?; exact(associated_program, &pinocchio_associated_token_account::ID)?; exact(system_program, &pinocchio_system::ID)?;
    let id = read_u64(args, 0)?; let stake = read_u64(args, 8)?; let ends_at = read_u64(args, 16)? as i64;
    let now = clock()?;
    if stake == 0 || ends_at <= now || ends_at - now > 365*86400 { return Err(ProgramError::InvalidInstructionData); }
    mint(mint_account, mint_account.address().as_array())?; token(source, mint_account.address(), creator.address())?; ata(source, mint_account, creator)?;
    let (pda, bump) = Address::find_program_address(&[Room::SEED, &id.to_le_bytes()], program);
    exact(room_account, &pda)?;
    let id_bytes = id.to_le_bytes(); let bump_bytes = [bump];
    let seeds = [pinocchio::cpi::Seed::from(Room::SEED), pinocchio::cpi::Seed::from(&id_bytes), pinocchio::cpi::Seed::from(&bump_bytes)];
    initialize_pda(program, room_account, creator, Room::LEN, &[pinocchio::cpi::Signer::from(&seeds)])?;
    let r = Room { id, authority: *authority.address().as_array(), mint: *mint_account.address().as_array(), creator: *creator.address().as_array(), grid: args[24..56].try_into().unwrap(), stake, ends_at, entries: 1, best_ms: u64::MAX, winner: [0;32], status: OPEN, bump };
    ata(vault, mint_account, room_account)?;
    pinocchio_associated_token_account::instructions::CreateIdempotent { funding_account: creator, account: vault, wallet: room_account, mint: mint_account, system_program, token_program }.invoke()?;
    token(vault, mint_account.address(), room_account.address())?;
    let e = create_entry(program, receipt, room_account, creator)?;
    pinocchio_token::instructions::Transfer { from: source, to: vault, authority: creator, multisig_signers: &[] as &[&AccountView], amount: stake }.invoke()?;
    save_entry(receipt, &e)?; save_room(room_account, &r)
}

// 1: room, receipt, mint, source ATA, vault, wallet signer, token program, system program.
fn join(program: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [room_account, receipt, mint_account, source, vault, wallet, token_program, system_program] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    if !args.is_empty() { return Err(ProgramError::InvalidInstructionData); }
    signer(wallet)?; exact(token_program, &pinocchio_token::ID)?; exact(system_program, &pinocchio_system::ID)?;
    let mut r = room(program, room_account)?; active(&r, clock()?)?;
    mint(mint_account, &r.mint)?; ata(vault, mint_account, room_account)?; token(vault, mint_account.address(), room_account.address())?;
    token(source, mint_account.address(), wallet.address())?; ata(source, mint_account, wallet)?;
    r.entries = r.entries.checked_add(1).ok_or(ProgramError::ArithmeticOverflow)?; r.pool()?;
    let e = create_entry(program, receipt, room_account, wallet)?;
    pinocchio_token::instructions::Transfer { from: source, to: vault, authority: wallet, multisig_signers: &[] as &[&AccountView], amount: r.stake }.invoke()?;
    save_entry(receipt, &e)?; save_room(room_account, &r)
}

// 2: room, receipt, wallet signer. Start once, using chain time; no timer reset.
fn start(program: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [room_account, receipt, wallet] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    if !args.is_empty() { return Err(ProgramError::InvalidInstructionData); }
    signer(wallet)?; let r = room(program, room_account)?; let now = clock()?; active(&r, now)?;
    let mut e = entry(program, receipt, room_account)?;
    if wallet.address().as_array() != &e.wallet || e.status != JOINED { return Err(invalid()); }
    e.started_at = now; e.status = STARTED; save_entry(receipt, &e)
}

// 3: room, receipt, authority signer. Args: server-validated elapsed milliseconds.
fn finish(program: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [room_account, receipt, authority] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    if args.len() != 8 { return Err(ProgramError::InvalidInstructionData); }
    signer(authority)?; let mut r = room(program, room_account)?; let now = clock()?; active(&r, now)?;
    if authority.address().as_array() != &r.authority { return Err(ProgramError::MissingRequiredSignature); }
    let mut e = entry(program, receipt, room_account)?; let ms = read_u64(args, 0)?;
    // Chain start bounds the score. Server clock provides finer precision; at most one second of rounding.
    let elapsed = now.checked_sub(e.started_at).ok_or(ProgramError::ArithmeticOverflow)?;
    if e.status != STARTED || elapsed < 15 || ms < 15000 || ms > (elapsed as u64).checked_add(1).and_then(|s| s.checked_mul(1000)).ok_or(ProgramError::ArithmeticOverflow)? { return Err(invalid()); }
    e.completed_ms = ms; e.status = FINISHED;
    if ms < r.best_ms || (ms == r.best_ms && e.wallet < r.winner) { r.best_ms = ms; r.winner = e.wallet; }
    save_entry(receipt, &e)?; save_room(room_account, &r)
}

// 4: room, mint, vault, winner token account, token program. Permissionless after expiry.
fn settle(program: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [room_account, mint_account, vault, destination, token_program] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    if !args.is_empty() { return Err(ProgramError::InvalidInstructionData); }
    let mut r = room(program, room_account)?;
    if r.status != OPEN || clock()? < r.ends_at || r.entries < 2 || r.best_ms == u64::MAX { return Err(invalid()); }
    exact(token_program, &pinocchio_token::ID)?; mint(mint_account, &r.mint)?;
    ata(vault, mint_account, room_account)?; token(vault, mint_account.address(), room_account.address())?;
    token(destination, mint_account.address(), &Address::new_from_array(r.winner))?;
    r.status = PAID; save_room(room_account, &r)?; pay(&r, room_account, vault, destination, r.pool()?)
}

// 5: room, receipt, mint, vault, original wallet token account, token program.
// Permissionless execution always pays the recorded wallet; no redirected refund.
fn refund(program: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [room_account, receipt, mint_account, vault, destination, token_program] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    if !args.is_empty() { return Err(ProgramError::InvalidInstructionData); }
    let mut r = room(program, room_account)?; let mut e = entry(program, receipt, room_account)?;
    if r.status == PAID || clock()? < r.ends_at || (r.entries > 1 && r.best_ms != u64::MAX) || e.status == REFUNDED { return Err(invalid()); }
    exact(token_program, &pinocchio_token::ID)?; mint(mint_account, &r.mint)?;
    ata(vault, mint_account, room_account)?; token(vault, mint_account.address(), room_account.address())?;
    token(destination, mint_account.address(), &Address::new_from_array(e.wallet))?;
    e.status = REFUNDED; r.status = REFUNDING; save_entry(receipt, &e)?; save_room(room_account, &r)?;
    pay(&r, room_account, vault, destination, r.stake)
}

// 6: room, creator signer. Args: new absolute deadline.
fn extend(program: &Address, accounts: &mut [AccountView], args: &[u8]) -> ProgramResult {
    let [room_account, creator] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    if args.len() != 8 { return Err(ProgramError::InvalidInstructionData); }
    signer(creator)?; let mut r = room(program, room_account)?; let now = clock()?; active(&r, now)?;
    let next = read_u64(args, 0)? as i64;
    if creator.address().as_array() != &r.creator || r.entries != 1 || next <= r.ends_at || next - now > 365*86400 { return Err(invalid()); }
    r.ends_at = next; save_room(room_account, &r)
}
