"""The three agent workflows, as MCP prompts (Claude Code shows them as slash commands).

Plain functions returning text, so tests can check them without a server.
Every tool named here must exist on the server (tests/unit/test_prompts.py).
"""

SUPABASE_RULE = (
    "Never use the `supabase` MCP server's tools during this work: it points at the production "
    "database. Everything you need is in the pesado-debug tools."
)


def investigate_ci_failure(run_id: int | None = None) -> str:
    target = f"run {run_id}" if run_id is not None else "the most recent failed CI run"
    if run_id is not None:
        first_step = (
            f"1. Use run_id {run_id}. Call `get_failed_runs` (limit 5) only if you need its "
            "failed jobs and steps."
        )
    else:
        first_step = (
            "1. Call `get_failed_runs` (limit 5) and take the most recent run, unless the user named another."
        )
    return f"""Investigate why {target} failed in El Pesado's CI, and report the root cause.

Rules:
- Do not edit any code unless the user asks you to. This is an investigation.
- {SUPABASE_RULE}
- If the `ci-triager` subagent is available, delegate steps 1 to 4 to it and work from its finding.

Steps:
{first_step}
2. For each failed job that ran tests (Backend, Frontend), call
   `get_failing_tests` with source="ci", the workspace ("backend" or "frontend") and the run_id.
3. If a job has no JUnit artifact (lint, typecheck, build or setup failures), call `get_run_logs`
   for that run. Narrow with `grep` or `job_name` if the output is truncated.
4. For each failing test, call `rerun_test` with its workspace, file (relative to the workspace,
   e.g. "src/test/unit/lib/pricing.test.ts") and test_name, to tell a real failure from a flake.
   For integration files the tool resets the test database and runs seed:menu itself, as CI does.
   Don't seed a scenario before it: the rerun would wipe it.
5. Only if the failure must be reproduced by hand through the API or UI, call `seed_test_data`
   with the closest scenario, and say which one and why.
6. Report, in this order:
   - Root-cause hypothesis, in one or two sentences.
   - Evidence: file:line from the stack, and the exact log or assertion lines.
   - Verdict per failing test: deterministic_fail, flaky, passes_locally, or no_junit.
   - What you did not check, if anything.
"""


def summarize_failures(run_id: int) -> str:
    return f"""Summarize why CI run {run_id} failed, for a PR comment or a bug report.

Rules:
- Do not edit code.
- {SUPABASE_RULE}

Steps:
1. Call `get_failing_tests` with source="ci" and run_id={run_id} for each workspace whose job failed
   (call `get_failed_runs` first if you don't know which jobs failed). If there is no JUnit
   artifact, call `get_run_logs` for the run instead.
2. Write exactly these three parts, in this order, and nothing else:
   1. One line: what broke, in which suite.
   2. A bug report: Title; Steps to reproduce; Expected; Actual; Evidence (file:line, the first
      error line, and the run URL).
   3. Likely cause, labeled "Hypothesis" unless you confirmed it with `rerun_test`.
3. At most 200 words in total, so it fits in a PR comment.
"""


def write_regression_test(run_id: int | None = None, file: str | None = None) -> str:
    source = f"CI run {run_id}" if run_id is not None else "the failure we just investigated"
    where = f" The failing code is in {file}." if file else ""
    return f"""Write one regression test for the bug behind {source}.{where}

Rules:
- Do not fix the bug. Your job ends with a test that fails for the right reason.
- {SUPABASE_RULE}

Steps:
1. Confirm the root cause first (from the run with `get_failing_tests` / `get_run_logs`, or from the
   investigation above). If it isn't confirmed, stop and say what is missing.
2. Write ONE test, in the existing style of <workspace>/src/test/unit/ (use src/test/integration/
   only if the bug needs the database), mirroring the source path it covers. It must fail because
   of this bug and only this bug.
3. Run it with `rerun_test` (times=3). It must come back deterministic_fail with the expected error
   message. If it passes or is flaky, revise it once; if it still isn't deterministic_fail, stop
   and report what happened.
4. Stop. Report the test's path and the failure message it produces. Don't fix the bug.
"""
