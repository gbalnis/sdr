---
name: sdr-personalize-framework
description: >-
  'Turn a normalized training framework (output of coach-normalize-framework) and an athlete profile into a personalized, race-relative training plan with paces for every run, filler easy runs and rest days. Use when: coach-personalize-framework, personalizing or preparing a training plan for an athlete, filling paces and distances into framework sessions, applying VDOT corrections per week, hitting weekly peak-week volume with easy runs, or adding strides and rest days to a plan.'
argument-hint: 'normalized framework JSON, athlete YAML, optional output path'
allowed-tools: node
---

# Personalize Framework

Combines a normalized framework (see [sdr-normalize-framework](../sdr-normalize-framework/SKILL.md)) with an athlete profile into a plan of runs in sequence. **Never compute VDOT, paces, distances or weekly totals by hand.** Run the engine; it reuses the `sdr-vdot-estimate` and `sdr-vdot-paces` engines.

Output format and layout rules: [Plan Format](./references/plan-format.md). Read it before reporting or editing the plan.

## Engine

[scripts/personalize.js](./scripts/personalize.js), zero dependencies:

```sh
node <skill-dir>/scripts/personalize.js <normalized.json> <athlete.yaml> \
  --out <athlete>-<framework>.json [--strides count=8,seconds=20,recovery=60,days=2] [--week-start Sunday]
```

Without `--out` it prints only a per-week summary; `--json` prints the full plan.

## Procedure

1. **Check the inputs.** The normalized framework must have `ready: true`; if not, stop and send the user back to `coach-normalize-framework`. The athlete file needs `performances`, `preferences.peakWeek` and `preferences.restDays`.
2. **Compare volume.** Read the framework `rules` of kind `volume`. If the athlete's `peakWeek` lies outside the volume range the framework is written for (for example a 75 km peak against a framework for up to 64 km), tell the user and ask which framework to use before running the engine.
3. **Derive the strides option.** Look in the framework `rules` for strides advice. If present, pass `--strides` with count, seconds and recovery resolved to the **upper bound** of any range, and `days` set to the stated minimum number of days per week. If there is none, omit the option.
4. **Run the engine** from the workspace root. Default output path is `<workspace-root>/<athlete name lowercase>-<framework file stem>.json`; use the user's path if given. On an error, fix the input described in the message and rerun; do not work around it by hand.
5. **Review the summary.** For each week compare `planned_km` against `target_km` (should be within 0.1 km). Report every warning: `volume_shortfall`, `target_exceeded`, `rest_day_moved`, `strides_days_short`, `vdot_offset_missing`, and `framework_gap_rest`, which means the framework leaves days unspecified and the plan makes them rest days.
6. **Report briefly**: baseline VDOT and its source race, the weeks that needed extra rest days, warnings, and the output path. Mention the open items that belong to later steps: calendar scheduling.

## Decisions built into the engine

- Ranged quantities use the upper bound; a `0-20 min` taper day becomes a 20 min run.
- Rest weekdays map onto relative days assuming day 1 of each week is Sunday (Q1 on the race weekday). Pass `--week-start` to change this.
- Quality sessions are spaced as `floor(7j/n)+1`, so Q1 is always day 1.
- Easy runs are at least 30 minutes; days that cannot meet that become extra rest days.
- The framework's VDOT correction is added to the baseline VDOT from the athlete's most recent race; its prose rules for choosing a baseline are not applied.

## Completion checks

- The plan file parses, `days` is contiguous down to `before_race: 1` followed by the race day, and every weekly entry has a `weeks` summary.
- Every run has paces and distances; no easy run is under 30 minutes except where the framework dictates it.
- Rest days are on the athlete's preferred day number unless a warning says otherwise.
- No dates appear anywhere in the plan.
