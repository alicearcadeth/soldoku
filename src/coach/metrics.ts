export type DailyRow = {
  player_started?: number;
  player_completed?: number;
  player_with_hint?: number;
  player_with_reveal?: number;
  check_started?: number;
  check_completed?: number;
  hint_stage1?: number;
  hint_stage2?: number;
  coach_requests?: number;
  coach_gemini?: number;
  coach_fallback?: number;
  coach_cache?: number;
  gemini_calls?: number;
  gemini_errors?: number;
  gemini_ms?: number;
};

export function metricReport(row: DailyRow): string[] {
  const started = row.player_started ?? 0;
  const completed = row.player_completed ?? 0;
  const coach = row.coach_requests ?? 0;
  const gemini = row.gemini_calls ?? 0;
  return [
    `Player starts ${started}. Player completions ${completed}. Check starts ${row.check_started ?? 0}.`,
    line("Online completion rate", completed, started),
    line("Completed games with a hint", row.player_with_hint ?? 0, completed),
    line("Completed games that revealed a digit", row.player_with_reveal ?? 0, completed),
    line("Coach requests per completion", coach, completed),
    line("Gemini calls per coach request", gemini, coach),
    line("Cache-hit rate", row.coach_cache ?? 0, coach),
    line("Fallback rate", row.coach_fallback ?? 0, coach),
    line("Gemini error rate", row.gemini_errors ?? 0, gemini),
    gemini === 0 ? "Mean Gemini latency: unavailable" : `Mean Gemini latency: ${Math.round((row.gemini_ms ?? 0) / gemini)} ms`,
    "Offline Classic games are not in these counts. A zero denominator is unavailable.",
  ];
}

function line(label: string, numerator: number, denominator: number): string {
  if (denominator <= 0) return `${label}: unavailable`;
  return `${label}: ${numerator}/${denominator}`;
}
