# Running the evals

## 1. Create the case branches (once)

For each `cases/<case>.yaml`:

1. Branch `eval/<case>` from `feat/debug-mcp-server` (or `main` once this is merged). The
   base must upload the `junit-*` artifacts, or `get_failing_tests` has nothing to read.
2. Apply only the fault the YAML describes. Keep the file's line endings, so the diff is
   the one-line fault and nothing else.
3. Commit with the message `eval: <case>`, push, and never merge.

## 2. Run CI on each branch

`ci.yml` runs on PRs into `main`, pushes to `main`, and manual dispatch, so dispatch it:

```powershell
gh workflow run ci.yml --ref eval/<case>
gh run list --workflow ci.yml --branch eval/<case> --limit 1
```

Put the run ID in the case's `run_id:`. For `flaky-timing`, the recorded run must be a
failing one: rerun the workflow until the clock test fails.

## 3. With the server

For each case, in a **fresh** Claude Code session at the repo root:

1. Check that `/mcp` shows `pesado-debug` connected (and the test DB is up, for the
   integration case).
2. Run `/investigate_ci_failure <run_id>` and start a timer.
3. Stop the timer at the final answer. Record in `results.md`:
   - root cause correct? (the suspect file matches `expected.suspect_file`)
   - verdict correct? (matches `expected.verdict`)
   - number of tool calls
   - time from command to answer

## 4. Without the server (baseline)

For the same cases, find the root cause with only `gh` and the Actions UI, either by
yourself or in a fresh Claude Code session with `pesado-debug` disabled in `/mcp`. Record
the same columns.

## 5. Summarize

At the top of `results.md`: cases correct out of 6, median time with and without the
server, and anything the agent got wrong and why. Keep older results below the newest.
