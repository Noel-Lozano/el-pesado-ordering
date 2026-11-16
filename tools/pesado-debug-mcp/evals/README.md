# pesado-debug evals

These measure whether the agent workflow (`/investigate_ci_failure`, the `ci-triager`
subagent and the six tools) finds the real cause of a CI failure, and how much faster
than doing it by hand. "It helps" becomes numbers. They also catch regressions when a
prompt or tool description changes. ADR-007, "Evaluation", explains why.

## What's here

| Path | What it is |
|---|---|
| `cases/*.yaml` | One case per file: the `eval/<case>` branch, the single injected fault, the expected result (`category`, `suspect_file`, `verdict`) and the recorded `run_id`. |
| `run.md` | Step by step: create the branches, run CI, run the investigation with and without the server, record the results. |
| `results.md` | The results table, latest run first. |

A test (`tests/unit/test_evals_cases.py`) checks that every case file is well-formed and
that its `branch` equals `eval/<file name>`.

## The cases

| Case | Injected fault | Expected verdict | Root cause in |
|---|---|---|---|
| `unit-assertion` | Wrong expected value in a backend unit test | `deterministic_fail` | the test itself |
| `logic-bug` | `<=` instead of `<` at closing time in `pickupRules.ts` | `deterministic_fail` | `pickupRules.ts` |
| `flaky-timing` | A test that asserts `Date.now() % 2 === 0` | `flaky` | the test itself |
| `typecheck` | A type error in a backend route | `no_junit` | `orders.ts` (from the logs) |
| `frontend-unit` | `CENTAVOS_PER_PESO = 10` in the frontend money helper | `deterministic_fail` | `money.ts` |
| `integration-db` | An integration test that needs a menu item `seed:menu` doesn't create | `deterministic_fail` | the test's data |

## Reading the results

- **Root cause correct**: the agent's suspect file is the case's `expected.suspect_file`.
- **Verdict correct**: the agent's verdict is the case's `expected.verdict`.
- **Tool calls / time**: from the command to the final answer.
- **By hand**: the same case, found with only `gh` and the Actions UI.

The `eval/*` branches are never merged. Their CI runs are kept and reused. Rerun the evals
only when a prompt, tool description or tool behavior changes.
