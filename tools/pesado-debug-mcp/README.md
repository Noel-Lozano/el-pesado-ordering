# pesado-debug

A local MCP server for investigating El Pesado's test and CI failures. It finds failed
GitHub Actions runs, reads their trimmed logs and JUnit results, loads named test-data
scenarios into a **test-only** database, and reruns a test to tell a real failure from a
flake. Claude Code (or any MCP client) runs it over stdio.

Design and reasoning: [ADR-007](../../docs/adr/007-debug-mcp-server.md). Implementation
plan: [debug-mcp-server.md](../../docs/plans/debug-mcp-server.md).

```mermaid
flowchart LR
    CC["Claude Code<br/>(/investigate_ci_failure,<br/>ci-triager subagent)"] -- stdio --> S["pesado-debug<br/>server.py (adapter)"]
    CLI["pesado-debug CLI<br/>(humans, CI)"] --> CORE
    S --> CORE["core/<br/>github · logs · junit · artifacts<br/>testdb · scenarios · rerun · report"]
    CORE -- "read-only PAT,<br/>this repo only" --> GH["GitHub REST<br/>runs, jobs, logs, artifacts"]
    CORE -- "3 locks" --> DB[("Test Postgres<br/>marked pesado_meta.env")]
    CORE -- "node + entry point,<br/>cleaned env" --> NODE["Vitest · node-pg-migrate · seed:menu"]
    NODE --> DB
```

## What it gives you

### Tools

| Tool | What it does | Safety |
|---|---|---|
| `get_failed_runs` | Recent failed runs with their failed jobs and failed step. Filter by branch or workflow (`ci.yml`, an ID, or `CI`). | read-only |
| `get_run_logs` | A run's job logs, without ANSI codes or timestamps, cut to the failed step; `##[error]` lines are always kept. `grep`, `tail_lines`, 20,000-char cap. | read-only |
| `get_failing_tests` | Failing tests from JUnit: local `<workspace>/reports/*.xml` or the run's `junit-<workspace>` artifact. File, name, message, trimmed stack. | read-only |
| `seed_test_data` | Loads a named scenario into the test DB; returns the IDs it created. | test DB only, 3 locks |
| `reset_test_db` | Empties every app table in the test DB and loads `baseline`. | test DB only, 3 locks |
| `rerun_test` | Runs one Vitest file or test N times: `deterministic_fail`, `flaky` or `passes_locally`. | integration files reset the test DB first |

Owner and repo come from config, never from tool arguments, so the tools can't be pointed
at another repository. Output is capped (20,000 log characters, 25 failures, 8 stack frames),
and every truncated answer says how to get more.

### Prompts (slash commands)

- `/investigate_ci_failure [run_id]`: from a red run to a root cause, evidence and a flake
  verdict. Never edits code.
- `/summarize_failures run_id`: a short summary and bug report for a PR comment.
- `/write_regression_test [run_id] [file]`: one failing test that reproduces a confirmed
  bug, proven with `rerun_test`, then stop. Never fixes the bug.

None of them ever use the production `supabase` MCP server.

### Subagent

`.claude/agents/ci-triager.md` can only use `get_failed_runs`, `get_run_logs`,
`get_failing_tests` and `rerun_test`. It returns a fixed `FAILING / VERDICT / SUSPECT /
EVIDENCE / CONFIDENCE` block, so long logs stay out of the main conversation.

### Scenarios

| Scenario | What it seeds (fixed IDs) |
|---|---|
| `baseline` | Menu: Asado burrito 9101 and montada 9102 (same name), Burrito de Discada 9103 from 14:00, Agua 9104, a zero-price row 9105; three capacity slots 9201-9203 for today |
| `asap_order` | +1 customer 9001, ASAP cash order 9301 in `created` |
| `scheduled_pickup` | +1 customer 9002, same-day order 9302 for 12:30 shop time (default `at`: 10:00 on the next Mon-Sat) |
| `unpaid_order` | +1 customer 9003, cash order 9303 `ready` + `unpaid`, ready 30 min ago |
| `mx_customer` | +52 customer 9004 (masked `…0001`), order 9304 |
| `after_2pm_before_14` | At 13:30 shop time, order 9305 for the 14:00 item (a row the API would reject) |

Phones are fake (`+1500555…`, `+52656555…`), times are computed in `America/Ciudad_Juarez`,
and rows are written directly: never through the API, Twilio or Stripe.
`blocked_customer` and `capacity_full` wait on rules that don't exist yet (ADR-007 gaps 2, 3).

## Test database safety

`seed_test_data`, `reset_test_db`, `rerun_test` (integration files) and `migrate-test-db`
delete or change data. Before any of them writes, **three independent locks** must pass:

1. **Separate variable.** Only `PESADO_TEST_DATABASE_URL` is read; never `DATABASE_URL`,
   `SUPABASE_*` or `backend/.env`.
2. **Host allowlist.** Every host must be `localhost`, `127.0.0.1` or `::1`, or exactly
   `PESADO_TEST_DB_ALLOWED_HOST`. Unix sockets, `service=`, a missing host, and
   `PGHOSTADDR` / `PGSERVICE` in the environment are refused.
