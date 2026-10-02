/** The public Devnet escrow program. Rooms that do not store an id stay on this program. */
export const ESCROW_PROGRAM_ID = "HUkhJi8p1XXuErpEXkgpfQjwdapigXLECRoQSu3indyS";

/** The verified replacement. New rooms may use it. Old rooms do not move onto it. */
export const ESCROW_V2_PROGRAM_ID = "937BAWXVCW58oEKkA1FijkSXXtdgGEytUyPRV2Roge22";

/** Isolated Devnet rehearsal of the production logic. Never the public default. */
export const STAGING_ESCROW_PROGRAM_ID = "GTJ68bR2Fwkc9JcYefH9Eas9gvHnR6AkZ3TincmJsst4";

/** The program used for a newly created room. Historical rooms keep their own id. */
export function activeEscrowProgramId(): string {
  const requested = process.env.SUDOKU_ESCROW_PROGRAM_ID?.trim();
  if (!requested || requested === ESCROW_PROGRAM_ID) return ESCROW_PROGRAM_ID;
  if (process.env.SUDOKU_STAGING === "1") return requested;
  if (requested === ESCROW_V2_PROGRAM_ID && process.env.SUDOKU_ESCROW_V2 === "1") return requested;
  throw new Error("A replacement escrow program is not enabled");
}

/** Missing ids are legacy rooms. Do not reinterpret them with another program. */
export function roomEscrowProgramId(stored?: string | null): string {
  return stored || ESCROW_PROGRAM_ID;
}
