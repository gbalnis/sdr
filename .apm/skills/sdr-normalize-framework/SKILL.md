---
name: sdr-normalize-framework
description: 'Normalize an unstructured running training framework into athlete-independent, race-relative weekly or daily sessions. Use when: coach.normalize-framework, importing a training framework, interpreting loose workout descriptions, extracting Q1/Q2/Q3 sessions, converting imperial distances to metric and durations to minutes, or preserving framework VDOT corrections for downstream planning.'
argument-hint: 'Framework text or path, optionally an output path'
allowed-tools: node
---

# Normalize Training Framework

Turn loose prose, tables, or workout shorthand into the versioned JSON contract in
[Normalized Format](./references/normalized-format.md). Read that reference before
producing output. The result is a framework, not an athlete's training plan.

## Procedure

1. **Read the whole supplied framework.** Identify its title, unit declarations,
   shorthand definitions, race-relative labels, workout tables, and coaching rules.
   Accept pasted descriptions as well as files. Do not require a Markdown table.
2. **Establish the countdown.** Parse weeks and days *before* race day, which is
   day zero. Preserve weekly and daily granularity separately. Never interpret
   countdown labels as elapsed program weeks or assign calendar dates. Retain all
   explicit daily taper entries, including easy runs and rest days. Do not invent
   missing days or fill daily entries from overlapping weekly entries.
3. **Extract sessions.** Split Q labels at top level, respecting parentheses,
   repetition groups, and recovery clauses. Allow any number of sessions per week,
   not just two. Keep source order and Q identifiers, including an E-only Q session.
   Keep unlabeled explicit daily runs as supporting sessions. Do not turn general
   easy-day or stride advice into additional scheduled quality sessions.
4. **Parse each session into ordered steps.** Preserve warm-up, work, recoveries,
   and cool-down in their original order. Represent repetitions structurally,
   including nested groups and whether recovery occurs between repetitions or
   after every repetition. Unless stated otherwise, for repetitions plan recovery 
   after each repetition, including the last one. Do not add warm-ups, cool-downs, 
   or recoveries that were not supplied.
5. **Normalize quantities and intensities.** Use kilometres and minutes only;
   preserve ranges and zero lower bounds. Convert miles with exactly 1.609344 km
   per mile, metres by dividing by 1000, seconds by 60, and hours by multiplying
   by 60. Round converted values to at most six decimal places, not intermediate
   calculations. Keep distances as distances: no athlete, VDOT pace lookup, stress
   scoring, or distance-to-duration estimation belongs in this skill. Resolve
   aliases only when their meaning is established; do not reinterpret a source's
   explicit R workout as I because another coach might prescribe it differently.
6. **Carry framework metadata forward.** Retain peak-volume fractions, optional
   session rules, scheduling guidance, and VDOT offsets. An explicit offset is an
   additive correction, not an absolute VDOT. Missing offsets are null, not zero.
   Expand explicit phase offsets to their applicable entries; explicit row values
   take precedence over prose, with a warning for any conflict. Preserve formulas
   requiring recent/goal VDOT as unresolved rules rather than inventing an offset.
   Formatting indicates optionality only when the source explains that convention.
7. **Resolve uncertainty honestly.** Ask a targeted question when units, countdown
   semantics, recovery placement, or other material details cannot be established.
   If unanswered, emit partial structured data, null unknown fields, and blocking
   issues as specified in the contract. Preserve original text and assumptions.
   Never silently discard a malformed token, choose a range midpoint, or repair a
   suspected transcription error. Clearly extraneous table artifacts may be
   excluded only with a warning recording the excluded text and reason.
8. **Validate and deliver.** Apply the completion checks below. Return JSON, or
   write it to the user's output path if provided; do not overwrite source files.
   Without a requested path, return JSON without creating framework files. Report
   readiness and unresolved questions briefly outside the JSON. Do not normalize
   every repository example merely because this skill is being created.

## Completion Checks

- Every source time entry and session is accounted for exactly once; gaps remain
  gaps. Weekly and daily entries can coexist without double-counting.
- All countdowns are nonnegative integers; weeks start at one and day zero is the
  race. Entries are in descending days-before-race order, with stable source order
  for ties. Ambiguous overlapping prescriptions have blocking issues.
- Every known quantity uses `km` or `min`, with nonnegative ordered bounds. Each
  step, repetition, recovery placement, optionality, and source intensity agrees
  with the original prescription.
- VDOT offsets and peak fractions match the source, including explicit zeroes;
  conflicts, guesses, and unavailable values are not hidden.
- All required fields and nullability follow the bundled contract; output parses
  as JSON, uses schema version 1, and contains no athlete-specific pace or date.
- `ready` is true exactly when no blocking issue exists. A syntactically valid
  document with unresolved workout semantics is not ready for automated planning.

## Local Acceptance Cases

Use the supplied framework as the primary check. When changing this skill, also
check these representative cases against the format reference:

- Imperial `3 E` becomes a 4.828032 km E run, not three minutes.
- `90-110 min E` and `0-20 min E` preserve both endpoints.
- `5 x (3 min I w/2 min jog between)` has five work bouts and four recoveries.
- `5 x 0.8 R` in a metric framework preserves 0.8 km per bout and flags missing
  recovery details; it does not invent a jog duration.
- A week containing Q1, Q2, and Q3 retains all three. A day labeled `4d` remains
  four days before the race, not a fourth week or a weekday.
- A row offset of -1 remains -1 even if general prose implies zero; report the
  discrepancy. An omitted offset stays null.