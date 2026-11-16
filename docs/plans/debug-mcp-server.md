# Plan: `pesado-debug` MCP server

Implements [ADR-007](../adr/007-debug-mcp-server.md). Branch:
`feat/debug-mcp-server`, created from `origin/main`.

## 1. File tree

```
.mcp.json                                  # + "pesado-debug" entry; "supabase" entry: read_only=true, project-scoped, features=database,debugging,development,docs
.claude/agents/ci-triager.md               # triage subagent, limited tool list
.github/workflows/ci.yml                   # + junit reporters, junit artifacts, debug-mcp job, report job
backend/.gitignore                         # + reports/
frontend/.gitignore                        # + /reports
docs/coding_standards.md                   # + §12 Python (dev tooling only)

tools/pesado-debug-mcp/
├── pyproject.toml                         # uv project, scripts, ruff/mypy/pytest config
├── uv.lock                                # committed
├── .python-version                        # 3.12
├── .env.example                           # every variable, no values
├── .gitignore                             # .venv, .env, caches
├── docker-compose.test.yml                # postgres:17, 127.0.0.1:54329, db pesado_test
├── README.md                              # setup, test DB, PAT, /mcp check
├── src/pesado_debug/
│   ├── __init__.py
│   ├── config.py                          # Settings (pydantic-settings)
│   ├── logging_setup.py                   # JSON lines to stderr
│   ├── server.py                          # MCPServer, tool + prompt adapters, main()
│   ├── cli.py                             # argparse: seed / reset / init-test-db / migrate-test-db / report
│   ├── models.py                          # pydantic I/O models shared by server + CLI
│   ├── prompts.py                         # the three prompt texts
│   └── core/
│       ├── __init__.py
│       ├── github.py                      # httpx.AsyncClient: runs, jobs, logs, artifacts
│       ├── logs.py                        # ANSI/timestamp strip, ##[group] slicing, caps
│       ├── junit.py                       # defusedxml parser, stack trimming
│       ├── report.py                      # JUnit folder → markdown job summary (escaped)
│       ├── artifacts.py                   # bounded download + in-memory zip extraction
│       ├── schema.py                      # table/column allowlists, enum Literals
│       ├── testdb.py                      # 3 locks, reset, insert rows, init marker (pesado_meta.env)
│       ├── node_runner.py                 # cleaned child env, direct node entry points, timeouts
│       ├── migrate.py                     # migrate-test-db via node_runner
│       ├── rerun.py                       # path validation, integration prep, run loop, verdict
│       ├── shop_time.py                   # ZoneInfo("America/Ciudad_Juarez") helpers
│       └── scenarios/
│           ├── __init__.py                # REGISTRY: dict[ScenarioName, Scenario]
│           ├── base.py                    # Row, Scenario dataclasses, ID blocks
│           ├── baseline.py
│           ├── asap_order.py
│           ├── scheduled_pickup.py
│           ├── unpaid_order.py
│           ├── mx_customer.py
│           └── after_2pm_before_14.py
├── evals/
│   ├── README.md                          # what the evals measure and how to read results
│   ├── run.md                             # step-by-step: run each case, record the result
│   ├── cases/                             # one YAML per case: branch, fault, expected result
│   │   ├── unit-assertion.yaml
│   │   ├── logic-bug.yaml
│   │   ├── flaky-timing.yaml
│   │   ├── typecheck.yaml
│   │   ├── frontend-unit.yaml
│   │   └── integration-db.yaml
│   └── results.md                         # table of runs: correct?, tool calls, time, vs. by hand
└── tests/
    ├── conftest.py                        # integration marker, PESADO_REQUIRE_INTEGRATION
    ├── fixtures/
    │   ├── junit/vitest-pass.xml, vitest-fail.xml, vitest-suite-error.xml,
    │   │         jest-junit-fail.xml, xxe.xml, billion-laughs.xml
    │   ├── logs/job-failed-step.txt, job-no-groups.txt
    │   ├── report/mixed-suites/, no-junit/, hostile-names/   # inputs + expected .md
    │   └── github/runs.json, jobs.json, artifacts.json, workflows.json
    ├── unit/
    │   ├── test_config.py
    │   ├── test_logs.py
    │   ├── test_junit.py
    │   ├── test_report.py
    │   ├── test_prompts.py
    │   ├── test_evals_cases.py            # every case YAML is valid and its branch name matches
    │   ├── test_artifacts.py
    │   ├── test_github.py                 # respx
    │   ├── test_testdb_locks.py
    │   ├── test_rerun_validation.py
    │   ├── test_node_runner_env.py
    │   ├── test_migrate.py
    │   ├── test_verdict.py
    │   ├── test_scenarios.py
    │   └── test_server.py                 # tools/list schemas, annotations, disabled tools
    └── integration/
        ├── test_schema_drift.py
        └── test_seed_reset.py
```

