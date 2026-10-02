use pinocchio::{error::ProgramError, sysvars::Sysvar, AccountView, Address, ProgramResult};
use pinocchio_log::log;

use crate::state::Match;

pub fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let (discriminator, args) = instruction_data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match *discriminator {
        0 => {
            log!("Instruction: Open");
            open(program_id, accounts, args)
        }
        1 => {
            log!("Instruction: Join");
            join(program_id, accounts)
        }
        2 => {
            log!("Instruction: Settle");
            settle(program_id, accounts, args)
        }
        3 => {
            log!("Instruction: Cancel");
            cancel(program_id, accounts)
        }
        4 => {
            log!("Instruction: Close");
            close_finished(program_id, accounts)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn read_u64(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    let bytes: [u8; 8] = data.get(offset..offset + 8).ok_or(ProgramError::InvalidInstructionData)?.try_into().unwrap();
    Ok(u64::from_le_bytes(bytes))
}

fn read_i64(data: &[u8], offset: usize) -> Result<i64, ProgramError> {
    Ok(read_u64(data, offset)? as i64)
}

fn load_match(account: &AccountView) -> Result<Match, ProgramError> {
    Match::deserialize(&account.try_borrow()?)
}

fn save_match(account: &mut AccountView, record: &Match) -> Result<(), ProgramError> {
    record.serialize(&mut account.try_borrow_mut()?)
}

fn assert_ata(wallet: &Address, mint: &AccountView, token_account: &AccountView) -> Result<(), ProgramError> {
    let (expected, _) = Address::find_program_address(
        &[wallet.as_ref(), pinocchio_token::ID.as_ref(), mint.address().as_ref()],
        &pinocchio_associated_token_account::ID,
    );
    if token_account.address() != &expected {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn assert_vault(match_account: &AccountView, mint: &AccountView, vault: &AccountView) -> Result<(), ProgramError> {
    let (expected, _) = Address::find_program_address(
        &[match_account.address().as_ref(), pinocchio_token::ID.as_ref(), mint.address().as_ref()],
        &pinocchio_associated_token_account::ID,
    );
    if vault.address() != &expected {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn assert_exact_program(account: &AccountView, expected: &Address) -> Result<(), ProgramError> {
    if account.address() != expected {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

fn assert_settlement_mint(mint: &AccountView) -> Result<(), ProgramError> {
    if mint.address().as_array() != &crate::settlement::SETTLEMENT_MINT {
        return Err(ProgramError::InvalidAccountData);
    }
    if !mint.owned_by(&pinocchio_token::ID) {
        return Err(ProgramError::InvalidAccountOwner);
    }
    Ok(())
}

fn assert_record_mint(record: &Match, mint: &AccountView) -> Result<(), ProgramError> {
    assert_settlement_mint(mint)?;
    if &record.mint != mint.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn assert_token_account(account: &AccountView, mint: &Address, owner: &Address) -> Result<(), ProgramError> {
    if !account.owned_by(&pinocchio_token::ID) {
        return Err(ProgramError::InvalidAccountOwner);
    }
    let data = account.try_borrow()?;
    let stored_mint = data.get(..32).ok_or(ProgramError::InvalidAccountData)?;
    let stored_owner = data.get(32..64).ok_or(ProgramError::InvalidAccountData)?;
    if stored_mint != mint.as_ref() || stored_owner != owner.as_ref() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn signer_seeds(record: &Match) -> ([u8; 8], [u8; 1]) {
    (record.id.to_le_bytes(), [record.bump])
}

/// Accounts:
/// 0 match PDA, 1 mint, 2 player A token, 3 vault, 4 player A signer,
/// 5 authority signer, 6 token program, 7 associated token program, 8 system program
/// Data: id u64, stake u64, join_deadline i64, settle_deadline i64, bump u8
fn open(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [match_account, mint, player_token, vault, player, authority, token_program, associated_token_program, system_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    // The stored settlement key has to sign. A client cannot swap it in after the fact.
    if !player.is_signer() || !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let id = read_u64(data, 0)?;
    let stake = read_u64(data, 8)?;
    let join_deadline = read_i64(data, 16)?;
    let settle_deadline = read_i64(data, 24)?;
    let bump = *data.get(32).ok_or(ProgramError::InvalidInstructionData)?;
    if stake == 0 || stake > u64::MAX / 2 || settle_deadline <= join_deadline {
        return Err(ProgramError::InvalidInstructionData);
    }
    assert_settlement_mint(mint)?;
    assert_exact_program(token_program, &pinocchio_token::ID)?;
    assert_exact_program(associated_token_program, &pinocchio_associated_token_account::ID)?;
    assert_exact_program(system_program, &pinocchio_system::ID)?;
    assert_token_account(player_token, mint.address(), player.address())?;
    let now = pinocchio::sysvars::clock::Clock::get()?.unix_timestamp;
    if join_deadline <= now {
        return Err(ProgramError::InvalidInstructionData);
    }

    let id_bytes = id.to_le_bytes();
    let bump_bytes = [bump];
    let pda = Address::create_program_address(&[Match::SEED_PREFIX, &id_bytes, &bump_bytes], program_id)
        .map_err(|_| ProgramError::InvalidSeeds)?;
    if match_account.address() != &pda {
        return Err(ProgramError::InvalidSeeds);
    }
    assert_ata(player.address(), mint, player_token)?;

    let lamports = pinocchio::sysvars::rent::Rent::get()?.try_minimum_balance(Match::LEN)?;
    let seeds = [
        pinocchio::cpi::Seed::from(Match::SEED_PREFIX),
        pinocchio::cpi::Seed::from(&id_bytes),
        pinocchio::cpi::Seed::from(&bump_bytes),
    ];
    let signers = [pinocchio::cpi::Signer::from(&seeds)];
    pinocchio_system::instructions::CreateAccount {
        from: player,
        to: match_account,
        lamports,
        space: Match::LEN as u64,
        owner: program_id,
    }
    .invoke_signed(&signers)?;

    pinocchio_associated_token_account::instructions::CreateIdempotent {
        funding_account: player,
        account: vault,
        wallet: match_account,
        mint,
        system_program,
        token_program,
    }
    .invoke()?;

    pinocchio_token::instructions::Transfer {
        from: player_token,
        to: vault,
        authority: player,
        multisig_signers: &[] as &[&AccountView],
        amount: stake,
    }
    .invoke()?;
    assert_token_account(vault, mint.address(), match_account.address())?;

    save_match(
        match_account,
        &Match {
            id,
            authority: *authority.address().as_array(),
            mint: *mint.address().as_array(),
            player_a: *player.address().as_array(),
            player_b: [0; 32],
            stake,
            join_deadline,
            settle_deadline,
            status: crate::state::STATUS_WAITING,
            outcome: crate::state::OUTCOME_NONE,
            bump,
        },
    )?;
    Ok(())
}

/// Accounts: 0 match, 1 mint, 2 player B token, 3 vault, 4 player B signer, 5 token program
fn join(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [match_account, mint, player_token, vault, player, token_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !player.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mut record = load_match(match_account)?;
    if record.status != crate::state::STATUS_WAITING {
        return Err(ProgramError::InvalidAccountData);
    }
    assert_exact_program(token_program, &pinocchio_token::ID)?;
    assert_record_mint(&record, mint)?;
    if record.player_a == *player.address().as_array() {
        return Err(ProgramError::InvalidAccountData);
    }
    let now = pinocchio::sysvars::clock::Clock::get()?.unix_timestamp;
    if now >= record.join_deadline {
        return Err(ProgramError::InvalidAccountData);
    }
    check_pda(program_id, match_account, &record)?;
    assert_ata(player.address(), mint, player_token)?;
    assert_token_account(player_token, mint.address(), player.address())?;
    assert_vault(match_account, mint, vault)?;
    assert_token_account(vault, mint.address(), match_account.address())?;

    pinocchio_token::instructions::Transfer {
        from: player_token,
        to: vault,
        authority: player,
        multisig_signers: &[] as &[&AccountView],
        amount: record.stake,
    }
    .invoke()?;

    record.player_b = *player.address().as_array();
    record.status = crate::state::STATUS_ACTIVE;
    save_match(match_account, &record)
}

/// Accounts: 0 match, 1 mint, 2 vault, 3 player A token, 4 player B token, 5 authority signer, 6 token program
/// Data: outcome u8 (1 = A, 2 = B, 3 = draw)
fn settle(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let [match_account, mint, vault, token_a, token_b, authority, token_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_exact_program(token_program, &pinocchio_token::ID)?;
    let mut record = load_match(match_account)?;
    if &record.authority != authority.address().as_array() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_record_mint(&record, mint)?;
    if record.status == crate::state::STATUS_SETTLED {
        return Ok(());
    }
    if record.status != crate::state::STATUS_ACTIVE {
        return Err(ProgramError::InvalidAccountData);
    }
    let outcome = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    if outcome != crate::state::OUTCOME_A && outcome != crate::state::OUTCOME_B && outcome != crate::state::OUTCOME_DRAW {
        return Err(ProgramError::InvalidInstructionData);
    }
    check_pda(program_id, match_account, &record)?;
    assert_vault(match_account, mint, vault)?;
    assert_token_account(vault, mint.address(), match_account.address())?;
    let player_a = Address::new_from_array(record.player_a);
    let player_b = Address::new_from_array(record.player_b);
    assert_ata(&player_a, mint, token_a)?;
    assert_ata(&player_b, mint, token_b)?;
    assert_token_account(token_a, mint.address(), &player_a)?;
    assert_token_account(token_b, mint.address(), &player_b)?;

    record.status = crate::state::STATUS_SETTLED;
    record.outcome = outcome;
    save_match(match_account, &record)?;

    let (id_bytes, bump_bytes) = signer_seeds(&record);
    let seeds = [
        pinocchio::cpi::Seed::from(Match::SEED_PREFIX),
        pinocchio::cpi::Seed::from(&id_bytes),
        pinocchio::cpi::Seed::from(&bump_bytes),
    ];
    let signers = [pinocchio::cpi::Signer::from(&seeds)];
    let pay = |to: &AccountView, amount: u64| {
        pinocchio_token::instructions::Transfer {
            from: vault,
            to,
            authority: match_account,
            multisig_signers: &[] as &[&AccountView],
            amount,
        }
        .invoke_signed(&signers)
    };
    match outcome {
        crate::state::OUTCOME_A => pay(token_a, pool(record.stake)?)?,
        crate::state::OUTCOME_B => pay(token_b, pool(record.stake)?)?,
        _ => {
            pay(token_a, record.stake)?;
            pay(token_b, record.stake)?;
        }
    }
    Ok(())
}

/// Accounts: 0 match, 1 mint, 2 vault, 3 player A token, 4 player B token or unused, 5 player signer, 6 token program
fn cancel(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [match_account, mint, vault, token_a, token_b, player, token_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !player.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let mut record = load_match(match_account)?;
    if record.status == crate::state::STATUS_CANCELLED {
        return Ok(());
    }
    if record.status == crate::state::STATUS_SETTLED {
        return Err(ProgramError::InvalidAccountData);
    }
    let signer = *player.address().as_array();
    if signer != record.player_a && signer != record.player_b {
        return Err(ProgramError::MissingRequiredSignature);
    }
    assert_exact_program(token_program, &pinocchio_token::ID)?;
    assert_record_mint(&record, mint)?;
    let now = pinocchio::sysvars::clock::Clock::get()?.unix_timestamp;
    check_pda(program_id, match_account, &record)?;
    assert_vault(match_account, mint, vault)?;
    assert_token_account(vault, mint.address(), match_account.address())?;
    let player_a = Address::new_from_array(record.player_a);
    assert_ata(&player_a, mint, token_a)?;
    assert_token_account(token_a, mint.address(), &player_a)?;

    let waiting = record.status == crate::state::STATUS_WAITING;
    if waiting && now < record.join_deadline {
        return Err(ProgramError::InvalidAccountData);
    }
    if !waiting && now < record.settle_deadline {
        return Err(ProgramError::InvalidAccountData);
    }
    if !waiting {
        let player_b = Address::new_from_array(record.player_b);
        assert_ata(&player_b, mint, token_b)?;
        assert_token_account(token_b, mint.address(), &player_b)?;
        record.outcome = crate::state::OUTCOME_DRAW;
    }
    let stake = record.stake;
    record.status = crate::state::STATUS_CANCELLED;
    let (id_bytes, bump_bytes) = signer_seeds(&record);
    save_match(match_account, &record)?;

    let seeds = [
        pinocchio::cpi::Seed::from(Match::SEED_PREFIX),
        pinocchio::cpi::Seed::from(&id_bytes),
        pinocchio::cpi::Seed::from(&bump_bytes),
    ];
    let signers = [pinocchio::cpi::Signer::from(&seeds)];
    pinocchio_token::instructions::Transfer {
        from: vault,
        to: token_a,
        authority: match_account,
        multisig_signers: &[] as &[&AccountView],
        amount: stake,
    }
    .invoke_signed(&signers)?;
    if !waiting {
        pinocchio_token::instructions::Transfer {
            from: vault,
            to: token_b,
            authority: match_account,
            multisig_signers: &[] as &[&AccountView],
            amount: stake,
        }
        .invoke_signed(&signers)?;
    }
    Ok(())
}

fn pool(stake: u64) -> Result<u64, ProgramError> {
    stake.checked_mul(2).ok_or(ProgramError::ArithmeticOverflow)
}

fn token_amount(account: &AccountView) -> Result<u64, ProgramError> {
    let data = account.try_borrow()?;
    let bytes: [u8; 8] = data.get(64..72).ok_or(ProgramError::InvalidAccountData)?.try_into().unwrap();
    Ok(u64::from_le_bytes(bytes))
}

/// Accounts: 0 match, 1 mint, 2 vault, 3 player A signer, 4 token program.
/// Returns the match-account rent and the empty vault rent to the opener.
/// The deployed Devnet programs do not include this instruction.
fn close_finished(program_id: &Address, accounts: &mut [AccountView]) -> ProgramResult {
    let [match_account, mint, vault, player, token_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    if !player.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let record = load_match(match_account)?;
    if record.status != crate::state::STATUS_SETTLED && record.status != crate::state::STATUS_CANCELLED {
        return Err(ProgramError::InvalidAccountData);
    }
    if player.address().as_array() != &record.player_a {
        return Err(ProgramError::MissingRequiredSignature);
    }
    check_pda(program_id, match_account, &record)?;
    assert_exact_program(token_program, &pinocchio_token::ID)?;
    assert_record_mint(&record, mint)?;
    assert_vault(match_account, mint, vault)?;
    assert_token_account(vault, mint.address(), match_account.address())?;
    if token_amount(vault)? != 0 {
        return Err(ProgramError::InvalidAccountData);
    }

    let (id_bytes, bump_bytes) = signer_seeds(&record);
    let seeds = [
        pinocchio::cpi::Seed::from(Match::SEED_PREFIX),
        pinocchio::cpi::Seed::from(&id_bytes),
        pinocchio::cpi::Seed::from(&bump_bytes),
    ];
    let signers = [pinocchio::cpi::Signer::from(&seeds)];
    pinocchio_token::instructions::CloseAccount {
        account: vault,
        destination: player,
        authority: match_account,
        multisig_signers: &[] as &[&AccountView],
    }
    .invoke_signed(&signers)?;

    let rent = match_account.lamports();
    let returned = player.lamports().checked_add(rent).ok_or(ProgramError::ArithmeticOverflow)?;
    player.set_lamports(returned);
    match_account.set_lamports(0);
    match_account.close()
}

fn check_pda(program_id: &Address, match_account: &AccountView, record: &Match) -> Result<(), ProgramError> {
    if !match_account.owned_by(program_id) {
        return Err(ProgramError::InvalidAccountOwner);
    }
    let id_bytes = record.id.to_le_bytes();
    let bump_bytes = [record.bump];
    let pda = Address::create_program_address(&[Match::SEED_PREFIX, &id_bytes, &bump_bytes], program_id)
        .map_err(|_| ProgramError::InvalidSeeds)?;
    if match_account.address() != &pda {
        Err(ProgramError::InvalidSeeds)
    } else {
        Ok(())
    }
}
