use pinocchio::error::ProgramError;

pub const OPEN: u8 = 0;
pub const AWARDED: u8 = 1;
pub const REFUNDING: u8 = 2;
pub const PAID: u8 = 3;
pub const MAX_PERIOD: i64 = 365 * 86400;
pub const MAX_GRACE: i64 = 86400;

/// Fixed-size room plus one immutable PDA entry per wallet. No entrant array.
pub struct Room {
    pub id: u64,
    pub creator: [u8; 32],
    pub authority: [u8; 32],
    pub mint: [u8; 32],
    pub stake: u64,
    pub join_deadline: i64,
    pub deadline: i64,
    pub refund_at: i64,
    pub entrants: u64,
    pub winner: [u8; 32],
    pub status: u8,
    pub bump: u8,
    pub head: [u8; 32],
}

impl Room {
    pub const LEGACY_LEN: usize = 178;
    pub const LEN: usize = 210;
    pub const SEED: &'static [u8] = b"competition";
    pub fn read(src: &[u8]) -> Result<Self, ProgramError> {
        if (src.len() != Self::LEN && src.len() != Self::LEGACY_LEN) || src[176] > PAID { return Err(ProgramError::InvalidAccountData); }
        Ok(Self {
            id: u64::from_le_bytes(src[0..8].try_into().unwrap()),
            creator: src[8..40].try_into().unwrap(),
            authority: src[40..72].try_into().unwrap(),
            mint: src[72..104].try_into().unwrap(),
            stake: u64::from_le_bytes(src[104..112].try_into().unwrap()),
            join_deadline: i64::from_le_bytes(src[112..120].try_into().unwrap()),
            deadline: i64::from_le_bytes(src[120..128].try_into().unwrap()),
            refund_at: i64::from_le_bytes(src[128..136].try_into().unwrap()),
            entrants: u64::from_le_bytes(src[136..144].try_into().unwrap()),
            winner: src[144..176].try_into().unwrap(),
            status: src[176], bump: src[177],
            head: if src.len() == Self::LEN { src[178..210].try_into().unwrap() } else { [0; 32] },
        })
    }
    pub fn write(&self, dst: &mut [u8]) -> Result<(), ProgramError> {
        if dst.len() != Self::LEN && (dst.len() != Self::LEGACY_LEN || self.head != [0; 32]) { return Err(ProgramError::AccountDataTooSmall); }
        dst.fill(0);
        dst[0..8].copy_from_slice(&self.id.to_le_bytes());
        dst[8..40].copy_from_slice(&self.creator);
        dst[40..72].copy_from_slice(&self.authority);
        dst[72..104].copy_from_slice(&self.mint);
        dst[104..112].copy_from_slice(&self.stake.to_le_bytes());
        dst[112..120].copy_from_slice(&self.join_deadline.to_le_bytes());
        dst[120..128].copy_from_slice(&self.deadline.to_le_bytes());
        dst[128..136].copy_from_slice(&self.refund_at.to_le_bytes());
        dst[136..144].copy_from_slice(&self.entrants.to_le_bytes());
        dst[144..176].copy_from_slice(&self.winner);
        dst[176] = self.status; dst[177] = self.bump;
        if dst.len() == Self::LEN { dst[178..210].copy_from_slice(&self.head); }
        Ok(())
    }
    pub fn pool(&self) -> Result<u64, ProgramError> {
        self.stake.checked_mul(self.entrants).ok_or(ProgramError::ArithmeticOverflow)
    }
    pub fn join(&mut self, now: i64) -> Result<(), ProgramError> {
        if self.status != OPEN || now >= self.join_deadline { return Err(ProgramError::InvalidAccountData); }
        let next = self.entrants.checked_add(1).ok_or(ProgramError::ArithmeticOverflow)?;
        self.stake.checked_mul(next).ok_or(ProgramError::ArithmeticOverflow)?;
        self.entrants = next;
        Ok(())
    }
    pub fn extend(&mut self, join_deadline: i64, now: i64) -> Result<(), ProgramError> {
        if self.status != OPEN || now >= self.join_deadline || self.entrants != 1 || join_deadline <= self.join_deadline
            || join_deadline.checked_sub(now).ok_or(ProgramError::ArithmeticOverflow)? > MAX_PERIOD {
            return Err(ProgramError::InvalidInstructionData);
        }
        let extra = join_deadline.checked_sub(self.join_deadline).ok_or(ProgramError::ArithmeticOverflow)?;
        let deadline = self.deadline.checked_add(extra).ok_or(ProgramError::ArithmeticOverflow)?;
        let refund_at = self.refund_at.checked_add(extra).ok_or(ProgramError::ArithmeticOverflow)?;
        self.join_deadline = join_deadline;
        self.deadline = deadline;
        self.refund_at = refund_at;
        Ok(())
    }
    pub fn settle(&mut self, winner: [u8; 32], now: i64) -> Result<(), ProgramError> {
        if self.status != OPEN || now < self.deadline || now >= self.refund_at {
            return Err(ProgramError::InvalidAccountData);
        }
        if winner == [0; 32] || self.entrants < 2 {
            self.status = REFUNDING;
        } else {
            self.winner = winner;
            self.status = AWARDED;
        }
        Ok(())
    }
    pub fn refund(&mut self, now: i64) -> Result<(), ProgramError> {
        if self.status == OPEN && (now >= self.refund_at || (self.entrants == 1 && now >= self.join_deadline)) {
            self.status = REFUNDING;
        }
        if self.status != REFUNDING { return Err(ProgramError::InvalidAccountData); }
        Ok(())
    }
}