## 2. Config

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=<tool dir>/.env, extra="ignore")
    github_token: SecretStr | None = None
    github_owner: str | None = None
    github_repo: str | None = None
    pesado_test_database_url: SecretStr | None = None
    pesado_test_db_allowed_host: str | None = None
    pesado_repo_root: Path = <parents of tools/>  # validated: contains backend/ and frontend/
```

- `env_file` is the tool's own `.env` only. `DATABASE_URL` is not a
  field.
- `github_ready` is true only when token, owner and repo are all set.
  `db_ready` is true only when the test URL is set.
- A disabled tool raises
  `ToolError("get_failed_runs is disabled: set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO")`.
- The token and the URL are `SecretStr`, so they never show up in logs or
  reprs.

## 3. Tools: signatures and models

Each tool's return annotation is `Annotated[CallToolResult, <Model>]`.
The `content` is a short text summary, and `structured_content` is
`model.model_dump(mode="json")`.

Shared:

```python
class Truncation(BaseModel):
    truncated: bool
    hint: str | None            # how to get more, when truncated
```

### `get_failed_runs`
Annotations: `read_only_hint=True, open_world_hint=True`.

```python
async def get_failed_runs(
    branch: str | None = None,
    workflow: str | None = None,          # file name ("ci.yml"), numeric ID, or display name ("CI")
    limit: Annotated[int, Field(ge=1, le=20)] = 5,
) -> Annotated[CallToolResult, FailedRuns]

class FailedJob(BaseModel):  job_id: int; name: str; failed_step: str | None
class FailedRun(BaseModel):
    run_id: int; workflow: str; branch: str; short_sha: str
    commit_title: str; created_at: datetime; url: str
    failed_jobs: list[FailedJob]
class FailedRuns(BaseModel): runs: list[FailedRun]
```

Calls:

- `GET /repos/{o}/{r}/actions/runs?status=failure&per_page={limit}`,
  plus `&branch=`.
- When `workflow` is set, it calls
  `GET /repos/{o}/{r}/actions/workflows/{workflow_id}/runs` instead.
  That endpoint accepts only a numeric ID or a file name, not a display
  name. So:
  - a value that is all digits or ends in `.yml` / `.yaml` is passed
    through as-is;
  - anything else is resolved through `GET /repos/{o}/{r}/actions/workflows`
    by exact `name` match (then case-insensitive);
  - no match raises `ToolError` listing the real workflows as
    `name (file)`.
- Then `GET .../runs/{id}/jobs?filter=latest` for each run, through an
  `asyncio.gather` limited by a semaphore of 4.
- `failed_step` is the first step with `conclusion == "failure"`.

### `get_run_logs`
Annotations: `read_only_hint=True, open_world_hint=True`.

```python
async def get_run_logs(
    run_id: int,
    job_name: str | None = None,          # default: every failed job in the run
    tail_lines: Annotated[int, Field(ge=1, le=1000)] = 200,
    grep: str | None = None,              # case-insensitive substring, not a regex
) -> Annotated[CallToolResult, RunLogs]

class JobLog(BaseModel):
    name: str; failed_step: str | None; lines: list[str]
    truncated: bool; hint: str | None
class RunLogs(BaseModel): run_id: int; jobs: list[JobLog]
```

Steps:

1. Fetch `GET .../actions/jobs/{job_id}/logs` and follow the redirect.
   A 410 or 404 means the logs have expired or aren't ready, and raises
   a `ToolError` that says which.
2. `logs.clean()` strips ANSI escape codes and the
   `^\d{4}-\d\d-\d\dT[\d:.]+Z ` prefix.
3. `logs.slice_failed_step()` cuts from the last `##[group]` that comes
   before the first `##[error]`, through the end. If there are no groups,
   the whole log is used.
4. `##[error]` lines are always kept, even outside the tail.
5. Then `grep`, then the tail, then the 20,000-character cap.

