# Final quality audit

Audit branch: `ux/final-quality-audit`, cut from `ux/player-feedback-pass` at `930ce32`.

Rollback of the previous hosted page is worker `d977b770-10a8-453e-9c3c-9b461ec59402`, client `assets/index-BBGNyRlU.js`, CSS `assets/index-ChDsCB2q.css`. Redeploy commit `930ce32` to restore it.

This pass was deployed after the checks below:

- Worker `62a82219-93f9-4990-bcf0-758a01e99d0d`
- Client `assets/index-CQmk49yB.js`, CSS `assets/index-Z6rSqkAq.css`
- Hosted Settings shows Easy Read and Large. Compete no longer says "room token".

Submission APK `submission/sudoku-clockin.apk` is unchanged, SHA-256 `79529045f97ad9867ab6dc6207a06d038600966c0b687dfd7ba53406e2b0d954`. It loads the hosted URL, so a reinstall is not required for these page changes.

Rollback of this audit's source is `git switch ux/player-feedback-pass`. Reinstalling the APK does not restore the previous page, because the APK loads the hosted URL. Do not rebuild the APK for this pass. The native shell did not change.

## Sources inspected

Inspected 2026-09-30.

| Source | Version | Used for |
| --- | --- | --- |
| [thedaviddias/Front-End-Checklist](https://github.com/thedaviddias/Front-End-Checklist) | Release v2.0, commit `786771ff410feaf03d285c759201fce3c0b7416d`, 2026-05-30. Default branch `main` last pushed 2026-06-18. | HTML, CSS, accessibility, performance, security, testing, privacy |
| [The A11Y Project Checklist](https://www.a11yproject.com/checklist/) | Live page. No git SHA is published. It maps to many WCAG 2.1 A/AA items. | Names, focus, dialogs, contrast, zoom, semantics |
| [Android core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality) | Current page, plus the archived snapshot last updated 2026-03-20 | UX, interruptions, back, orientation, touch, text, audio, stability, translated to the WebView shell |
| [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/basic/) | Basic and relevant Intermediate pages. No dated commit. | Text, contrast, settings, haptics, audio, practice, pause, difficulty |

Excluded on purpose: SEO and marketing rules, console remapping, game-speed controls, speech input, 3D/camera comfort, subtitle tracks, and native Android architecture that a hosted WebView shell does not own. Google Play policy beyond the existing submission notes was not re-audited.

## Typography decision

The UI font and the puzzle digits are separate.

- System uses `system-ui` / Segoe UI. No download.
- Modern is Inter, latin WOFF2, weights 400 and 600. SIL OFL 1.1, copyright 2016 The Inter Project Authors. Files `public/fonts/inter-latin-400.woff2` (23,664 bytes) and `inter-latin-600.woff2` (24,452 bytes). License: `public/fonts/OFL-Inter.txt`.
- Easy Read is Atkinson Hyperlegible Next, latin WOFF2, weights 400 and 700. SIL OFL 1.1, copyright 2020–2024 The Atkinson Hyperlegible Next Project Authors. Files `atkinson-latin-400.woff2` (12,096 bytes) and `atkinson-latin-700.woff2` (12,732 bytes). License: `public/fonts/OFL-Atkinson.txt`.
- Lexend was not added. Easy Read already covers the differentiated-glyph choice. A fourth family would add payload without a distinct job in this game.

Puzzle cells, candidate notes, and the number pad use Easy Read even when the UI font is System or Modern. Cell size comes from the 9-column grid, not from the font. Digit size is in pixels, so the Large text step does not resize the board. `font-display: swap` with a system fallback. Inter is requested only when Modern is selected, because that family is not used otherwise. Atkinson is requested with the board, about 25 KB.

Labels in Settings are System, Modern, and Easy Read. The mapping above is the one players do not have to memorize.

Text size is Default or Large (112.5% on the root). It is not a slider. Board digits stay the same size.

## Rule table

| Rule | Result | Why it matters here |
| --- | --- | --- |
| `lang` and a page title | PASS | `index.html` is `lang="en"` and titled Sudoku. |
| Zoom not disabled | PASS | Viewport has no `maximum-scale` or `user-scalable=no`. |
| Visible focus | PASS | `focus-visible` is a 3px outline. |
| Dialog focus | FAIL, fixed | Sheets had `role="dialog"` and a name, and no focus move, trap, or Escape. |
| Button name and pressed state | PASS | Settings, Notes, Practice, and For tokens expose name and `aria-pressed`. |
| Cell name | PARTIAL, improved | Each cell is a button named by row, column, and given/entered/empty. Notes and conflicts were silent. |
| Contrast | FAIL, fixed for Arcade digits | Token pairs were measured. Arcade entered `#0f8f62` on `#fffdfb` was 4.04:1. Other body, muted, and theme pairs were above 4.5:1. |
| Color-only state | PASS | Selected cells have an inset ring. Conflicts are underlined. Notes on says "Notes on" and uses a filled button. |
| Touch targets | PASS for controls | Primary controls are at least 48px. Grid cells stay inside the screen width. |
| Text size choice | FAIL, fixed | There was no size choice. Large is one step and does not resize the grid. |
| Font choice | FAIL, fixed | One system stack. Settings now offers three curated faces. |
| Settings remembered | PASS | `sudoku.prefs` and `sudoku.theme` survive reload. Reinstall clears WebView storage. |
| Separate music and effects | PASS | Both default off. Haptics appear only when `navigator.vibrate` exists, and reduced motion skips vibration. |
| Sound is not the only channel | PASS | Mistakes, hints, and wins also change text and color. |
| Practice without payment | PASS | Practice does not move tokens. |
| Difficulty choice | PASS | Easy, Medium, Hard, Expert. |
| Pause | PASS | Pause hides the board and is not the theme picker. |
| Autosave | PASS | Classic writes `sudoku.classic`. |
| First-run help | PARTIAL, fixed | Mode cards explained the three games. The Sudoku rule, Notes, and mistakes were easy to miss. How to play is optional. |
| Terminology | FAIL, fixed | Player copy still said "room token" beside "test token". |
| Financial policy | PASS | Stake presets, escrow, refund, and settlement were not changed. |
| SEO, console remap, game speed | NOT APPLICABLE | Not this product. |
| Full screen-reader grid mode | DEFER | Cells are named. A spoken house summary would be a separate mode, not a checklist patch. |

## FAIL and PARTIAL records

### Dialog focus

1. Source: A11Y Project, focus order and visible focus.
2. Rule: a dialog moves focus inside, keeps Tab inside, and restores focus on close.
3. Existing behavior: Settings, Pause, replace, About, and result sheets did not move focus.
4. Evidence: the sheets were `role="dialog"` without a focus effect.
5. User impact: keyboard and switch users can activate the page behind the sheet.
6. Severity: P1.
7. Fix: `DialogFrame` focuses the first control, traps Tab, closes the top sheet on Escape, and restores the previous control.
8. Regression risk: Escape on Pause resumes. Escape on a nested confirm closes only the confirm. A solved Classic game treats Escape like Home and clears the finished save.

### Arcade digit contrast

1. Source: WCAG 1.4.3 via the A11Y checklist, and Game Accessibility Guidelines high contrast.
2. Rule: normal text at least 4.5:1.
3. Existing behavior: Arcade entered digits used `#0f8f62` on `#fffdfb`.
4. Evidence: relative luminance ratio 4.04:1. Ink, Dark, and Midnight body and muted pairs were 5.18:1 or higher.
5. User impact: player-entered digits on Arcade are the main game text.
6. Severity: P1.
7. Fix: Arcade `--entered` is `#075c40`. Measured 7.92:1 on `#fffdfb`, 6.58:1 on the selected tint.
8. Regression risk: Arcade green is darker. It stays green, and the selected ring is still the ink border.

### Font and text size

1. Source: Game Accessibility Guidelines, readable default text and a font/size choice. Owner request.
2. Rule: players can change type and size without breaking the puzzle.
3. Existing behavior: `"Segoe UI", system-ui, sans-serif` everywhere, including 1 and 7 on the grid.
4. Evidence: one `font-family` on `:root`. Cell size is `clamp` in `rem`, so a root size change would also grow the grid.
5. User impact: no way to pick a more readable UI face, and a naive size control would resize the board.
6. Severity: P1.
7. Fix: Settings font and text size, persisted in `sudoku.prefs`. Board digits stay on Atkinson at a pixel size.
8. Regression risk: a failed font file falls back to Segoe UI / system-ui. Inter is not loaded for System or Easy Read.

### Cell announcements

1. Source: A11Y Project, accessible names.
2. Rule: the name includes the state a player needs.
3. Existing behavior: "Row 2 column 2, given 4" or "empty". Notes and conflicts were only visual.
4. Evidence: `cellLabel` ignored the note bitmask and the conflict flag.
5. User impact: a screen reader could not tell a pencilled candidate from an empty cell, or a conflict from a normal entry.
6. Severity: P1.
7. Fix: empty cells with notes say "notes 1 7". Conflicting digits add "conflict".
8. Regression risk: longer names on noted cells. Compete has no notes, so that argument stays 0.

### First-run rule

1. Source: Game Accessibility Guidelines, contextual help.
2. Rule: essential rules are available without a forced tutorial.
3. Existing behavior: home cards explain Classic, Practice, and Compete. Notes has a one-time sentence. The 1–9 rule was not stated.
4. Evidence: home copy in `App.tsx`.
5. User impact: a new player can miss the rule, what Notes does, and that Practice is free.
6. Severity: P1.
7. Fix: How to play, opened from Home, dismissed with Close or Back. It does not run on every launch.
8. Regression risk: one extra history entry. Back closes it.

### Terminology

1. Source: this product's own language, checked while reading the checklists' plain-language items.
2. Rule: one name for the test-token entry.
3. Existing behavior: About and Compete still said "room token".
4. Evidence: those two sentences, plus the disabled-conversion reason in `dflow.ts`.
5. User impact: "room token" sounds like a separate credit.
6. Severity: P1.
7. Fix: "test token for this room". Amounts, presets, and escrow behavior are unchanged.
8. Regression risk: copy-only. No stake parser change.

## Persistence

| State | Refresh | Home | Background | Process death | Reinstall |
| --- | --- | --- | --- | --- | --- |
| Classic puzzle `sudoku.classic` | survives | survives | survives | survives | cleared |
| Theme, font, text, audio, highlights | survives | survives | survives | survives | cleared |
| Practice or Compete seat `sudoku.seat` | survives | resumes the room | survives | survives | cleared |
| Pending deposit or refund | survives | survives | survives | survives | cleared |
| Connected wallet | survives in the wallet app, not as a Sudoku secret | same | same | same | wallet must connect again |
| History and stats | survives | survives | survives | survives | cleared |

Home does not delete a Classic save. Leave this race clears `sudoku.seat` only for an unfunded Practice room. Font and text size do not change stake amounts.

## Verification in this pass

`npx tsc --noEmit` passed. Vitest: 175 passed, 4 skipped (`dflow.live`, `moonpay.live`, `escrow-v2.localnet`, `staked.localnet`). `scripts/player-feedback-check.mjs` passed, including widths 320–1280. `scripts/quality-audit-check.mjs` passed: settings focus and Tab stay inside the dialog, Escape closes it, Easy Read and Large persist, Inter is not downloaded until Modern, the board stays on Atkinson and stayed 362×362 when the UI font changed, 320px large text did not overflow, Arcade entered digits measured 7.92:1, a 200% root font size on a 320px home screen did not overflow, landscape home at 844×390 did not overflow, and blocking every WOFF2 still showed a given digit. The hosted page serves `assets/index-CQmk49yB.js` and shows Easy Read, Large, and How to play.

Production build: CSS `dist/assets/index-Z6rSqkAq.css` 9.79 KB, JS `dist/assets/index-CQmk49yB.js` 700.11 KB. Font files are separate: Atkinson 24,828 bytes for the board, Inter 48,116 bytes only if Modern is selected. No new npm dependency.

No Android device was attached, so TalkBack and a fresh emulator interruption pass were not run. The native shell was not changed. The page checks above are what that shell loads.

## Not changed

- Stake presets 1, 2, and 5 test tokens.
- Escrow, refund, settlement, and wallet authorization.
- Music. The loop is sparse original tones, default off, and it already suspends when the page hides. It was not replaced.
- The submission APK.
- A specialized screen-reader mode that reads a whole house in one utterance.
