---
name: sdr-calculate-intensity
description: >-
   'Calculate the training intensity (Daniels stress points) of a single training session from run durations per zone, using the points-per-minute methodand a deterministic Node engine. Use when: scoring a workout or Q session, calculating session or weekly training stress/load points, comparing intensity of E, M, T, 10K, I, R, FR running, or tracking training intensities for a plan.'
argument-hint: 'Session as durations, e.g. "1 hour E + 4 x 4 min R"'
allowed-tools: node
---

# Calculate Intensity

Scores a single training session with Daniels' "Tracking Training Intensities" method. Each minute of running in a zone earns a fixed number of points. **Never score by hand.** Always run the engine.

| Zone | Aliases | Points / min |
|------|---------|--------------|
| E | L, EASY | 0.2 |
| M | MP | 0.4 |
| T | | 0.6 |
| 10K | | 0.8 |
| I | H | 1.0 |
| R | | 1.5 |
| FR | | 2.0 |

Examples: `20 min E` = 4 points, `30 min E + 30 min T` = 24 points, `1 hour E + 4 x 4 min R` = 36 points.

## Engine

[scripts/intensity.js](./scripts/intensity.js) is a zero-dependency Node script. Points = minutes × zone factor, summed across all segments.

## Input rules (caller's responsibility)

- **Durations only.** Every segment needs a time unit: `h`/`hr`/`hour(s)`, `min`/`mins`/`minute(s)`, or `s`/`sec`/`second(s)`. A bare number (e.g. `6 E`) or a distance (`3 km E`, `2 mi T`) is rejected. If the plan gives a distance, convert it to minutes yourself first, using the athlete's pace for that zone (see the `sdr-vdot-paces` skill). If a pace range is given, conservatively use the slower pace.
- **Recoveries are not scored.** Any `w/ ...` clause (e.g. `w/ 2 min jg`, `w/ 2 min rest`) is ignored. If a recovery should count, write it as its own segment.

## Session syntax

```
session  := term ('+' term)*
term     := [N x] ( '(' session [recovery] ')' | duration zone [recovery] )
recovery := w/ duration ...   (ignored)
```

`×` is accepted as well as `x`. Examples:
- `20 min E + 5 x (3 min I w/ 2 min jg) + 6 x (1 min R w/ 2 min jg) + 10 min E` = 30 points
- `2 x (12 min T w/ 2 min rest) + 8 min 10K + 90 s FR`

## Procedure

1. **Normalise the session** to the syntax above:
   - Convert any distance segment to minutes using the athlete's zone pace (from `sdr-vdot-paces`): minutes = km × pace per km. Round to the nearest 0.1 min.
   - Write warm-ups and cool-downs as E time. Leave recoveries as `w/ ...` clauses; they are not scored.
   - Show the user the converted session string, including any conversions you made.
2. **Run the engine** from the workspace root:
   ```sh
   node <skill-dir>/calculate-intensity/scripts/intensity.js "<session>" --json
   ```
3. **Report** the total points, then points and minutes by zone, then total running minutes.
4. **If the engine errors (exit code 1)**, fix the session string as the message describes and rerun. Don't calculate points yourself as a workaround.

## Output (`--json`)

- `segments[]`: `segment`, `reps`, `zone`, `pointsPerMin`, `minutes`, `points` (all totals include reps).
- `byZone`: `{ minutes, points }` for each zone.
- `total`: `minutes` (scored running time, recoveries excluded) and `points`.

## References

- Daniels, J. (2014). Daniels' Running Formula (3rd ed.). Human Kinetics.
