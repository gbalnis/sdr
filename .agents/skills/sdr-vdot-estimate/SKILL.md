---
name: sdr-vdot-estimate
description: >-
   'Calculate a runner''s VDOT from a race time using the Daniels/Gilbert oxygen-cost and %VO2max equations. Use when: estimating VDOT, converting a race result (1500m, mile, 3k, 2 mile, 5k, 10k, 15k, half marathon, marathon, or any other distance) to a VDOT score, rating athlete performances, or picking the current VDOT for a training plan.'
argument-hint: '<distance> <time>, e.g. "half marathon 1:39:13"'
allowed-tools: node
---

# VDOT Estimate

Turns a race result (distance + finish time) into a VDOT value. **Never estimate VDOT by reasoning or from memory** — always run the engine so results are reproducible.

## Engine

[scripts/vdot.js](./scripts/vdot.js) — zero-dependency Node script. With distance `d` in meters and time `t` in minutes:

```
velocity  = d / t                                                    (m/min)
VO2       = -4.60 + 0.182258·velocity + 0.000104·velocity²
%VO2max   = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)
VDOT      = VO2 / %VO2max
```

- Rounds to 1 decimal (`vdotExact` holds the unrounded value).
- The JSON output also includes `velocity`, `vo2` and `pctVo2max`.

## Procedure

1. **Collect inputs** for each performance: distance and finish time (`h:mm:ss`, `mm:ss` or `mm:ss.s`).
2. **Run the engine** from the workspace root, one call per performance:
   ```sh
   node .agents/skills/sdr-vdot-estimate/scripts/vdot.js "<distance>" <time> --json
   ```
3. **Handle the result**:
   - `ok` → report `vdot`.
   - Exit code 1 (error) → bad time or unknown distance. Fix the input and rerun.
4. **Report** in a table: date (if known), distance, time, VDOT.
5. **Current VDOT** = the VDOT of the **most recent** performance (by date). State which performance it came from.

## Supported distances

Named distances and aliases:

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

Any other distance can be given as a number with a unit: `m` (or no unit), `km`/`k`, or `mi`/`mile(s)`. Examples: `8k`, `"10 mi"`, `25km`, `4000`.

## Sources

- Daniels, J., & Gilbert, J. (1979). Oxygen Power: Performance Tables for Distance Runners. Tafnews Press.