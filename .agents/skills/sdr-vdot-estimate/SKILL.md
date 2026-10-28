---
name: sdr-vdot-estimate
description: >-
   'Calculate a runner''s VDOT from a race time using per-distance functions curve-fitted to the Daniels VDOT table, with linear interpolation between neighbouring distances. Use when: estimating VDOT, converting a race result (1500m, mile, 3k, 2 mile, 5k, 10k, 15k, half marathon, marathon, or any distance in between) to a VDOT score, rating athlete performances, or picking the current VDOT for a training plan.'
argument-hint: '<distance> <time>, e.g. "half marathon 1:39:13"'
allowed-tools: node
---

# VDOT Estimate

Turns a race result (distance + finish time) into a VDOT value. **Never estimate VDOT by reasoning or from memory** — always run the engine so results are reproducible.

## Engine

[scripts/vdot.js](./scripts/vdot.js) — zero-dependency Node script with no runtime data files.

- Each fitted distance has a hardcoded cubic function `VDOT = c0 + c1·v + c2·v² + c3·v³`, where `v` is speed in m/s. The coefficients were fitted by least squares to [resources/VDOT_estimate_data.csv](./resources/VDOT_estimate_data.csv) (VDOT 30–85). They match the table within 0.3 VDOT (within 0.1 for 3k and longer).
- For a distance between two fitted distances, both neighbour functions are evaluated at the race speed. VDOT is then linearly interpolated between the two results, weighted by log-distance.
- Rounds to 1 decimal (`vdotExact` holds the unrounded value).
- Valid range is VDOT 30–85. Results outside that range are not reported.

## Procedure

1. **Collect inputs** for each performance: distance and finish time (`h:mm:ss`, `mm:ss` or `mm:ss.s`).
2. **Run the engine** from the workspace root, one call per performance:
   ```sh
   node .agents/skills/sdr-vdot-estimate/scripts/vdot.js "<distance>" <time> --json
   ```
3. **Handle the status**:
   - `ok` → report `vdot`. If `method` is `interpolated`, also report the `neighbours` used.
   - `below-range` / `above-range` → the time is outside VDOT 30–85. Report that; do **not** extrapolate.
   - Exit code 1 (error) → bad time, or the distance is unknown or outside 1500 m–marathon. Fix the input and rerun.
4. **Report** in a table: date (if known), distance, time, VDOT.
5. **Current VDOT** = the VDOT of the **most recent** in-range performance (by date). State which performance it came from.

## Supported distances

Fitted functions (names and aliases):

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

Any other distance between 1500 m and the marathon can be given as a number with a unit: `m` (or no unit), `km`/`k`, or `mi`/`mile(s)`. Examples: `8k`, `"10 mi"`, `25km`, `4000`. These are interpolated from the neighbouring functions. Distances outside 1500 m–marathon are rejected.

## Refitting

The CSV is only the source data for the fit and is not read at runtime. If the data changes, refit a cubic polynomial in `v = meters / seconds` for each column. Use exact meters: 1609.344 for the mile, 3218.688 for 2 miles and 21097.5 for the half marathon. Then update the `FUNCTIONS` coefficients in the script.