Matching a step to its group is a heuristic. Step names and `Run ...`
group titles differ (for example "Typecheck" vs "Run npm run
typecheck"), so the cut is anchored on the first error, not on the
name.

`grep` is a plain substring match, so no regex comes in from the
agent.

### `get_failing_tests`
Annotations: `read_only_hint=True, open_world_hint=True`. With
`source="local"` it reads only local files.

```python
async def get_failing_tests(
    source: Literal["local", "ci"],
    workspace: Literal["backend", "frontend"],
    run_id: int | None = None,            # required when source == "ci"
) -> Annotated[CallToolResult, FailingTests]

class TestFailure(BaseModel):
    file: str | None; suite: str; name: str
    message: str; stack: list[str]; duration_ms: int | None
class FailingTests(BaseModel):
    reports: list[str]                    # files / zip members read
    total: int; failed: int; skipped: int; errors: int
    failures: list[TestFailure]           # ≤ 25
    truncated: bool; hint: str | None
```

- **local:** every `*.xml` in `<repo>/<workspace>/reports/`, without
  following symlinks out of the workspace.
- **ci:** `GET .../runs/{run_id}/artifacts?name=junit-<workspace>`, then
  the zip, unpacked in memory with the limits in ADR-007.
  - No matching artifact → `ToolError`: "no JUnit artifact for this run;
    the failure was probably before tests ran, use `get_run_logs`".
  - `expired: true` on the artifact, or a 410 on download → `ToolError`:
    "artifacts for run N have expired; rerun the workflow".
- **Parser:**
  - Takes `<testsuites>` / `<testsuite>` / `<testcase>` with
    `<failure>` / `<error>` / `<skipped>`.
  - A suite-level `<error>` with no testcase (for example a file that
    fails to import) is reported as a failure named `(suite error)`.
  - `file` comes from the `file` attribute when present, otherwise from
    the classname.
  - The stack keeps the first 8 frames whose path is inside the repo,
    drops `node_modules` and `node:` frames, and is rewritten
    repo-relative.

### `reset_test_db`
Annotations: `read_only_hint=False, destructive_hint=True,
idempotent_hint=True, open_world_hint=False`.

```python
async def reset_test_db(confirm: Literal[True]) -> Annotated[CallToolResult, ResetResult]

class ResetResult(BaseModel):
    database: str                          # "host:port/dbname", no credentials
    tables_truncated: list[str]
    rows_inserted: dict[str, int]          # baseline
```

Everything runs in one transaction, after locks 1 and 2:

1. Lock 3: `to_regclass('pesado_meta.env')`, then
   `SELECT 1 FROM pesado_meta.env WHERE name = 'test'`.
2. Table list: `SELECT tablename FROM pg_tables WHERE schemaname =
   'public' AND tablename <> 'pgmigrations'`. The marker lives in
   `pesado_meta`, so it can never be in this list.
3. `TRUNCATE {tables} RESTART IDENTITY CASCADE`, composed with
   `sql.Identifier`.
4. Insert `baseline`.

`core/testdb.truncate_public(conn)` (steps 1 to 3) is a separate
function, because `rerun_test`'s integration prep reuses it without
step 4.

### `seed_test_data`
Annotations: same as `reset_test_db`, except
`idempotent_hint=False`.

```python
ScenarioName = Literal["baseline", "asap_order", "scheduled_pickup",
                       "unpaid_order", "mx_customer", "after_2pm_before_14"]

async def seed_test_data(
    scenario: ScenarioName,
    reset: bool = True,
    at: AwareDatetime | None = None,       # default per scenario, see below
) -> Annotated[CallToolResult, SeedResult]

class SeedResult(BaseModel):
    scenario: str; at: datetime; database: str
    reset: bool
    ids: dict[str, list[int]]              # {"customers": [9001], "orders": [9301], ...}
    notes: list[str]                       # e.g. "after_2pm_before_14: a row the API would reject; its clock isn't moved"
```

Default `at` per scenario (each `Scenario` declares its own
`default_at(now)` in `scenarios/base.py`):

| Scenario | Default `at` |
|---|---|
| `scheduled_pickup` | 10:00 shop time on today's date if it is Mon to Sat, otherwise the next Monday. An explicit `at` after 12:30 or on a Sunday raises `ToolError`. |
| `after_2pm_before_14` | 13:30 shop time today |
| every other scenario | now |

- Runs in one transaction: lock 3, an optional reset, `baseline` if menu
  item 9101 is missing, then the scenario rows.
- Seeding a scenario whose fixed IDs already exist fails with "already
  seeded, use reset=true".

### `rerun_test`
Annotations: `read_only_hint=False, destructive_hint=True,
idempotent_hint=False, open_world_hint=False`. It is destructive because
an integration file truncates the test DB first (see below).

For integration test files, the DB locks gate the run, and the tool
first rebuilds the state CI runs them against (see below). A test may
write to the test DB.

```python
async def rerun_test(
    workspace: Literal["backend", "frontend"],
    file: str,                             # relative to the workspace, e.g. "src/test/unit/lib/pricing.test.ts"
    test_name: str | None = None,
    times: Annotated[int, Field(ge=1, le=10)] = 5,
) -> Annotated[CallToolResult, RerunResult]

class RerunResult(BaseModel):
    file: str; test_name: str | None; times: int
    passes: int; fails: int
    verdict: Literal["deterministic_fail", "flaky", "passes_locally"]
    failure_messages: list[str]            # deduplicated, each ≤ 500 chars, ≤ 10
    timed_out_runs: int
    db_prepared: Literal["none", "reset+seed:menu"]
    notes: list[str]                       # e.g. "test DB was reset: any scenario data is gone"
```

- **Integration prep** (files under `src/test/integration/` only, once
  before the first run, not before each one):
  1. Locks 1 to 3.
  2. `testdb.truncate_public()`, without `baseline`.
  3. The `seed:menu` script's entry point, run directly through
     `node_runner` (the entry point recorded in "Checks before Phase 3"
     in ADR-007).

  This matches CI: migrate, then `seed:menu`, then the integration
  tests. Without it, a test that expects a real menu item fails on every
  run and comes back as a false `deterministic_fail`.
- Unit test files get no DB prep and no DB variables beyond the
  placeholders.
- Command:
  `[node, <ws>/node_modules/vitest/vitest.mjs, "run", <file>,
  "--config", <cfg>, "--reporter=junit",
  "--outputFile.junit=<tmp>/run-N.xml", ("-t", re.escape(test_name))?]`
- The working directory is the workspace.
- Integration test files get `--config vitest.integration.config.ts`.
- **Verdict:**
  - Every run failed → `deterministic_fail`.
  - Every run passed → `passes_locally`.
  - Otherwise → `flaky`.
  - A run where zero tests executed raises `ToolError` ("no test
    matched").

### Prompts

The prompt texts live in `prompts.py` as plain strings, so tests can
check them without starting the server.

#### `investigate_ci_failure`

```python
@mcp.prompt()
def investigate_ci_failure(run_id: int | None = None) -> str
```

It returns the workflow as instructions:

1. `get_failed_runs`, or use the given `run_id`.
2. `get_failing_tests(source="ci", ...)` for each workspace whose job
   failed.
3. If there is no JUnit (a lint, typecheck or build failure), use
   `get_run_logs`.
4. `rerun_test` on each failing test. For integration files, it rebuilds
   CI's DB state itself. **Don't seed a scenario first**: the rerun
   would wipe it.
5. Only if the failure needs to be reproduced by hand through the API or
   UI, `seed_test_data` with the closest scenario, and say which one and
   why.
6. Report the root-cause hypothesis, the evidence (file:line and log
   lines), and the verdict.

It also says:

- **Do not edit code unless asked.**
- **Never use the `supabase` MCP server's tools during an
  investigation.** It points at production.
- If the `ci-triager` subagent is available, delegate steps 1 to 4 to it
  and work from its finding.

#### `summarize_failures`

```python
@mcp.prompt()
def summarize_failures(run_id: int) -> str
```

Instructions: call `get_failing_tests` (or `get_run_logs` if there's no
JUnit) for the run, then write, in this order and nothing else:

1. A one-line summary: what broke, in which suite.
2. A bug report: title, steps to reproduce, expected, actual, evidence
   (file:line, the first error line, the run URL).
3. Likely cause, labeled as a hypothesis when it hasn't been confirmed
   with `rerun_test`.

At most 200 words, so it fits in a PR comment. No code edits.

#### `write_regression_test`

```python
@mcp.prompt()
def write_regression_test(run_id: int | None = None, file: str | None = None) -> str
```

Instructions:

1. Confirm the root cause first (from `run_id`, or ask for it). If it
   isn't confirmed, stop and say so.
2. Write **one** test, in the existing style of
   `<workspace>/src/test/unit/` (or `integration/` only if the bug needs
   the DB), that fails because of this bug and only this bug.
3. Run it with `rerun_test` (`times=3`). It must come back
   `deterministic_fail` with the expected error message. If it passes or
   is flaky, revise it once, then stop and report.
4. Stop. Don't fix the bug. Report the test's path and the failure
   message it produces.

### Subagent `.claude/agents/ci-triager.md`

Frontmatter (check the current Claude Code subagent format before
writing it):

- `name: ci-triager`
- `description:` "Investigates a failing CI run with the pesado-debug
  tools and returns a structured finding. Use for any red CI run before
  proposing a fix."
- `tools:` only `mcp__pesado-debug__get_failed_runs`,
  `mcp__pesado-debug__get_run_logs`, `mcp__pesado-debug__get_failing_tests`,
  `mcp__pesado-debug__rerun_test`. No `Edit`, `Write`, `Bash`, seed or
  reset tools, and no `supabase` tools.

Body: follow `investigate_ci_failure` steps 1 to 4, then return exactly
this block. The body also says that rerunning an **integration** file
resets the test DB (truncate, then `seed:menu`), so any scenario data is
gone afterwards; the triager mentions it in `EVIDENCE` when it happens.

```
FAILING: <suite> › <test>   (one line per failure, max 10)
VERDICT: deterministic_fail | flaky | passes_locally | no_junit
SUSPECT: <path>:<line>   (or "unknown")
EVIDENCE: <≤ 5 lines: first error, relevant log lines>
CONFIDENCE: high | medium | low, with one reason
```

The fixed format keeps the main agent's context small and makes eval
results easy to score.

### CLI `report`

```
pesado-debug report --from-dir <dir> --out <file> [--title <text>] [--run-url <url>]
```

- Reads every `*.xml` under `<dir>` (recursively, because
  `download-artifact` puts each artifact in its own folder) with
  `junit.py`.
- Suite rows are named from the folder and file, e.g. `backend
  (integration)` from `junit-backend/junit-integration.xml`.
- **Appends** to `--out` instead of overwriting, because
  `$GITHUB_STEP_SUMMARY` may already have content.
- Exit code is always 0. The report describes failures; the test jobs
  are what fail the build.

Output shape:

```markdown
### 🔴 CI failed: 2 failing tests        (or ✅ All 82 tests passed)

| Suite | Passed | Failed | Skipped | Pass rate |
|---|---|---|---|---|
| backend (unit) | 48 | 0 | 0 | 100% |
| backend (integration) | 11 | 2 | 0 | 84.6% |
| frontend (unit) | 23 | 0 | 1 | 100% |

**Failing tests**

<details><summary><code>orders.test.ts</code>: rejects items before 14:00: expected 400, got 201</summary>

(message and trimmed stack in a fenced code block)

</details>
```

- Pass rate = passed ÷ (passed + failed), one decimal. Skipped tests are
  shown but not counted.
- At most 25 failures, then "+N more: see the `junit-*` artifacts".
- No XML found: "No test results were produced: the run failed before
  tests ran. See the failing job:" plus `--run-url`.
- Escaping (shared helper `report.escape_inline`): `html.escape`, then
  backslash-escape `|`, `` ` ``, `*`, `_`, `[`, `]`. Code blocks use a
  fence one backtick longer than the longest backtick run in the text.

## 4. Scenario → tables matrix

| Scenario | customers | menu_items | capacity_slots | orders | order_items | Notes |
|---|---|---|---|---|---|---|
| `baseline` | none | 9101 Burritos/Asado 4500 · 9102 Montadas/Asado 6500 · 9103 Después de las 2 PM/Burrito de Discada 6500, `available_from 14:00` · 9104 Extras/Agua 1000 · 9105 Después de las 2 PM/Montada de Discada **0**, `available_from 14:00` | 9201 to 9203: `date` = shop-local date of `at`, 12:00–12:15, 12:15–12:30, 12:30–12:45, `max_orders` 5 | none | none | Same-name pair across categories; `price_cents = 0` is the bad-data row |
| `asap_order` | 9001 `+15005550006`, verified, US | baseline | baseline | 9301 `online`, `created`, `asap`, `requested_time NULL`, `cash`, `unpaid` | 9401 Asado burrito ×2 | `total_cents` = sum of lines |
| `scheduled_pickup` | 9002 `+15005550007`, verified | baseline | baseline | 9302 `scheduled`, `requested_time` = 12:30 shop time on the date of `at`, `created`, `cash`, `unpaid` | 9402 Asado montada ×1 | Same-day, so the API could create it (Gap 4). `at` defaults to 10:00 on the next Mon to Sat date |
| `unpaid_order` | 9003 `+15005550008`, verified | baseline | baseline | 9303 `asap`, `ready`, `cash`, `unpaid`, `estimated_ready_at = at - 30 min` | 9403 Asado burrito ×1, 9404 Agua ×1 | The no-show path; grace period undefined (Gap 8) |
| `mx_customer` | 9004 `+526565550001`, verified | baseline | baseline | 9304 `asap`, `created`, `cash`, `unpaid` | 9405 Agua ×1 | E.164 +52, mask → `…0001` |
| `after_2pm_before_14` | 9005 `+15005550009`, verified | baseline | baseline | 9305 `asap`, `created`, `cash`, `unpaid`, `created_at = at` | 9406 Burrito de Discada ×1 (`available_from 14:00`) | `at` defaults to today 13:30 shop time. A row the API would reject; the API clock isn't moved (Gap 5) |
| ~~`blocked_customer`~~ | none | none | none | none | none | Left out (Gap 2) |
| ~~`capacity_full`~~ | none | none | none | none | none | Left out (Gap 3) |

All values for `channel`, `status`, `payment_*` and `fulfillment_type`
come from the `Literal`s in `core/schema.py`, which the drift test
checks against the CHECK constraints.

`baseline`'s menu and `seed:menu`'s real menu are never loaded together
(ADR-007 Gap 12). Their `Burritos/Asado` rows would collide under
`UNIQUE(category, name)`.

`price_at_order_cents` is copied from the menu row, and `total_cents` is
the sum of the lines, the same way `POST /orders` does it. Money is in
integer centavos everywhere.

## 5. Test plan

**Unit** (no network, no DB; `uv run pytest -m "not integration"`):

| Area | Cases |
|---|---|
| `junit.py` | Vitest pass, fail and suite-error fixtures. `jest-junit` fixture. Caps (≤ 25, `truncated`). Stack trimming (8 in-repo frames, `node_modules` and `node:` dropped). XXE and billion-laughs fixtures raise `defusedxml` errors that surface as a clean `ToolError`. |
| `artifacts.py` | A member over 10 MB is rejected. A lying `file_size` is still capped on read. More than 50 members is rejected. Non-XML members are ignored. |
| `logs.py` | ANSI and timestamps stripped. Failed-step slicing with and without groups. `##[error]` kept outside the tail. `grep`, `tail_lines` and 20,000-char cap, each with `truncated` set. |
| `github.py` (respx) | Run and job mapping, `failed_step`, branch filter. Workflow filter: file name and numeric ID passed through; display name resolved through `workflows.json`; unknown name → `ToolError` listing workflows. The log redirect is followed, and `Authorization` is **not** sent to the blob host. 401, 404 and 410 become readable `ToolError`s. A missing artifact and an `expired: true` artifact each get their own message. |
| `config.py` | `DATABASE_URL=sentinel` is never picked up. Missing GitHub vars disable only the GitHub tools. Secrets are absent from `repr`. |
| `testdb.py` locks | Each lock blocks on its own: (1) only `DATABASE_URL` set → refused. (2) Remote host, `host=localhost,prod.example`, `hostaddr=` remote, Unix socket, missing host, and `service=` → refused; the exact `PESADO_TEST_DB_ALLOWED_HOST` → allowed. (3) Missing `pesado_meta.env`, or a table without `'test'` → refused (fake connection). |
| `node_runner.py` env | The child env has no `GITHUB_TOKEN` and no `PESADO_*`, has `DATABASE_URL` = the test URL, and has `DOTENV_CONFIG_PATH` set to an empty file. **Every key in `backend/.env.example` is present** with a placeholder; the test parses the real file, so adding a key there without a placeholder fails it. The args list starts with `node` and never contains `npm`, `npx` or a shell. |
| `migrate.py` | Refuses a non-allowlisted host before starting Node. Passes `--envPath` to an empty temp file. Doesn't check lock 3 (a fresh DB has no marker). |
| `rerun.py` validation | `../` traversal, an absolute path outside the repo, a symlink escaping the workspace (skipped where symlinks can't be created), a non-test file, a test file outside `src/test`, a missing file. `re.escape` applied. Integration files trigger the prep exactly once (truncate without `baseline`, then `seed:menu`) and set `db_prepared`; unit files don't. |
| Verdict | All fail, all pass, mixed, zero tests executed → error, timeout counted as a fail. |
| Scenarios | `build(at)` for a fixed `at` (a weekday in DST and one outside it): exact rows, timezone-aware datetimes, IDs inside their blocks, phone regex, enum values in `schema.py`, columns in the allowlist, `total_cents` equals the sum of the lines. |
| `server.py` | `tools/list` (in-memory client): six tools, the expected annotations, input schemas carry the `Literal`s and bounds, output schemas exist. All three prompts are listed with their arguments. |
| `report.py` | `mixed-suites` fixture matches the expected markdown exactly (snapshot). All-pass gives the ✅ line. `no-junit` gives the "failed before tests ran" message. `hostile-names`: names with `<script>`, `|`, backticks and `**` render as text, the table keeps its column count, and no code fence is broken. More than 25 failures shows "+N more". `--out` appends. Exit code is 0 with failures. |
| `prompts.py` | Each prompt names only tools that exist on the server. `investigate_ci_failure` contains the "don't edit code" and "never use `supabase`" rules. `write_regression_test` contains "don't fix the bug". |
| `ci-triager.md` | Parsed in a test: its `tools` list is exactly the four allowed tools, so a later edit can't quietly widen it. |
| Eval cases | Every `evals/cases/*.yaml` loads, has `branch`, `fault`, `expected.category`, `expected.suspect_file`, `expected.verdict`, and `branch` equals `eval/<file name>`. |

**Integration** (`@pytest.mark.integration`, Postgres, run in CI).

`conftest.py` skips these when `PESADO_TEST_DATABASE_URL` is unset,
**unless** `PESADO_REQUIRE_INTEGRATION=1` is set (it is in CI), in which
case a missing URL fails the run.

| Test | Checks |
|---|---|
| `test_schema_drift.py` | `schema.py` columns equal `information_schema.columns` for each table, and each `Literal` equals the set parsed from `pg_get_constraintdef` of the matching CHECK. |
| `test_seed_reset.py` | Reset, then seed each scenario: row counts per table match the scenario, FK joins resolve (no orphan `order_items` or `orders`), and the orders read back through the same SQL shape as `getOrderForCustomer`. Reset twice gives the same result (idempotent). Seeding a DB without the marker is refused, with no rows written. **Truncating every table in `public` leaves the marker in place** (the scenario that the schema move protects against). |

**Manual:**

1. In MCP Inspector, call every tool once:
   `npx @modelcontextprotocol/inspector uv run --directory tools/pesado-debug-mcp pesado-debug-mcp`
2. In Claude Code, check that `/mcp` shows `pesado-debug` connected.
3. Run `/investigate_ci_failure` against a deliberately broken branch
   (one failing assertion). The transcript goes into the PR.
4. Open a failed CI run's **Summary** page and check the report renders:
   table aligned, `<details>` blocks expand, no broken formatting.
   Screenshot it for the README.
5. One smoke run of `get_failed_runs` against the real repo with the
   fine-grained PAT.

## 5b. Evaluation

`evals/run.md` is the step-by-step procedure:

1. **Create the case branches.** For each case YAML, branch
   `eval/<case>` from `main`, apply only the fault the YAML describes,
   commit with message `eval: <case>`, and push. Never merge them.
2. **Wait for CI** on each branch and record the run ID in the YAML
   (`run_id:`), so later evals reuse the same run.
3. **With the server:** for each case, open a fresh Claude Code session
   in the repo and run `/investigate_ci_failure <run_id>`. Record in
   `results.md`:
   - root cause correct? (suspect file matches `expected.suspect_file`)
   - verdict correct? (matches `expected.verdict`)
   - number of tool calls, and wall-clock time from command to answer
4. **Without the server (baseline):** for the same cases, time yourself
   (or a fresh Claude Code session with `pesado-debug` disabled in
   `/mcp`) finding the root cause with only `gh` and the Actions UI.
5. **Summarize** at the top of `results.md`: cases correct out of 6,
   median time with vs. without, and anything the agent got wrong and
   why.

Re-run the evals whenever a prompt or tool description changes, and keep
older results below the latest ones.

Example case file:

```yaml
# evals/cases/logic-bug.yaml
branch: eval/logic-bug
fault: >
  In backend/src/lib/pickupRules.ts, change the closing-time comparison
  from < to <=, so 15:30 is accepted as a pickup time.
expected:
  category: deterministic_fail
  suspect_file: backend/src/lib/pickupRules.ts
  verdict: deterministic_fail
run_id: null   # filled in after CI runs
```

`flaky-timing` must fail some of the time, not always: for example a
test that asserts on `Date.now() % 2 === 0`. Its expected verdict is
`flaky`, and the run where it is recorded must be a failing one (retry
the CI run until it fails).

## 5c. Later phase: Playwright (after the ordering screens ship)

Not part of commits 1 to 10. When the six ordering screens exist:

- `frontend/src/test/e2e/ordering.spec.ts`: menu → item → cart →
  checkout → OTP → confirmation, at the 390px mobile viewport and the
  desktop layout.
- Playwright's JUnit reporter writes `frontend/reports/junit-e2e.xml`.
  `get_failing_tests` and the CI report pick it up without changes.
- A CI `e2e` job runs the backend against a `postgres:17` service
  container marked with `init-test-db`, seeded with `seed:menu`, and
  uploads `junit-e2e`. The `report` job adds it to `needs`.
- The OTP step needs a test-only bypass in the backend, enabled only
  when the database passes the three locks. It gets its own ADR before
  it's built.
- `rerun.py` gets a Playwright runner entry
  (`node node_modules/@playwright/test/cli.js test <file>`), with the
  same path validation.

## 6. CI changes

**`backend` job:**

- Unit tests add
  `--reporter=junit --outputFile.junit=reports/junit-unit.xml`.
- Integration tests add
  `--reporter=junit --outputFile.junit=reports/junit-integration.xml`.
- Both keep the existing `default` and `json` reporters.
- New step: upload `junit-backend` (`path: backend/reports/`,
  `if: always()`).

**`frontend` job:** the same for `reports/junit-unit.xml`, plus
upload `junit-frontend` with `if: always()`.

**New `debug-mcp` job** (`working-directory: tools/pesado-debug-mcp`):

- Service: a `postgres:17` service container (database
  `pesado_debug_test`).
- Env: `PESADO_TEST_DATABASE_URL`, plus `PESADO_REQUIRE_INTEGRATION=1`.

Steps:

1. Checkout, then `astral-sh/setup-uv` (pinned major version, cache
   on).
2. `uv sync --locked`
3. `uv run ruff check`, then `uv run ruff format --check`
4. `uv run mypy`
5. Set up Node 24, then `npm ci` in `backend/` (node-pg-migrate and
   `seed:menu` need its `node_modules`).
6. `uv run pesado-debug migrate-test-db`
7. `uv run pesado-debug init-test-db --confirm pesado_debug_test`
8. `uv run pytest` (unit + integration)

**New `report` job:**

```yaml
report:
  needs: [backend, frontend]
  if: always()
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@<pinned>
    - uses: actions/download-artifact@<pinned>
      with:
        pattern: junit-*
        path: artifacts
    - uses: astral-sh/setup-uv@<pinned>
    - run: >
        uv run --directory tools/pesado-debug-mcp pesado-debug report
        --from-dir "$GITHUB_WORKSPACE/artifacts"
        --out "$GITHUB_STEP_SUMMARY"
        --run-url "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
```

- It has no secrets and no database, and only the default read
  permissions (`permissions: contents: read, actions: read`).
- If no artifact exists (both jobs failed before tests), `download-artifact`
  finds nothing and the report prints the "failed before tests ran"
  message. Set `continue-on-error: true` on the download step if it
  errors on an empty match.

## 7. Commit plan

| # | Commit | Files | Verified by |
|---|---|---|---|
| 1 | `docs: add ADR and plan for pesado-debug MCP server` | `docs/adr/007-debug-mcp-server.md`, `docs/plans/debug-mcp-server.md` | Review (your edits) |
| 2 | `chore(debug-mcp): scaffold uv project, config, stdio server, .mcp.json, CI job` | `tools/pesado-debug-mcp/{pyproject.toml,uv.lock,.python-version,.env.example,.gitignore}`, `src/pesado_debug/{__init__,config,logging_setup,server,models}.py`, `tests/{conftest.py,unit/test_config.py,unit/test_server.py}`, `.mcp.json` (new entry **and** the `supabase` entry made read-only and project-scoped), `.github/workflows/ci.yml` (`debug-mcp` job without the DB steps yet), `docs/coding_standards.md` §12 | ruff, mypy, pytest. A test spawns the server, sends `initialize`, and asserts every byte on stdout parses as JSON-RPC (a stdio server writes nothing until it gets a request). `/mcp` shows the `supabase` server still connects, and a write through it is refused. |
| 3 | `feat(debug-mcp): add get_failed_runs and get_run_logs` | `core/{github,logs}.py`, server adapters, `tests/unit/test_{github,logs}.py`, fixtures | Unit tests with respx. One manual smoke run against the real repo. |
| 4 | `feat(debug-mcp): add JUnit parsing and get_failing_tests; emit + upload junit in CI` | `core/{junit,artifacts}.py`, adapter, tests and fixtures, `ci.yml` (reporters + `junit-*` uploads), `backend/.gitignore`, `frontend/.gitignore` | Unit tests. Locally, `npm test -- --reporter=junit ...` in both workspaces produces files that the parser reads. |
| 5 | `feat(debug-mcp): add test DB guard, migrate-test-db, reset_test_db and seed scenarios` | `core/{testdb,schema,shop_time,node_runner,migrate}.py`, `core/scenarios/*`, `cli.py`, `docker-compose.test.yml`, adapters, unit and integration tests (`test_node_runner_env.py`, `test_migrate.py` included), `ci.yml` (postgres service, `migrate-test-db`, `init-test-db`) | Lock unit tests, plus integration tests against the local `postgres:17` container and the CI service container. |
| 6 | `feat(debug-mcp): add rerun_test flake checker` | `core/rerun.py`, adapter, `tests/unit/test_rerun_validation.py`, `test_verdict.py` | Unit tests. Manual: `rerun_test` on `pricing.test.ts` gives `passes_locally`; a deliberately broken local copy gives `deterministic_fail`; one integration file reports `db_prepared: "reset+seed:menu"` and passes. |
| 7 | `feat(debug-mcp): add CI test report to the job summary` | `core/report.py`, `report` in `cli.py`, `tests/unit/test_report.py`, `tests/fixtures/report/*`, `ci.yml` (`report` job) | Unit tests, including hostile names. A failing run on a scratch branch shows the report on its Summary page (screenshot for the README). |
| 8 | `feat(debug-mcp): add investigation, summary and regression-test prompts` | `prompts.py`, prompt registration in `server.py`, `tests/unit/test_prompts.py`, `test_server.py` (three prompts listed) | Unit tests. `/investigate_ci_failure` and `/summarize_failures` on a broken branch; `/write_regression_test` produces one failing test and stops. |
| 9 | `feat(debug-mcp): add ci-triager subagent` | `.claude/agents/ci-triager.md`, a test that parses its tool list | Unit test. In Claude Code, the main agent delegates a red run to `ci-triager` and gets back the fixed-format finding. |
| 10 | `docs(debug-mcp): add evals and README` | `evals/**`, `tests/unit/test_evals_cases.py`, `README.md` | The six `eval/*` branches pushed and their CI runs recorded. `results.md` filled in, with and without the server. README has setup, an architecture diagram, the report screenshot, a demo transcript and the eval summary. |

**Shippable checkpoints.** After commit 6 the core tool works end to
end (CI failures, logs, JUnit, test data, flake checks). Commits 7 to 10
add reporting, agent workflows and measurements. If time runs short,
push through commit 6 plus a short README first, then continue.

For every commit:

- Only that commit's paths are staged (`git add <paths>`).
- ruff, format check, mypy and pytest are green, plus the JS checks for
  any JS or CI file it touches.
- No hooks are skipped.
- The commit body says what was built, how it was verified, and any gap
  left.

## 8. Before Phase 3

- **uv:** install it (`powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`).
- **Test DB:** nothing to start yet. `docker-compose.test.yml` arrives in
  commit 5. Then, in PowerShell from `tools/pesado-debug-mcp/`:
  `docker compose -f docker-compose.test.yml up -d`, then
  `uv run pesado-debug migrate-test-db`, then
  `uv run pesado-debug init-test-db`.
- **Migrations:** never by hand with `DATABASE_URL=...`. That's bash
  syntax (it fails in PowerShell), and a typo falls back to
  `backend/.env`, which is production. `migrate-test-db` does it behind
  the locks.
- **GitHub:** create a fine-grained PAT for this repo only, with
  **Actions: read** and **Contents: read**.
- **Env vars:** put `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` and
  `PESADO_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/pesado_test`
  in `tools/pesado-debug-mcp/.env` (gitignored).
- **Answer the four "Checks before Phase 3" in ADR-007** (integration
  `setup.ts` cleanup, `price_cents` constraint, the `seed:menu` entry
  point, Supabase MCP read-only syntax) before writing commit 2.