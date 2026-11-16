# Eval results

Newest first. See [README.md](README.md) for what is measured and [run.md](run.md) for how.

## 2026-11-15: pipeline check by the implementing agent (not a blind eval)

**Read this first.** These runs were done by the agent that built pesado-debug (Claude Opus
5.5) in the same session in which it created the faults, so it knew every answer
beforehand. They show that the tools work end to end on real CI runs and real local
reruns. They do **not** show how well a fresh agent diagnoses unknown failures. The
fresh-session columns and the by-hand baseline (run.md steps 3 and 4) are still to be done
by the maintainer; those are the numbers that measure the workflow.

How: the `/investigate_ci_failure` steps, followed one tool call at a time over a real
stdio MCP client. GitHub was read with the `gh` CLI's token (the fine-grained PAT didn't
exist yet). Local reruns used a git worktree on each `eval/*` branch and the
docker-compose test DB. "Tool time" is the wall-clock time of the tool calls only, without
any model time.

| Case | Run | Verdict (expected) | Suspect found | Tool calls | Tool time | Correct? |
|---|---|---|---|---|---|---|
| `unit-assertion` | [43791583132](https://github.com/Noel-Lozano/el-pesado-ordering/actions/runs/43791583132) | deterministic_fail (deterministic_fail) | `pricing.test.ts:19`: the expected value is wrong, not the code | 3 + 1 file read | 19 s | yes, yes |
| `logic-bug` | [43791586855](https://github.com/Noel-Lozano/el-pesado-ordering/actions/runs/43791586855) | deterministic_fail (deterministic_fail) | `pickupRules.ts:75`: `<=` against closing time | 3 + 1 file read | about 20 s | yes, yes |
| `flaky-timing` | [43791815993](https://github.com/Noel-Lozano/el-pesado-ordering/actions/runs/43791815993) | flaky, 6/10 passed (flaky) | `clock.test.ts`: depends on `Date.now()` | 3 | 19 s | yes, yes |
| `typecheck` | [43791592528](https://github.com/Noel-Lozano/el-pesado-ordering/actions/runs/43791592528) | no_junit (no_junit) | `orders.ts(14,7)` TS2322, from `get_run_logs`; both jobs fail on it | 3 | 17 s | yes, yes |
| `frontend-unit` | [43791595937](https://github.com/Noel-Lozano/el-pesado-ordering/actions/runs/43791595937) | deterministic_fail (deterministic_fail) | `money.ts`: every price 10x too large, so the centavos divisor | 3 | 21 s | yes, yes |
| `integration-db` | [43791599351](https://github.com/Noel-Lozano/el-pesado-ordering/actions/runs/43791599351) | deterministic_fail (deterministic_fail) | `orders.test.ts:37`: looks up a menu item seed:menu doesn't create (test data) | 3 | 18 s | yes, yes |

**Summary:** 6/6 root causes and 6/6 verdicts, median tool time 19 s, 3 to 4 tool calls per
case. Given the caveat above, read this as "the pipeline works", not as an accuracy figure.

**Bugs these runs found in pesado-debug (both fixed before this commit):**

1. `rerun_test` changed JUnit's `"describe > test"` names to `"describe test"` for Vitest's
   `-t`, which Vitest 5 doesn't match. Every name taken from `get_failing_tests` came back
   "No test matched". Found by `unit-assertion`, fixed in `fix(debug-mcp): pass JUnit test
   names to Vitest's -t unchanged`.
2. The JUnit parser missed Vitest frames written as `❯ menuItem path:37:23`, so the most
   useful frame was left out of the stack. Found by `integration-db`, fixed in
   `fix(debug-mcp): parse Vitest stack frames that name a function without parentheses`.

**Other observations:**

- `typecheck` fails two jobs (Backend at Typecheck, Frontend at "Build and start the API
  for prerendering"); `get_run_logs` shows the same TS2322 in both, so the agent doesn't
  chase a second cause.
- `flaky-timing`'s first dispatch passed, as a coin-flip test does half the time; the
  recorded run is the second dispatch.
- Every eval run's **Test report** job wrote its summary; the **Debug MCP** job passed on
  all of them.

### Still to do (maintainer)

| Case | Fresh session: root cause / verdict / calls / time | By hand: time |
|---|---|---|
| `unit-assertion` | | |
| `logic-bug` | | |
| `flaky-timing` | | |
| `typecheck` | | |
| `frontend-unit` | | |
| `integration-db` | | |
