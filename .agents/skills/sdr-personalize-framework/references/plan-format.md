# Personalized Plan, Version 1

Output of [personalize.js](../scripts/personalize.js). It is athlete-specific but not
calendar-anchored: every day is a count of days before race day (`before_race`, race = 0).
Distances are kilometres and durations are minutes regardless of the athlete's `units`;
conversion for display belongs to a later step. Scheduling onto dates also happens later.

## Document

| Field | Meaning |
| --- | --- |
| `schema_version` | Always `1`. |
| `framework` | `title`, `source` copied from the normalized framework. |
| `athlete` | `name`, `peak_week_km`, `units`, `rest_weekdays`, `week_start` (weekday of day 1 of each week), `rest_day_numbers` (rest weekdays mapped to day-in-week numbers). |
| `vdot` | `baseline` (most recent in-range performance), `from` (that performance), `performances` (all, with VDOT). |
| `strides` | `{count, seconds, recovery, days, cooldown}` or null. |
| `weeks` | One summary per weekly entry: `week`, `vdot`, `vdot_offset`, `target_km`, `planned_km`, `quality_km`, `easy_km`, `easy_runs`, `rest_days`, `paces_per_km` (E range object; M, T, I, R pace strings). |
| `days` | Every day in sequence, from the earliest framework day down to `before_race: 1`, then the race day. |
| `issues` | Warnings: `severity`, `code`, `where`, `message`. Hard errors stop the engine instead. |

## Days and runs

Day: `before_race`, `week` (or null in daily taper entries), `day_in_week` (1-7 or null), `kind`
(`run`, `rest`, `race`), `vdot` (runs and weekly rests only), `rest_reason`
(`athlete_rest_day`, `extra_rest_day` or `framework_gap`, on rest days), `runs`.

Run: `id` (`d<before_race>-<Q1|S1|E>`), `kind` (`quality`, `support`, `easy`), `session_id`,
`optional`, `distance_km`, `duration_min`, `steps`.

A pace value is either a single `m:ss` string per kilometre or a range object
`{"min":"m:ss","max":"m:ss"}`. For a range, `min` is the faster pace and
`max` is the slower pace. The `E` zone is a range; zones with one prescribed pace
are strings.

Steps mirror the normalized format with computed values:
- `run`: `intensity`, `pace_per_km` (single pace string or range object; null for strides), `distance_km`, `duration_min`, plus `range` when the framework gave a quantity range.
- `recovery`: `mode`, `pace_per_km` (E pace range for jog/easy, null for rest), `distance_km`, `duration_min`.
- `repeat`: `count`, `steps`, `recovery` (`placement`, executed `count`, `step`), and totals for the whole repeat.
- Stride repeats use `intensity: ST` with null pace and single-string `reference_pace_per_km` (R pace); their totals carry `distance_basis: e_pace`.

## Rules the engine applies

- **VDOT:** baseline is the most recent performance in the table range. Each entry's VDOT is baseline plus its `vdot_offset` (a missing offset is 0, with a warning). Paces come from the vdot-paces table for E, M, T, I, R. E is reported using the table's faster `E.min` and slower `E.max` values; M, T, I, and R are single pace strings. Distance and duration calculations use the slower E endpoint. `10K` and `FR` have no table pace and stop the engine.
- **Distance vs time:** km steps take time at the zone pace; minute steps take distance at the zone pace. Jog and easy recoveries run at E pace; rests add time but no distance. Repeat recoveries follow the normalized `placement`.
- **Ranges** resolve to their upper bound (the original range stays on the step). A taper day of `0-20 min` therefore becomes a 20 min run.
- **Week layout:** week `w` has days `7w` down to `7w-6` before the race. Q session `j` of `n` falls on day `floor(7j/n)+1`, so Q1 is always day 1 and two Q sessions fall on days 1 and 4. Rest weekdays map to day numbers from `week_start` (default Sunday, the race weekday). If a rest day lands on a Q day it moves to the nearest free day (later first) with a warning.
- **Easy volume:** remaining distance is `peak_week_km x peak_fraction` minus the Q sessions. It is split evenly (0.1 km steps) over the free days, using as many days as keep each run at 30 minutes or more at E pace. Days not used become `extra_rest_day`, dropping days right after a Q first, then from the end of the week. A week with no fraction, an exceeded target, or less than 30 minutes remaining adds no easy runs and warns.
- **Strides** (when provided): added to `days` of the week's easy runs, spread evenly, as main E run, then the stride repeat, then a cool-down of `cooldown` minutes at E pace. Stride and jog time are counted at E pace so run duration equals distance times E pace.
- **Daily taper entries** are used as written. Days missing between the first framework day and day 1 are planned as rest days (`rest_reason: framework_gap`), regardless of the athlete's rest-day preference, with a `framework_gap_rest` warning.
