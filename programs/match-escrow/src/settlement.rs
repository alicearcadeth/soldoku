/// One settlement mint per build. The production binary is Mainnet USDC.
/// `test-settlement` is a different binary for Localnet and Devnet staging.
/// The match authority cannot change this value.

#[cfg(not(feature = "test-settlement"))]
pub const SETTLEMENT_MINT: [u8; 32] = [
    198, 250, 122, 243, 190, 219, 173, 58, 61, 101, 243, 106, 171, 201, 116, 49, 177, 187, 228, 194, 210, 246, 224, 228, 124, 166, 2, 3, 69, 47, 93, 97,
];

#[cfg(feature = "test-settlement")]
pub const SETTLEMENT_MINT: [u8; 32] = [
    96, 119, 233, 221, 192, 114, 146, 67, 101, 148, 8, 12, 120, 17, 124, 176, 122, 28, 114, 107, 50, 227, 11, 22, 209, 14, 153, 202, 18, 249, 117, 236,
];
