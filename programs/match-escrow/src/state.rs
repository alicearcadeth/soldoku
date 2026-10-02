use pinocchio::error::ProgramError;

pub const STATUS_WAITING: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_SETTLED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;

pub const OUTCOME_NONE: u8 = 0;
pub const OUTCOME_A: u8 = 1;
pub const OUTCOME_B: u8 = 2;
pub const OUTCOME_DRAW: u8 = 3;

/// Match vault record.
/// Layout: id, authority, mint, player_a, player_b, stake, join_deadline,
/// settle_deadline, status, outcome, bump.
pub struct Match {
    pub id: u64,
    pub authority: [u8; 32],
    pub mint: [u8; 32],
    pub player_a: [u8; 32],
    pub player_b: [u8; 32],
    pub stake: u64,
    pub join_deadline: i64,
    pub settle_deadline: i64,
    pub status: u8,
    pub outcome: u8,
    pub bump: u8,
}

impl Match {
    pub const SEED_PREFIX: &'static [u8] = b"match";
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1;

    pub fn serialize(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        let dst = dst.get_mut(..Self::LEN).ok_or(ProgramError::AccountDataTooSmall)?;
        dst[0..8].copy_from_slice(&self.id.to_le_bytes());
        dst[8..40].copy_from_slice(&self.authority);
        dst[40..72].copy_from_slice(&self.mint);
        dst[72..104].copy_from_slice(&self.player_a);
        dst[104..136].copy_from_slice(&self.player_b);
        dst[136..144].copy_from_slice(&self.stake.to_le_bytes());
        dst[144..152].copy_from_slice(&self.join_deadline.to_le_bytes());
        dst[152..160].copy_from_slice(&self.settle_deadline.to_le_bytes());
        dst[160] = self.status;
        dst[161] = self.outcome;
        dst[162] = self.bump;
        Ok(())
    }

    pub fn deserialize(src: &[u8]) -> Result<Self, ProgramError> {
        let src = src.get(..Self::LEN).ok_or(ProgramError::InvalidAccountData)?;
        Ok(Self {
            id: u64::from_le_bytes(src[0..8].try_into().unwrap()),
            authority: src[8..40].try_into().unwrap(),
            mint: src[40..72].try_into().unwrap(),
            player_a: src[72..104].try_into().unwrap(),
            player_b: src[104..136].try_into().unwrap(),
            stake: u64::from_le_bytes(src[136..144].try_into().unwrap()),
            join_deadline: i64::from_le_bytes(src[144..152].try_into().unwrap()),
            settle_deadline: i64::from_le_bytes(src[152..160].try_into().unwrap()),
            status: src[160],
            outcome: src[161],
            bump: src[162],
        })
    }
}
