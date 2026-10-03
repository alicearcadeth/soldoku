use pinocchio::{error::ProgramError, sysvars::Sysvar, AccountView, Address, ProgramResult};
use crate::state::{Entry, Room, AWARDED, OPEN, PAID, MAX_GRACE, MAX_PERIOD};

// Dedicated test mint, same as the existing staging fixture. No arbitrary token programs,
// Token-2022 extensions, native SOL or production USDC accepted by this Devnet binary.
const MINT: [u8; 32] = [96,119,233,221,192,114,146,67,101,148,8,12,120,17,124,176,122,28,114,107,50,227,11,22,209,14,153,202,18,249,117,236];
// Dedicated competition test mint. Issuer key stays outside this repository.
const COMPETITION_MINT: [u8; 32] = [161,207,42,27,180,110,159,127,33,8,181,229,90,246,70,156,145,90,166,47,84,94,150,79,68,81,249,187,88,10,247,221];

pub fn process_instruction(program: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let (tag, args) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match (*tag, args.len()) {
        (0, 40) => open(program, accounts, args),
        (1, 0) => join(program, accounts),
        (2, 8) => extend(program, accounts, args),
        (3, 32) => settle(program, accounts, args),
        (4, 0) => claim(program, accounts, false),
        (5, 0) => claim(program, accounts, true),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
fn clock() -> Result<i64, ProgramError> { Ok(pinocchio::sysvars::clock::Clock::get()?.unix_timestamp) }
fn rent_balance(account: &AccountView, size: usize) -> Result<u64, ProgramError> {
    exact(account, &pinocchio::sysvars::rent::RENT_ID)?;
    let data = account.try_borrow()?;
    rent_balance_data(&data, size)
}
fn rent_balance_data(data: &[u8], size: usize) -> Result<u64, ProgramError> {
    // Pre-SIMD-0194 Rent serializes rate/year + f64 exemption threshold + burn.
    // New Rent serializes an already multiplied rate. Never infer layout from rate.
    let rate = match data.len() {
        8 => u64::from_le_bytes(data[..8].try_into().unwrap()),
        17 => {
            let multiplier = if data[8..16] == 1f64.to_bits().to_le_bytes() { 1 }
                else if data[8..16] == 2f64.to_bits().to_le_bytes() { 2 }
                else { return Err(ProgramError::InvalidAccountData); };
            u64::from_le_bytes(data[..8].try_into().unwrap()).checked_mul(multiplier).ok_or(ProgramError::ArithmeticOverflow)?
        },
        _ => return Err(ProgramError::InvalidAccountData),
    };
    (size as u64 + 128).checked_mul(rate).ok_or(ProgramError::ArithmeticOverflow)
}
#[cfg(test)]
mod rent_tests {
    use super::*;
    #[test]
    fn supports_observed_devnet_and_legacy_rent_formats() {
        let mut devnet = 5080u64.to_le_bytes().to_vec();
        devnet.extend_from_slice(&1f64.to_bits().to_le_bytes()); devnet.push(50);
        assert_eq!(rent_balance_data(&devnet, 178).unwrap(), 1_554_480);
        let mut legacy = 3480u64.to_le_bytes().to_vec();
        legacy.extend_from_slice(&2f64.to_bits().to_le_bytes()); legacy.push(50);
        assert_eq!(rent_balance_data(&legacy, 178).unwrap(), 2_129_760);
        assert_eq!(rent_balance_data(&6960u64.to_le_bytes(), 178).unwrap(), 2_129_760);
        devnet[8..16].copy_from_slice(&f64::NAN.to_bits().to_le_bytes());
        assert!(rent_balance_data(&devnet, 178).is_err());
    }
}
fn u64_at(data: &[u8], offset: usize) -> u64 { u64::from_le_bytes(data[offset..offset+8].try_into().unwrap()) }
fn exact(account: &AccountView, address: &Address) -> ProgramResult {
    if account.address() != address { return Err(ProgramError::IncorrectProgramId); } Ok(())
}
fn create_pda(payer: &AccountView, account: &AccountView, owner: &Address, rent: &AccountView,
    size: usize, signers: &[pinocchio::cpi::Signer]) -> ProgramResult {
    if !account.owned_by(&pinocchio_system::ID) || !account.try_borrow()?.is_empty() { return Err(ProgramError::InvalidAccountData); }
    let minimum = rent_balance(rent, size)?;
    if account.lamports() == 0 {
        return pinocchio_system::instructions::CreateAccount { from: payer, to: account,
            lamports: minimum, space: size as u64, owner }.invoke_signed(signers);
    }
    // A third party can pre-fund a public PDA. Allocate/assign it with our PDA
    // signature instead of letting CreateAccount's "already in use" block entry.
    let top_up = minimum.saturating_sub(account.lamports());
    if top_up > 0 { pinocchio_system::instructions::Transfer { from: payer, to: account, lamports: top_up }.invoke()?; }
    pinocchio_system::instructions::Allocate { account, space: size as u64 }.invoke_signed(signers)?;
    pinocchio_system::instructions::Assign { account, owner }.invoke_signed(signers)
}
fn signer(account: &AccountView) -> ProgramResult {
    if !account.is_signer() { return Err(ProgramError::MissingRequiredSignature); } Ok(())
}
fn load(program: &Address, account: &AccountView) -> Result<Room, ProgramError> {
    if !account.owned_by(program) { return Err(ProgramError::InvalidAccountOwner); }
    let r = Room::read(&account.try_borrow()?)?;
    let (expected, bump) = Address::find_program_address(&[Room::SEED, &r.id.to_le_bytes()], program);
    if account.address() != &expected || r.bump != bump { return Err(ProgramError::InvalidSeeds); }
    Ok(r)
}
fn save(account: &mut AccountView, room: &Room) -> ProgramResult { room.write(&mut account.try_borrow_mut()?) }
fn mint_check(mint: &AccountView) -> ProgramResult {
    if (mint.address().as_array() != &MINT && mint.address().as_array() != &COMPETITION_MINT) || !mint.owned_by(&pinocchio_token::ID) {
        return Err(ProgramError::InvalidAccountData);
    }
    let data = mint.try_borrow()?;
    // Standard SPL Mint: initialized, no freeze authority. Extensions are excluded.
    if data.len() != 82 || data[45] != 1 || data[46..50] != [0; 4] { return Err(ProgramError::InvalidAccountData); }
    Ok(())
}
fn ata(wallet: &Address, mint: &AccountView, account: &AccountView) -> ProgramResult {
    let (expected, _) = Address::find_program_address(&[wallet.as_ref(), pinocchio_token::ID.as_ref(), mint.address().as_ref()], &pinocchio_associated_token_account::ID);
    if account.address() != &expected || !account.owned_by(&pinocchio_token::ID) { return Err(ProgramError::InvalidAccountData); }
    let data = account.try_borrow()?;
    if data.len() != 165 || &data[..32] != mint.address().as_ref() || &data[32..64] != wallet.as_ref() || data[108] != 1 {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}
fn entry(program: &Address, account: &AccountView, room: &AccountView, wallet: &[u8; 32]) -> Result<Entry, ProgramError> {
    if !account.owned_by(program) { return Err(ProgramError::InvalidAccountOwner); }
    let (expected, _) = Address::find_program_address(&[Entry::SEED, room.address().as_ref(), wallet], program);
    if account.address() != &expected { return Err(ProgramError::InvalidSeeds); }
    let e = Entry::read(&account.try_borrow()?)?;
    if e.room != *room.address().as_array() || e.wallet != *wallet { return Err(ProgramError::InvalidAccountData); }
    Ok(e)
}

// 0 room PDA, 1 creator signer/payer, 2 authority signer, 3 mint, 4 system, 5 rent.
// Args: id u64, stake u64, join_deadline i64, deadline i64, refund_at i64.
// The creator's Join must be in the same transaction in the application.
fn open(program: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [room_account, creator, authority, mint, system, rent] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    signer(creator)?; signer(authority)?; exact(system, &pinocchio_system::ID)?; mint_check(mint)?;
    let id = u64_at(data, 0); let stake = u64_at(data, 8);
    let join_deadline = u64_at(data, 16) as i64;
    let deadline = u64_at(data, 24) as i64; let refund_at = u64_at(data, 32) as i64; let now = clock()?;
    let period = join_deadline.checked_sub(now).ok_or(ProgramError::ArithmeticOverflow)?;
    let play = deadline.checked_sub(join_deadline).ok_or(ProgramError::ArithmeticOverflow)?;
    let grace = refund_at.checked_sub(deadline).ok_or(ProgramError::ArithmeticOverflow)?;
    if stake == 0 || period < 60 || period > MAX_PERIOD || play < 15 || play > MAX_GRACE || grace < 60 || grace > MAX_GRACE {
        return Err(ProgramError::InvalidInstructionData);
    }
    let id_bytes = id.to_le_bytes();
    let (expected, bump) = Address::find_program_address(&[Room::SEED, &id_bytes], program);
    if room_account.address() != &expected { return Err(ProgramError::InvalidSeeds); }
    let bump_bytes = [bump];
    let seeds = [pinocchio::cpi::Seed::from(Room::SEED), pinocchio::cpi::Seed::from(&id_bytes), pinocchio::cpi::Seed::from(&bump_bytes)];
    let signers = [pinocchio::cpi::Signer::from(&seeds)];
    create_pda(creator, room_account, program, rent, Room::LEN, &signers)?;
    save(room_account, &Room { id, creator: *creator.address().as_array(), authority: *authority.address().as_array(), mint: *mint.address().as_array(),
        stake, join_deadline, deadline, refund_at, entrants: 0, winner: [0; 32], status: OPEN, bump, head: [0; 32] })
}

// 0 room, 1 entry PDA, 2 mint, 3 player ATA, 4 vault ATA, 5 player signer/payer,
// 6 SPL Token program, 7 associated token program, 8 system program, 9 rent.
fn join(program: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [room_account, entry_account, mint, player_token, vault, player, token, associated, system, rent] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    signer(player)?; exact(token, &pinocchio_token::ID)?; exact(associated, &pinocchio_associated_token_account::ID)?;
    exact(system, &pinocchio_system::ID)?; mint_check(mint)?;
    let mut r = load(program, room_account)?;
    // Existing deployed rooms retain their claims; new registration uses linked entries.
    if room_account.try_borrow()?.len() != Room::LEN { return Err(ProgramError::InvalidAccountData); }
    if r.mint != *mint.address().as_array() || (r.entrants == 0 && r.creator != *player.address().as_array()) {
        return Err(ProgramError::InvalidAccountData);
    }
    r.join(clock()?)?; ata(player.address(), mint, player_token)?;
    let (expected, bump) = Address::find_program_address(&[Entry::SEED, room_account.address().as_ref(), player.address().as_ref()], program);
    if entry_account.address() != &expected { return Err(ProgramError::InvalidSeeds); }
    // Existing entries are permanent tombstones, including after a refund. Creation fails on replay.
    let bump_bytes = [bump];
    let seeds = [pinocchio::cpi::Seed::from(Entry::SEED), pinocchio::cpi::Seed::from(room_account.address().as_ref()),
        pinocchio::cpi::Seed::from(player.address().as_ref()), pinocchio::cpi::Seed::from(&bump_bytes)];
    let signers = [pinocchio::cpi::Signer::from(&seeds)];
    create_pda(player, entry_account, program, rent, Entry::LEN, &signers)?;
    pinocchio_associated_token_account::instructions::CreateIdempotent { funding_account: player, account: vault, wallet: room_account,
        mint, system_program: system, token_program: token }.invoke()?;
    ata(room_account.address(), mint, vault)?;
    pinocchio_token::instructions::Transfer { from: player_token, to: vault, authority: player, multisig_signers: &[] as &[&AccountView], amount: r.stake }.invoke()?;
    Entry { room: *room_account.address().as_array(), wallet: *player.address().as_array(), claimed: false, next: r.head }.write(&mut entry_account.try_borrow_mut()?)?;
    r.head = *entry_account.address().as_array();
    save(room_account, &r)
}

// 0 room, 1 creator signer. No extension after another wallet's deposit.
fn extend(program: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [room_account, creator] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    signer(creator)?; let mut r = load(program, room_account)?;
    if r.creator != *creator.address().as_array() { return Err(ProgramError::MissingRequiredSignature); }
    r.extend(u64_at(data, 0) as i64, clock()?)?; save(room_account, &r)
}

// 0 room, 1 authority signer, 2 winner entry. For refunds, account 2 is the room itself.
// Authority attests server-verified rankings. Cannot settle before end or override an outcome.
fn settle(program: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [room_account, authority, winner_entry] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    signer(authority)?; let mut r = load(program, room_account)?;
    if r.authority != *authority.address().as_array() { return Err(ProgramError::MissingRequiredSignature); }
    let winner: [u8; 32] = data.try_into().unwrap();
    if winner != [0; 32] { entry(program, winner_entry, room_account, &winner)?; }
    r.settle(winner, clock()?)?; save(room_account, &r)
}

// 0 room, 1 entry, 2 mint, 3 recipient ATA, 4 vault ATA, 5 SPL Token program.
// Permissionless keeper claim: destination is fixed to the entrant, never the caller.
fn claim(program: &Address, accounts: &mut [AccountView], refund: bool) -> ProgramResult {
    let [room_account, entry_account, mint, recipient, vault, token] = accounts else { return Err(ProgramError::NotEnoughAccountKeys); };
    exact(token, &pinocchio_token::ID)?; mint_check(mint)?;
    let mut r = load(program, room_account)?;
    if r.mint != *mint.address().as_array() { return Err(ProgramError::InvalidAccountData); }
    let raw = Entry::read(&entry_account.try_borrow()?)?;
    let mut e = entry(program, entry_account, room_account, &raw.wallet)?;
    if refund { r.refund(clock()?)?; } else if (r.status != AWARDED && r.status != PAID) || r.winner != e.wallet {
        return Err(ProgramError::InvalidAccountData);
    }
    let wallet = Address::new_from_array(e.wallet);
    ata(&wallet, mint, recipient)?; ata(room_account.address(), mint, vault)?;
    if e.claimed { return Ok(()); } // Retries never transfer twice.
    let amount = if refund { r.stake } else { r.pool()? };
    e.claimed = true;
    if !refund { r.status = PAID; }
    save(room_account, &r)?; e.write(&mut entry_account.try_borrow_mut()?)?;
    let id_bytes = r.id.to_le_bytes(); let bump_bytes = [r.bump];
    let seeds = [pinocchio::cpi::Seed::from(Room::SEED), pinocchio::cpi::Seed::from(&id_bytes), pinocchio::cpi::Seed::from(&bump_bytes)];
    let signers = [pinocchio::cpi::Signer::from(&seeds)];
    pinocchio_token::instructions::Transfer { from: vault, to: recipient, authority: room_account,
        multisig_signers: &[] as &[&AccountView], amount }.invoke_signed(&signers)
}
