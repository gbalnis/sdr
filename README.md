# Spec-Driven Running

Spec-Driven Running (SDR) is an APM project that packages AI agent skills for building race-relative training plans for runners. Its workflows turn a source training framework into validated structured data, personalize that framework for an athlete using deterministic Node.js engines, and optionally export workouts to an [intervals.icu](https://intervals.icu/) workout-library plan.

>[!IMPORTANT]
>The agent is inspired and has a bias for Jack Daniels' training philosphy: _Running Formula_ book, his research and teaching. The training framework notation is based on the way Jack specified his training plans, his pace zones, etc. If you are using different language, you might need to explain some concepts to the agent.

## What It Does

- **Normalize a framework:** convert source text into athlete-independent JSON while preserving workout structure, units, countdowns, coaching rules, and unresolved questions.
- **Personalize a plan:** combine a ready normalized framework with an athlete profile to calculate VDOT-based paces, distances, easy runs, and rest days.
- **Export a plan:** convert a personalized plan into Intervals.icu workouts and save them in a library `PLAN`. Exporting does not schedule workouts.
- **Provide focused tools:** estimate VDOT, look up training paces, and calculate Daniels training-intensity points with deterministic scripts.

The `sdr-training-planner` agent coordinates the full workflow. Each stage's skill documentation is authoritative for its inputs, decisions, validation, and safety boundaries.

## Requirements

- Node.js for the zero-dependency calculation and conversion scripts.
- Python 3 and `uvx` (provided by `uv`) to run the Intervals.icu MCP server.
- APM (Agent Package Manager) to install project dependencies and deploy its agent assets.
- GitHub Copilot or VS Code for the configured agent targets.
- For Intervals.icu export, access to an Intervals.icu account and its MCP server credentials.

Install the project dependencies and deploy the configured agent assets from the repository root:

```sh
apm install --frozen
```

The Intervals.icu MCP server reads credentials from a local `.env` file, which is ignored by Git. Configure the variables required by the Intervals.icu MCP server locally; never commit credentials. The workspace MCP configuration currently points to `/workspaces/sdr/.env`, so update that local configuration if the repository is checked out elsewhere.

## Use The Planner

In Copilot Chat, invoke `sdr-training-planner` and provide an athlete profile and source framework. For example:

```text
@sdr-training-planner
Athlete: tests/data/athletes/ben.yaml
Framework: tests/data/inputs/Daniels_2Q_89k.md
Prepare the local plan only; do not export it.
```

The planner asks before resolving material ambiguities or mismatches. A complete workflow request authorizes an Intervals.icu library export; preparing a local plan does not. Workouts are never scheduled by this workflow.

The stages can also be requested individually:

1. Normalize source text or a framework file with `sdr-normalize-framework`. Review its readiness and blocking issues before planning.
2. Personalize the ready framework with `sdr-personalize-framework` and an athlete YAML profile.
3. Export a validated personalized JSON plan with `sdr-intervals-export-plan` when a library export is requested.

For exact JSON contracts, script arguments, and stage-specific checks, see the skill docs under [`.apm/skills`](.apm/skills/).

## Repository Layout

```text
.apm/                    Canonical APM agent and skill sources
.github/agents/          GitHub Copilot custom agent definitions
.agents/                 APM-deployed Copilot skills (generated)
apm.yml                  APM project metadata and dependency configuration
apm.lock.yaml            Resolved APM dependency and deployment lockfile
tests/data/inputs/        Source training framework examples
tests/data/frameworks/    Normalized framework examples
tests/data/athletes/      Athlete profile examples
tests/data/plans/         Personalized plan examples
```

Edit skills and agent sources in `.apm/`. Do not hand-edit `.agents/` or other APM-deployed copies; regenerate them with APM after source changes. The GitHub agent definition is maintained in `.apm/agents/` and deployed to `.github/agents/`.

## Deterministic Scripts

The calculation and conversion engines have no Node package dependencies. For example, estimate VDOT from a race result:

```sh
node .apm/skills/sdr-vdot-estimate/scripts/vdot.js "half marathon" 1:39:13 --json
```

Personalize a normalized framework with an athlete profile:

```sh
node .apm/skills/sdr-personalize-framework/scripts/personalize.js \
  tests/data/frameworks/Daniels_2Q_89k.json \
  tests/data/athletes/ben.yaml \
  --out /tmp/ben-Daniels_2Q_89k.json
```

Scripts print structured output or an error and do not replace the skill's review steps. Consult each skill's `SKILL.md` before using its engine directly.

## Validation

Check APM lockfile integrity with:

```sh
apm audit --ci
```

The repository currently provides example inputs and outputs rather than a standalone automated test suite. When changing a skill or engine, run the relevant Node script against the examples and acceptance cases documented in that skill, inspect the output, and verify any changed APM deployment. See [Contributing](CONTRIBUTING.md).

## License

This project is distributed under the [MIT License](LICENSE).
