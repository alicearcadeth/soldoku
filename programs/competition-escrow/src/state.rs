use pinocchio::error::ProgramError;

pub const OPEN: u8 = 0;
pub const PAID: u8 = 1;
pub const REFUNDING: u8 = 2;
pub const JOINED: u8 = 0;
pub const STARTED: u8 = 1;
pub const FINISHED: u8 = 2;
pub const REFUNDED: u8 = 3;

pub struct Room {
    pub id: u64,
    pub authority: [u8; 32],
    pub mint: [u8; 32],
    pub creator: [u8; 32],
    pub grid: [u8; 32],
    pub stake: u64,
    pub ends_at: i64,
    pub entries: u64,
    pub best_ms: u64,
    pub winner: [u8; 32],
    pub status: u8,
    pub bump: u8,
}

fn num(src: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(src[offset..offset + 8].try_into().unwrap())
}

impl Room {
    pub const LEN: usize = 210;
    pub const SEED: &'static [u8] = b"competition";
    pub fn load(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() != Self::LEN || &src[..8] != b"SOLCOMP1" {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self {
            id: num(src, 8), authority: src[16..48].try_into().unwrap(),
            mint: src[48..80].try_into().unwrap(), creator: src[80..112].try_into().unwrap(),
            grid: src[112..144].try_into().unwrap(), stake: num(src, 144),
            ends_at: num(src, 152) as i64, entries: num(src, 160), best_ms: num(src, 168),
            winner: src[176..208].try_into().unwrap(), status: src[208], bump: src[209],
        })
    }
    pub fn save(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() != Self::LEN { return Err(ProgramError::AccountDataTooSmall); }
        dst[..8].copy_from_slice(b"SOLCOMP1");
        dst[8..16].copy_from_slice(&self.id.to_le_bytes());
        dst[16..48].copy_from_slice(&self.authority);
        dst[48..80].copy_from_slice(&self.mint);
        dst[80..112].copy_from_slice(&self.creator);
        dst[112..144].copy_from_slice(&self.grid);
        dst[144..152].copy_from_slice(&self.stake.to_le_bytes());
        dst[152..160].copy_from_slice(&self.ends_at.to_le_bytes());
        dst[160..168].copy_from_slice(&self.entries.to_le_bytes());
        dst[168..176].copy_from_slice(&self.best_ms.to_le_bytes());
        dst[176..208].copy_from_slice(&self.winner);
        dst[208] = self.status; dst[209] = self.bump;
        Ok(())
    }
    pub fn pool(&self) -> Result<u64, ProgramError> {
        self.stake.checked_mul(self.entries).ok_or(ProgramError::ArithmeticOverflow)
    }
}

pub struct Entry {
    pub room: [u8; 32],
    pub wallet: [u8; 32],
    pub started_at: i64,
    pub completed_ms: u64,
    pub status: u8,
    pub bump: u8,
}
impl Entry {
    pub const LEN: usize = 90;
    pub const SEED: &'static [u8] = b"entry";
    pub fn load(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() != Self::LEN || &src[..8] != b"SOLENTR1" {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self { room: src[8..40].try_into().unwrap(), wallet: src[40..72].try_into().unwrap(),
            started_at: num(src, 72) as i64, completed_ms: num(src, 80), status: src[88], bump: src[89] })
    }
    pub fn save(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() != Self::LEN { return Err(ProgramError::AccountDataTooSmall); }
        dst[..8].copy_from_slice(b"SOLENTR1"); dst[8..40].copy_from_slice(&self.room);
        dst[40..72].copy_from_slice(&self.wallet); dst[72..80].copy_from_slice(&self.started_at.to_le_bytes());
        dst[80..88].copy_from_slice(&self.completed_ms.to_le_bytes()); dst[88] = self.status; dst[89] = self.bump;
        Ok(())
    }
}
