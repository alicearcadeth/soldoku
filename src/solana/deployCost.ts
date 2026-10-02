/** Rent estimate from the published exemption formula. It is not a quote from a broadcast deploy. */

export type DeployCostInput = {
  artifactBytes: number;
  programAccountBytes?: number;
  lamportsPerByteYear?: number;
  exemptionYears?: number;
  signatureFeeLamports?: number;
  deployTransactions?: number;
  retryTransactions?: number;
  matchAccountBytes?: number;
  vaultAccountBytes?: number;
};

export type DeployCost = {
  programDataRentLamports: number;
  programAccountRentLamports: number;
  transactionFeeLamports: number;
  retryFeeLamports: number;
  minimumLikelyLamports: number;
  recommendedLamports: number;
  matchRentLamports: number;
  vaultRentLamports: number;
  depositFeeLamports: number;
  settlementFeeLamports: number;
  closeFeeLamports: number;
  recoverableMatchRentLamports: number;
};

export const MEASURED_MAINNET_RENT = {
  measuredOn: "2026-09-28",
  programDataBytes: 45 + 29_312,
  programDataLamports: 149_783_800,
  programAccountLamports: 833_120,
  matchLamports: 1_478_280,
  vaultLamports: 1_488_440,
  signatureFeeLamports: 5_000,
} as const;

/** Uses the rent the Solana CLI reported. The byte formula is not the current Mainnet schedule. */
export function mainnetDeployFunding(signatureCount = 50, operationalLamports = 20_000_000) {
  const rent = MEASURED_MAINNET_RENT.programDataLamports + MEASURED_MAINNET_RENT.programAccountLamports;
  const fees = MEASURED_MAINNET_RENT.signatureFeeLamports * signatureCount;
  const minimumLikelyLamports = rent + fees;
  return {
    minimumLikelyLamports,
    recommendedLamports: minimumLikelyLamports + MEASURED_MAINNET_RENT.programDataLamports + operationalLamports,
    matchRentLamports: MEASURED_MAINNET_RENT.matchLamports,
    vaultRentLamports: MEASURED_MAINNET_RENT.vaultLamports,
    recoverableLamports: MEASURED_MAINNET_RENT.matchLamports + MEASURED_MAINNET_RENT.vaultLamports,
    feeLamports: MEASURED_MAINNET_RENT.signatureFeeLamports,
  };
}

export function rentExemptLamports(dataBytes: number, lamportsPerByteYear = 3_480, years = 2): number {
  return (dataBytes + 128) * lamportsPerByteYear * years;
}

export function estimateDeployCost(input: DeployCostInput): DeployCost {
  const programDataRentLamports = rentExemptLamports(input.artifactBytes, input.lamportsPerByteYear, input.exemptionYears);
  const programAccountRentLamports = rentExemptLamports(input.programAccountBytes ?? 36, input.lamportsPerByteYear, input.exemptionYears);
  const fee = input.signatureFeeLamports ?? 5_000;
  const transactionFeeLamports = fee * (input.deployTransactions ?? 3);
  const retryFeeLamports = fee * (input.retryTransactions ?? 6);
  const matchRentLamports = rentExemptLamports(input.matchAccountBytes ?? 163, input.lamportsPerByteYear, input.exemptionYears);
  const vaultRentLamports = rentExemptLamports(input.vaultAccountBytes ?? 165, input.lamportsPerByteYear, input.exemptionYears);
  const minimumLikelyLamports = programDataRentLamports + programAccountRentLamports + transactionFeeLamports;
  return {
    programDataRentLamports,
    programAccountRentLamports,
    transactionFeeLamports,
    retryFeeLamports,
    minimumLikelyLamports,
    recommendedLamports: minimumLikelyLamports + retryFeeLamports + 20_000_000,
    matchRentLamports,
    vaultRentLamports,
    depositFeeLamports: fee,
    settlementFeeLamports: fee,
    closeFeeLamports: fee,
    recoverableMatchRentLamports: matchRentLamports + vaultRentLamports,
  };
}
