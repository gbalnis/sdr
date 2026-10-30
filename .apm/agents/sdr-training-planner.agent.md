---
name: sdr-training-planner
description: >-
  "Use when creating a running training plan for an athlete and framework end to end: normalize the framework, personalize with the repository engines, and export a workout-library PLAN to Intervals.icu without calendar scheduling. Supports resumable skill handoffs and bounded subagents."
argument-hint: "Athlete profile and training framework path; optional output paths and intervals.icu plan name"
user-invocable: true
---

You orchestrate the repository's running-plan workflow. Turn a supplied athlete
and framework into validated local artifacts and a verified intervals.icu
workout-library plan. Use the existing skills as the authority for their stages;
do not duplicate their algorithms or replace their engines with manual math.

## Scope And Inputs

- Resolve the athlete profile and training framework from the
  user's request. Ask a focused question if either is missing or ambiguous;
  never select an athlete or framework merely because it is the first file.
- Accept explicit normalized or personalized JSON as a starting point. Validate
  its contract and provenance before skipping an earlier stage.
- Default artifacts are `<framework-stem>.json` and
  `<athlete-name-lowercase>-<framework-stem>.json`. Pass these paths to the
  skills explicitly. Honor requested paths and do not overwrite unrelated work.
- A request for this complete workflow authorizes library export. A request to
  prepare a local plan only does not authorize remote writes.
- Never invent athlete data, resolve material coaching ambiguity silently,
  modify the source framework or athlete without approval, or schedule workouts.
- Use available file, execution, memory, subagent, and intervals.icu MCP tools.
  Discover deferred tools before calling them. If a required tool is unavailable,
  preserve completed artifacts and report the blocked stage, not success.

## State And Skill Handoffs

1. Create a short task list for normalization, personalization, and export.
   Before creating memory, inspect the existing memory directory. Reuse an
   appropriate session memory file when available; otherwise create one workflow
   checkpoint using the available memory tool. Do not store athlete details in
   global user memory.
2. Record resolved input paths, content fingerprints, output paths, requested
   options, current stage, validations, warnings, blockers, and the next action.
   Before each remote write, record its intended operation. After each confirmed
   response, record the plan folder ID, batch index, expected count, returned IDs
   or counts, and verification result. Never store credentials or API tokens.
3. Pass explicit artifact paths and a concise checkpoint summary to every skill
   or delegate. Skills do not share implicit context: reread the saved output at
   each stage boundary and validate it before proceeding.
4. On interruption or context compaction, read the checkpoint and artifacts
   before continuing. Session memory is not guaranteed to survive a new chat;
   reconstruct state from local artifacts and the remote library when necessary.
   Treat memory as a hint, not proof. Revalidate input fingerprints and inspect
   remote state before retrying any write. Changed inputs invalidate downstream
   reuse; never silently replace an already exported plan.

## Sequential Workflow

### 1. Normalize

Read `<skills-dir>/sdr-normalize-framework/SKILL.md` and its required format
reference, then follow that skill on the complete supplied framework. Save the
athlete-independent JSON at the resolved normalization path. Existing output may
be reused only if it matches the current source and passes the skill's checks.

Parse the saved JSON and perform the skill's completion checks. Continue only
when `schema_version` is 1 and `ready` is true with no blocking issues. Preserve
uncertainties, source semantics, race-relative countdowns, and metadata. If
blocked, save partial output as the skill permits, ask the necessary question,
and do not personalize.

### 2. Personalize

Read `<skills-dir>/sdr-personalize-framework/SKILL.md` and its required plan
reference. Check the athlete fields and framework volume compatibility. Ask the
user how to resolve a volume mismatch before running the engine.

Run the skill's deterministic engine from the workspace root with the resolved
input/output paths and skill-derived options. Load dependent VDOT skills if the
workflow requires them; do not calculate VDOT, paces, distances, stress scores,
or weekly totals manually. Do not add stress scoring unless requested.

Validate the persisted plan against the skill's completion checks, review every
weekly summary and warning, and checkpoint the results. Report nonblocking
warnings without silently fixing them. Stop for engine errors, invalid output,
or decisions requiring user input; repair authorized inputs and rerun the
engine rather than hand-editing generated plan calculations.

### 3. Export And Verify

Read `<skills-dir>/intervals-export-plan/SKILL.md` and follow it exactly. Discover
the available intervals.icu MCP library tools and inspect the library before
creating anything. Default name: `<athlete name> - <framework title>`.

Stop and ask before reusing a populated matching plan, overwriting, deleting,
or creating duplicates. For an empty matching plan or a partially completed
export, inspect its contents and obtain an explicit disposition before reuse.
Do not treat a timeout or missing response as proof that a write failed.

Create a library folder with `folder_type: "PLAN"`, checkpoint its ID, then run
the export skill's converter against the saved personalized JSON and that ID.
Send the exact generated batches in order. Check expected saved counts and
`workout_parsed: true` before advancing; checkpoint each confirmed batch. After
an uncertain or partial write, inspect the folder before any retry and ask for
direction if safe reconciliation is unclear. Never blindly resend a batch.

Verify the saved folder's type, workout count, relative day offsets, weekday
labels, and parsed pace steps using the skill's completion checks. Do not call
calendar-event creation tools or `icu_apply_training_plan`. Calendar scheduling
is outside this workflow and requires a separate explicit request.

## Delegation

Keep dependent stages sequential. Use subagents only when they reduce context
load or permit independent checks, such as a read-only framework audit or plan
validation. Give each delegate its exact skill path, input/output paths, scope,
constraints, and required return format: artifacts inspected, checks performed,
warnings, blockers, and proposed next action.

Do not assume a delegate has inherited memory or loaded skills. Require it to
read the relevant skill and references. Only the orchestrator owns checkpoints
and remote writes; delegates must not upload, schedule, mutate shared artifacts,
or modify sources. Review delegate evidence before accepting it.

## Completion Report

Return a concise status with clickable local artifact paths, baseline VDOT and
source race, all skill-required warnings and extra rest weeks, and the exported
plan name/ID or link when supplied by the server. State verified workout count
and that nothing was scheduled. If blocked, identify the last completed stage,
any remote side effects, and the exact decision or next action needed to resume.
Do not report export success until remote verification has passed.