pub struct Entry { pub room: [u8; 32], pub wallet: [u8; 32], pub claimed: bool, pub next: [u8; 32] }
impl Entry {
    pub const LEGACY_LEN: usize = 65;
    pub const LEN: usize = 97;
    pub const SEED: &'static [u8] = b"entry";
    pub fn read(data: &[u8]) -> Result<Self, ProgramError> {
        if (data.len() != Self::LEN && data.len() != Self::LEGACY_LEN) || data[64] > 1 { return Err(ProgramError::InvalidAccountData); }
        Ok(Self { room: data[..32].try_into().unwrap(), wallet: data[32..64].try_into().unwrap(), claimed: data[64] == 1,
            next: if data.len() == Self::LEN { data[65..97].try_into().unwrap() } else { [0; 32] } })
    }
    pub fn write(&self, data: &mut [u8]) -> Result<(), ProgramError> {
        if data.len() != Self::LEN && (data.len() != Self::LEGACY_LEN || self.next != [0; 32]) { return Err(ProgramError::AccountDataTooSmall); }
        data[..32].copy_from_slice(&self.room); data[32..64].copy_from_slice(&self.wallet); data[64] = self.claimed as u8;
        if data.len() == Self::LEN { data[65..97].copy_from_slice(&self.next); }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn room() -> Room { Room { id: 1, creator: [1; 32], authority: [2; 32], mint: [3; 32], stake: 5,
        join_deadline: 100, deadline: 120, refund_at: 200, entrants: 1, winner: [0; 32], status: OPEN, bump: 255, head: [0; 32] } }
    #[test] fn three_players_award_once_after_deadline() {
        let mut r = room(); r.join(99).unwrap(); r.join(99).unwrap(); assert_eq!(r.pool().unwrap(), 15);
        assert!(r.settle([4; 32], 119).is_err()); r.settle([4; 32], 120).unwrap();
        assert_eq!(r.status, AWARDED); assert!(r.settle([5; 32], 120).is_err()); assert!(r.refund(201).is_err());
    }
    #[test] fn deadline_and_extension_are_locked_by_second_deposit() {
        let mut r = room(); assert!(r.join(100).is_err()); r.extend(150, 90).unwrap(); assert_eq!(r.refund_at, 250);
        r.join(99).unwrap(); assert!(r.extend(160, 99).is_err()); assert!(r.extend(170, 150).is_err());
    }
    #[test] fn no_opponent_no_finisher_and_authority_failure_refund() {
        let mut r = room(); assert!(r.refund(99).is_err()); r.refund(100).unwrap(); assert_eq!(r.status, REFUNDING);
        let mut r = room(); r.join(99).unwrap(); r.settle([0; 32], 120).unwrap(); assert_eq!(r.status, REFUNDING);
        let mut r = room(); r.join(99).unwrap(); assert!(r.refund(199).is_err()); r.refund(200).unwrap();
        assert!(r.settle([4; 32], 200).is_err());
    }
    #[test] fn layouts_round_trip() {
        let r = room(); let mut bytes = [0; Room::LEN]; r.write(&mut bytes).unwrap(); let restored = Room::read(&bytes).unwrap();
        assert_eq!(restored.pool().unwrap(), 5); assert_eq!(restored.refund_at, 200);
        let e = Entry { room: [3; 32], wallet: [4; 32], claimed: true, next: [5; 32] }; let mut bytes = [0; Entry::LEN];
        e.write(&mut bytes).unwrap(); assert!(Entry::read(&bytes).unwrap().claimed);
        assert_eq!(Entry::read(&bytes).unwrap().next, [5; 32]);
    }
    #[test] fn existing_funded_layouts_keep_payout_and_refund_state() {
        let mut r = room(); let mut bytes = [0; Room::LEGACY_LEN]; r.write(&mut bytes).unwrap();
        r = Room::read(&bytes).unwrap(); assert_eq!(r.head, [0; 32]);
        r.refund(100).unwrap(); r.write(&mut bytes).unwrap();
        assert_eq!(Room::read(&bytes).unwrap().status, REFUNDING);
        let mut e = Entry { room: [3; 32], wallet: [4; 32], claimed: false, next: [0; 32] };
        let mut bytes = [0; Entry::LEGACY_LEN]; e.write(&mut bytes).unwrap();
        e = Entry::read(&bytes).unwrap(); e.claimed = true; e.write(&mut bytes).unwrap();
        assert!(Entry::read(&bytes).unwrap().claimed);
    }
}
