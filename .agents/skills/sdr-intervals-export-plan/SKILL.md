---
name: sdr-intervals-export-plan
description: >-
   'Convert a sdr-personalize-framework plan JSON into intervals.icu workout-library plans using the intervals.icu MCP tools. Use when exporting or uploading personalized running plans without scheduling them on the calendar.'
argument-hint: 'personalized plan JSON, optional plan name'
allowed-tools: node
---

# Export Plan to Intervals.icu

Convert the version 1 athlete-specific plan JSON produced by [sdr-personalize-framework](../../../.apm/skills/sdr-personalize-framework/SKILL.md) into intervals.icu running workouts, then save them in a workout-library `PLAN`. This workflow does not schedule workouts.

## Procedure

1. Read the personalized plan JSON and check that `schema_version` is `1`, `days` is contiguous through race day (`before_race: 0`), and each run has steps, distance, and duration. Resolve plan issues with `sdr-personalize-framework` before exporting; do not repair its output by hand.
2. Call `icu_get_workout_library` and look for an existing plan with the same athlete and framework. If it already contains workouts, stop before creating duplicates or overwriting anything; ask whether to use another plan or handle the existing one.
3. Create a library plan with `icu_create_workout_folder` and `folder_type: "PLAN"`. A suitable default name is `<athlete name> - <framework title>`. If the name exists already, add a timestamp to make it unique. Include that the plan is metric, give its `week_start`, and note that it is not scheduled. Do not create a plain folder.
4. Run the [converter](./scripts/export-plan.js) with the plan JSON and new folder ID:

   ```sh
   node <skills-dir>/scripts/export-plan.js plans/<athlete>-<framework>.json --folder-id <id>
   ```

   It prints one JSON object per line. Each line is a `workouts` string ready for one `icu_bulk_create_workouts` call. Keep the batches in order and use the exact generated payloads. To generate only one batch, add `--batch-index 0` (zero-based; default batch size is 20).
5. Call `icu_bulk_create_workouts` once per output line. Check each response for the expected saved count and `workout_parsed: true`. If a batch fails, stop and resolve that batch before sending later ones; avoid retrying a batch that may have partially succeeded without first checking the folder.
6. Verify with `icu_get_workouts_in_folder`: confirm the expected workout count, `day` offsets and parsed pace steps. Do not call `icu_apply_training_plan`, create calendar events, or otherwise schedule the plan unless the user separately asks for that.

## Conversion Rules

- Plan day offset is `max(before_race) - before_race`; race day is included only when the source has a run on it. Rest days and days with no runs do not create workouts.
- Weekday labels are derived from the race weekday (`athlete.week_start`) and `before_race`, not from the machine's current date. The plan remains race-relative.
- Workout steps use kilometer distances rounded to one decimal place and preserve each prescribed `pace_per_km` as `<m:ss>/km pace`.
- If a pace range is specified, use the `Pace Range` step with the range. If a single pace value is given, use the `Pace` step with that value.
- A `ST` stride uses its prescribed `pace_per_km`, or `reference_pace_per_km` when the prescribed pace is null; if both are missing it uses `Z7 Pace`. A non-rest recovery without a prescribed pace uses `Z1 Pace`. A rest recovery remains `intensity=rest`.
- Repeat recovery placement is preserved: `after_each` repeats the work and recovery together; `between` repeats work plus recovery `count - 1` times and emits the final work bout separately.
- Durations are represented in whole seconds (or whole minutes when divisible by 60). Workout metadata distance is also rounded to 0.1 km. The converter fails on unsupported nested repeats, invalid repeat placement, missing prescribed paces outside the stated fallbacks, and malformed plans rather than silently changing the workout.
- Batches contain at most 20 workouts, and the script has no network access or side effects.

## Completion Checks

- The plan is present in the workout library as a `PLAN` with the expected number of run workouts.
- Workouts have race-relative plan days, correct weekday labels, one-decimal kilometer distances, prescribed pace targets, and `Z1 Pace`/`Z7 Pace` fallbacks where required.
- The server reports each workout parsed successfully. Nothing has been added to the calendar.