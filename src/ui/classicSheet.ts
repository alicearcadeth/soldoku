/** State left after Android Back. Settings is pushed above Pause, so Back closes Settings and the puzzle stays paused. */
export function classicSheetState(sheet: string | undefined): { paused: boolean; settings: boolean } {
  return {
    settings: sheet === "settings",
    paused: sheet === "pause" || sheet === "settings",
  };
}
