---
name: sdr-vdot-estimate
description: >-
   'Calculate a runner''s VDOT from a race time using the Daniels VDOT table in VDOT/VDOT system estimates.xlsx with deterministic linear interpolation. Use when: estimating VDOT, converting a race result (1500m, mile, 3k, 2 mile, 5k, 10k, 15k, half marathon, marathon) to a VDOT score, rating athlete performances, or picking the current VDOT for a training plan.'
argument-hint: '<distance> <time>, e.g. "half marathon 1:39:13"'
allowed-tools: node
---

# VDOT Estimate

Turns a race result (distance + finish time) into a VDOT value. **Never estimate VDOT by reasoning or from memory** — always run the engine so results are reproducible and traceable to the [resources/VDOT system estimates.xlsx](./resources/VDOT system estimates.xlsx) spreadsheet.

## Engine

[scripts/vdot.js](./scripts/vdot.js) — zero-dependency Node script. It reads the `VDOT estimate` sheet of `resources/VDOT system estimates.xlsx` on every run, so edits to the spreadsheet are picked up automatically.

- Finds the two table rows whose times bracket the race time and linearly interpolates VDOT between them.
- Rounds to 1 decimal (`vdotExact` holds the unrounded value).
- Fails loudly if the table is not monotonic (time must fall as VDOT rises).

## Procedure

1. **Collect inputs** for each performance: distance and finish time (`h:mm:ss`, `mm:ss` or `mm:ss.s`).
2. **Run the engine** from the workspace root, one call per performance:
   ```sh
   node .github/skills/vdot-estimate/scripts/vdot.js "<distance>" <time> --json
   ```
3. **Handle the status**:
   - `ok` → report `vdot` and the bracket rows used.
   - `below-table` / `above-table` → the time is outside VDOT 30–85. Report that; do **not** extrapolate.
   - Exit code 1 (error) → bad distance/time; fix the input and rerun.
4. **Report** in a table: date (if known), distance, time, VDOT.
5. **Current VDOT** = the VDOT of the **most recent** in-range performance (by date). State which performance it came from.

## Supported distances

Column names from the sheet, plus aliases:

| Canonical | Aliases |
|-----------|---------|
| `1500 m` | 1500, 1500m, 1.5k, metric mile |
| `1 mile` | mile, 1mi |
| `3000 m` | 3k, 3000 |
| `2 miles` | 2 mile, 2mi |
| `5000 m` | 5k, 5000 |
| `10000 m` | 10k, 10000 |
| `15000 m` | 15k, 15000 |
| `half marathon` | half, hm, 21.1k, 13.1 |
| `marathon` | full, fm, 42.2k, 26.2 |

Other distances (e.g. 8k, 10 mile) are not in the table: tell the user rather than guessing.

## Other commands

- `node .github/skills/vdot-estimate/scripts/vdot.js --table` — print the decoded table (use to verify spreadsheet parsing).
- `--xlsx <path>` — use a different workbook with the same layout.

## Spreadsheet notes

Times in the sheet are stored inconsistently, and the engine handles all of these:
- `h:mm:ss` cells (numFmt 21) are real Excel times.
- `h:mm` / `[h]:mm` cells (numFmt 20/46) hold min:sec typed as hours:minutes.
- Text cells hold `m:ss.s` strings, sometimes with a trailing `*` footnote.

If you add rows or columns, keep the same layout: VDOT in column A and distance names in row 1. Then run `--table` to check the result.
