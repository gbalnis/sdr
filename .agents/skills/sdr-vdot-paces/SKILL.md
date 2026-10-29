---
name: sdr-vdot-paces
description: >-
   'Produce Jack Daniels training paces (E, M, T, I, R) for a given VDOT value. Use when: building a training plan, converting VDOT to training paces, getting easy/marathon/threshold/interval/repetition pace per km, prescribing workout paces from a race-derived VDOT.'
argument-hint: '<vdot>, e.g. "47.3"'
allowed-tools: node
---

# VDOT Training Paces

Turns a VDOT value into Daniels training paces per kilometer. **Never derive paces by reasoning or from memory** — always run the engine so results are reproducible.

If the user gives a race result instead of a VDOT, first get the VDOT with the `sdr-vdot-estimate` skill.

## Engine

[scripts/paces.js](./scripts/paces.js) — zero-dependency Node script with the Daniels reference table embedded (whole VDOT 30–85, seconds per km).

- Accepted VDOT: real number, `30 <= vdot <= 85`. Anything else exits with code 1.
- Fractional VDOT → linear interpolation between the two neighbouring whole-VDOT rows; seconds are rounded to 0.1 s, formatted paces to whole seconds.
- `E.min` is the **faster** end of the easy range, `E.max` the slower end.

## Procedure

1. **Get the VDOT** (from the user or from `sdr-vdot-estimate`).
2. **Run the engine** from the workspace root:
   ```sh
   node ./scripts/paces.js <vdot> --json
   ```
3. **Handle the result**:
   - `ok` → use `E.pace`, `M.pace`, `T.pace`, `I.pace`, `R.pace` (`m:ss` per km); raw seconds are in `E.min`/`E.max` and `<zone>.sec`.
   - Exit code 1 → invalid or out-of-range VDOT. Tell the user the supported range; do not extrapolate.
4. **Report** as a table: zone, pace per km. Mention the VDOT used and whether it was interpolated.

## Zones

| Zone | Name | Purpose |
|------|------|---------|
| E | Easy | Aerobic base, recovery, long runs |
| M | Marathon | Race-specific marathon pace |
| T | Threshold | Lactate threshold, tempo runs and cruise intervals |
| I | Interval | VO2max development |
| R | Repetition | Speed and running economy |

## Sources

- Daniels, J. (2014). Daniels' Running Formula (3rd ed.). Human Kinetics.