3. **Marker row.** `pesado_meta.env` must contain `'test'`, checked inside the same
   transaction as the writes. Production never has this schema. Only the CLI
   (`init-test-db`) creates it, after you type the database name back.

Node is only ever started as `node <entry point>` (never npm or npx), with `GITHUB_TOKEN`
and `PESADO_*` removed, `DATABASE_URL` set to the test URL, a placeholder for every key in
`backend/.env.example`, and `DOTENV_CONFIG_PATH` on an empty file, so `backend/.env`
can't leak in.

## Setup

### 1. Install uv

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Node 24 and `npm ci` in `backend/` (and `frontend/`) are needed for `rerun_test`,
`migrate-test-db` and the integration prep.

### 2. Create a GitHub token

A **fine-grained personal access token** limited to this repository, with **Actions: read**
and **Contents: read**. Nothing else.

### 3. Start and prepare the test database

```powershell
cd tools/pesado-debug-mcp
docker compose -f docker-compose.test.yml up -d     # postgres:17 on 127.0.0.1:54329, db pesado_test
uv run pesado-debug migrate-test-db                 # backend migrations, behind locks 1-2
uv run pesado-debug init-test-db                    # type "pesado_test" to mark it as test
```

Alternatives: `npx supabase start` (local Supabase), or a separate free Supabase project
(not recommended: it uses your second free project and pauses after a week idle; connect
through the **Session Pooler** and set `PESADO_TEST_DB_ALLOWED_HOST` to the pooler host).

Never run migrations by hand with `DATABASE_URL=...`. That's bash-only syntax, and a typo
falls back to `backend/.env`, which is production.

### 4. Set the environment

Copy `.env.example` to `.env` in this folder (it is gitignored) and fill it in:

```dotenv
GITHUB_TOKEN=github_pat_...
GITHUB_OWNER=Noel-Lozano
GITHUB_REPO=el-pesado-ordering
PESADO_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/pesado_test
```

A missing group disables only the tools that need it. Calling one of those tools names the
missing variables.

### 5. Connect Claude Code

The repo's `.mcp.json` already registers the server:

```json
"pesado-debug": { "command": "uv", "args": ["run", "--directory", "tools/pesado-debug-mcp", "pesado-debug-mcp"] }
```

Start Claude Code at the repo root, approve the project server, and run `/mcp`:
`pesado-debug` should be **connected** with 6 tools and 3 prompts. The same file narrows the
existing `supabase` entry to `read_only=true` and the database, debugging, development and
docs tool groups.

To poke at the tools directly:

```powershell
npx @modelcontextprotocol/inspector uv run --directory tools/pesado-debug-mcp pesado-debug-mcp
```

## CLI

```text
uv run pesado-debug migrate-test-db
uv run pesado-debug init-test-db [--confirm DBNAME]
uv run pesado-debug reset
uv run pesado-debug seed SCENARIO [--at 2026-11-16T10:00:00-07:00] [--no-reset]
uv run pesado-debug report --from-dir DIR --out FILE [--title T] [--run-url URL]
```

## CI

- The backend and frontend jobs also write JUnit (`reports/junit-unit.xml`, and
  `reports/junit-integration.xml` for the backend) and upload `junit-backend` /
  `junit-frontend`, even when tests fail.
- **Test report** job: turns those artifacts into a table and the failing tests on each
  run's **Summary** page. No hosting, no token, no database. Example: the
  [Summary page of the `logic-bug` eval run](https://github.com/Noel-Lozano/el-pesado-ordering/actions/runs/43791586855).
- **Debug MCP** job: `uv sync --locked`, ruff, format check, mypy, then the unit and
  integration tests against a `postgres:17` service. The integration tests compare
  `core/schema.py` with the real migrations, so a migration that renames a column or changes
  an enum turns this job red until `schema.py` is updated.

## Evals

`evals/` holds six known-broken branches with expected diagnoses, and the results of running
the workflow on them. See [evals/README.md](evals/README.md) and
[evals/results.md](evals/results.md).

So far the implementing agent has run the pipeline on all six cases: 6/6 root causes and
verdicts, about 19 s of tool time and 3 to 4 tool calls each. It knew the answers, so this
checks the pipeline, not diagnosis accuracy. Those runs found and fixed two bugs. The
blind fresh-session and by-hand runs are still to be done.

## Development

```powershell
uv sync
uv run ruff check; uv run ruff format --check; uv run mypy
uv run pytest                                  # integration tests skip without a test DB
$env:PESADO_TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54329/pesado_test"
uv run pytest                                  # now including integration
```

Rules: nothing may print to stdout except `cli.py` (stdout is the MCP stream; ruff `T20`
enforces it); logic goes in `core/` with no MCP imports; every database write goes through
`core/testdb.py`; every Node process goes through `core/node_runner.py`.

**Windows note:** database code uses sync psycopg in a worker thread. psycopg's async mode
refuses Windows' default event loop, which is the one Windows needs for subprocesses.
