# Normalized Training Framework, Version 1

This JSON contract is athlete-independent. Consumers must read structured fields,
not reinterpret `source_text` or prose rules to execute workouts. Refuse automated
planning when `ready` is false. Do not infer paces, dates, peak mileage, or VDOT.

## Document

All fields below are required unless explicitly marked optional. No extra fields.

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | integer | Always `1`. |
| `title` | string | Source title or a neutral descriptive title. |
| `source` | object | `label`: path or `provided text`; `input_units`: `metric`, `imperial`, `mixed`, or `unspecified`. |
| `ready` | boolean | True if and only if `issues` contains no `blocking` severity. |
| `rules` | array of objects | Each has `kind`, `text`, and `source_text` strings. Kinds: `scheduling`, `volume`, `optional`, `vdot`, `other`. Retain general advice here, not as invented sessions. |
| `entries` | array of entries | Scheduled source prescriptions, sorted by countdown. |
| `issues` | array of objects | Each has `severity` (`warning` or `blocking`), `code`, `path` (JSON Pointer, or empty string for document), `source_text`, and `message` strings. |

Keep relevant original wording in `source_text`, even when it contains imperial
units. Structured quantities are always metric/minutes. Unknown material semantics
require a blocking issue; a transparent, well-supported inference may be a warning.

## Entries and Countdown

Each entry has:

| Field | Type | Meaning |
| --- | --- | --- |
| `at` | object | `unit`: `week` or `day`; `before_race`: integer. |
| `peak_fraction` | number or null | Fraction of an unspecified athlete peak volume, usually 0-1; no conversion to kilometres. A dash or absent value is null. |
| `vdot_offset` | number or null | Add to the athlete's eventual baseline VDOT. Explicit zero differs from unknown/not supplied. |
| `source_text` | string | Original row or passage, including its time label. |
| `sessions` | array of sessions | All explicit sessions at this time, in source order. |

Race day is `{"unit":"day","before_race":0}`. Day `d` is exactly `d` days before
the race. Week `w` is the seven-day bucket from `7*w` down to `7*(w-1)+1` days
before the race, inclusive. For example, 18w covers days 126-120, 2w covers 14-8,
and 1w covers 7-1. These are countdown buckets, not Monday-Sunday calendar weeks.
If the source explicitly uses another convention, ask before mapping it; preserve
the original label and report a blocking issue until the mapping is established.
Sort by `7*before_race` for weeks and `before_race` for days, descending.

Weekly entries and final daily taper entries share this single array. If weekly
and daily entries cover the same day range, do not assume replacement or addition:
resolve the relationship with the user, then remove the superseded prescription
with an explanatory warning, or leave both and mark the overlap blocking. Do not
insert entries for unspecified days, including race day. A missing day is not rest.
Merge split source passages for the same `at` only when clearly complementary.

## Sessions

Each session has these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Source Q label, such as `Q1`, or generated `S1`, `S2` in source order; unique within the entry. |
| `kind` | string | `quality`, `support`, or `rest`. Q-labeled sessions are quality even if entirely E; unlabeled easy daily runs are support. Explicitly described quality sessions need not have a Q label. |
| `optional` | boolean or null | True if explicitly droppable, false when no optionality is indicated, null if ambiguous. Preserve any condition in `rules`. |
| `source_text` | string | Original session description. |
| `steps` | array of steps | Ordered prescription; empty only for explicit rest. |

An explicit rest day is `kind: rest` with no steps. A `0-20 min E` prescription
is a support run with that range, not an unconditional rest day. Session order is
source order, not an invented order of execution on specific weekdays.

## Quantities and Steps

A quantity is `{"unit":"km"|"min", "min":number, "max":number}`. Bounds must be
finite and nonnegative, with min <= max. A fixed amount has identical bounds.
Do not convert distance to time or time to distance. If the source offers a real
choice such as distance *or* duration, ask which to use; until resolved, keep a
null quantity and a blocking issue with both alternatives in the source text.

Run step, all fields required:

```json
{"type":"run","intensity":"E","amount":{"unit":"km","min":4.828032,"max":4.828032}}
```

`intensity` is `E`, `M`, `T`, `10K`, `I`, `R`, `FR`, `ST`, or null. Normalize
easy/long/L to E, marathon/MP to M, threshold to T, interval to I, repetition to R,
and strides to ST when context establishes those meanings. Only map H to I or
other framework-specific shorthand when explicitly supported. Unknown intensity
or amount is null with a blocking issue. Preserve unfamiliar efforts such as
hill sprints in the issue rather than silently forcing them into a Daniels zone.

Recovery step, all fields required:

```json
{"type":"recovery","mode":"jog","intensity":null,"amount":{"unit":"min","min":2,"max":2}}
```

`mode` is `rest`, `jog`, `easy`, or `unspecified`. `intensity` is E only if the
source explicitly says E/easy; otherwise null is valid here and is not blocking.
Unqualified `rest` is rest, not automatically easy jogging. Amount can be null
when unspecified, but requires a blocking issue. `mode: unspecified` is allowed
when the source specifies only a generic recovery and is recorded as a warning.
Standalone recovery steps occur once at their position in the sequence.

