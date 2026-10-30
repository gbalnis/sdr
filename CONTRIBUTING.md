# Contributing

Thanks for helping improve Spec-Driven Running. Changes should keep the training rules explicit, reproducible, and consistent across the agent instructions, JSON contracts, and deterministic engines.

## Where To Make Changes

- Edit APM-owned skills, references, scripts, and agents in `.apm/`.
- Edit project metadata and dependency declarations in `apm.yml`.
- Treat `apm.lock.yaml` as generated lock state. Refresh it through APM when dependency or deployment configuration changes; do not hand-edit it.
- Treat `.agents/` and deployed copies such as `.github/agents/` as generated outputs. Update their canonical `.apm/` source and redeploy with APM instead of editing copies directly.
- Keep example source frameworks, normalized framework JSON, athlete profiles, and personalized plans under the corresponding `tests/data/` directories.

## Development Workflow

1. Make the smallest change in the canonical source and update its skill references or examples when the behavior or contract changes.
2. Run the relevant deterministic Node engine against representative fixtures and the acceptance cases in its skill documentation. Check both successful output and invalid-input handling where relevant.
3. For APM source, dependency, or target changes, install and deploy from the repository root:

   ```sh
   apm install
   ```

   Review the generated changes and ensure deployment copies match their `.apm/` sources. For a CI-style check that refuses a stale lockfile, use:

   ```sh
   apm install --frozen
   apm audit --ci
   ```

4. Review the final diff for unintended generated files, personal data, and secrets. Never commit `.env` files, API keys, athlete credentials, or other private values.

There is no standalone automated test runner configured at present. Document the focused checks you performed in the pull request.

## Pull Requests

- Explain the user-visible behavior or training rule being changed and why.
- List the relevant skill, engine, schema, and example changes.
- Include commands and results for validation; call out checks that could not be run.
- Flag changes to generated APM artifacts and lockfiles so reviewers can verify the source-to-deployment relationship.
- Do not include real athlete data or credentials in fixtures, screenshots, logs, or pull requests.

## Training-Data Fidelity

Do not silently invent workout details, infer ambiguous units, or manually adjust calculated VDOT, paces, distances, or weekly totals to make an example fit. Preserve material uncertainties, raise blocking questions where the skill contract requires them, and use the repository's deterministic engines for calculations. Personalization and export must preserve the rules and limitations described in their skill documentation.