Repeat step, all fields required:

```json
{
  "type":"repeat",
  "count":5,
  "steps":[{"type":"run","intensity":"I","amount":{"unit":"min","min":3,"max":3}}],
  "recovery":{
    "placement":"between",
    "step":{"type":"recovery","mode":"jog","intensity":null,"amount":{"unit":"min","min":2,"max":2}}
  }
}
```

`count` is a positive integer or null (null requires a blocking issue). `steps`
is a nonempty array of run, recovery, or repeat steps, executed once per repetition.
`recovery` is null only when no recovery is prescribed or implied. Otherwise it is
an object with `placement` (`between`, `after_each`, or `unspecified`) and `step`
(a recovery step). `between` executes count-1 recoveries; `after_each` executes
count recoveries, including one after the final bout. Do not encode the same
recovery both inside `steps` and in `recovery`.

Explicit "between" determines placement. Bare "w/ rests" does not establish
whether the last recovery is included: use `unspecified` with a blocking issue.
Do not silently treat an adjoining E run as the final recovery. For interval or
repetition sets without recovery details, such as `5 x 0.8 R`, retain a recovery
object with unspecified placement and null amount and add a blocking issue.
An explicitly nonstop repeat can have null recovery. A group that explicitly
includes a recovery inside every repeated sequence uses that recovery in `steps`
and null outer recovery instead.

## Unit Resolution and Fidelity

- Explicit units on a quantity override source defaults. In a declared imperial
  framework, bare distances are miles; in metric, kilometres, unless the framework
  defines shorthand differently. Without a declaration or clear definition, ask.
- Use 1 mile = 1.609344 km, 1 metre = 0.001 km, 1 second = 1/60 minute, and
  1 hour = 60 minutes. For example, 800 m = 0.8 km and 30 s = 0.5 min.
- A bare `800 T` within an imperial framework is not automatically 800 metres.
  If contextual evidence supports a metre exception, document the inference;
  otherwise keep amount null and ask. Do not produce an absurd 800-mile workout.
- Do not guess missing recovery durations, split an overall distance into invented
  warm-up/work/cool-down components, or treat a typographical artifact as distance.
- Retain general prerequisites, scheduling constraints, race substitution advice,
  and non-additive VDOT rules in `rules`. These are not executable prescriptions;
  consuming workflows must explicitly apply relevant rules before personalization.
  A rule needed to interpret an entry's dose or VDOT makes that entry blocking
  until resolved. Advisory rules alone do not prevent normalization readiness.
- Explicit row VDOT offsets outrank general prose. For example, the supplied 2Q
  tables say -1 at 6w although the prose phase rule may imply zero: retain -1 and
  emit a `vdot_conflict` warning. Never silently rewrite the table.

## Complete Example

Input: "Metric. Two weeks out: Q1 = 2 km E + 5 x (3 min I with 2 min jog between)
+ 1 km E; use VDOT minus one. Four days out: 30-40 min easy."

```json
{
  "schema_version":1,
  "title":"Training framework",
  "source":{"label":"provided text","input_units":"metric"},
  "ready":true,
  "rules":[],
  "entries":[
    {
      "at":{"unit":"week","before_race":2},
      "peak_fraction":null,
      "vdot_offset":-1,
      "source_text":"Two weeks out: Q1 = 2 km E + 5 x (3 min I with 2 min jog between) + 1 km E; use VDOT minus one.",
      "sessions":[{
        "id":"Q1","kind":"quality","optional":false,
        "source_text":"Q1 = 2 km E + 5 x (3 min I with 2 min jog between) + 1 km E",
        "steps":[
          {"type":"run","intensity":"E","amount":{"unit":"km","min":2,"max":2}},
          {
            "type":"repeat","count":5,
            "steps":[{"type":"run","intensity":"I","amount":{"unit":"min","min":3,"max":3}}],
            "recovery":{"placement":"between","step":{"type":"recovery","mode":"jog","intensity":null,"amount":{"unit":"min","min":2,"max":2}}}
          },
          {"type":"run","intensity":"E","amount":{"unit":"km","min":1,"max":1}}
        ]
      }]
    },
    {
      "at":{"unit":"day","before_race":4},
      "peak_fraction":null,
      "vdot_offset":null,
      "source_text":"Four days out: 30-40 min easy.",
      "sessions":[{
        "id":"S1","kind":"support","optional":false,
        "source_text":"30-40 min easy",
        "steps":[{"type":"run","intensity":"E","amount":{"unit":"min","min":30,"max":40}}]
      }]
    }
  ],
  "issues":[]
}
```

If a later input says only `5 x 0.8 R`, a representative issue is
`{"severity":"blocking","code":"missing_recovery","path":"/entries/0/sessions/0/steps/0/recovery","source_text":"5 x 0.8 R","message":"Recovery duration and placement are not specified; confirm before scheduling."}`.
Use descriptive stable codes such as `unknown_unit`, `unknown_intensity`,
`ambiguous_countdown`, `ambiguous_recovery`, `overlapping_entries`,
`vdot_conflict`, and `source_artifact`. An issue path must target an existing
field or object in the delivered JSON, and must be updated after sorting entries.