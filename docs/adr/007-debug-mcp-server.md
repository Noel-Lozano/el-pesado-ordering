# ADR-007: `pesado-debug`, a local MCP server for test and CI failures

**Status:** Proposed

**Date:** 2026-11-15

**Deciders:** Noel Lozano

## Context

When a test or a CI run fails, an agent (Claude Code, or any MCP client)
has to piece the failure together from several places: the GitHub Actions
run, the job log, the test report, and a database in a known state to
reproduce the problem against. Today this is done by hand.

Facts that bear on this:

- **Repo shape.** Two separate npm projects, `backend/` (Express 5,
  `pg`, node-pg-migrate 9) and `frontend/` (Next.js 16). Both use
  **Vitest 5.0.5**. There is no Jest anywhere in the repo.
- **Tests.** All tests live in `src/test/` (PR #4):
  - `backend/src/test/unit/**/*.test.ts`: `npm test`, no DB.
  - `backend/src/test/integration/**/*.test.ts`:
    `npm run test:integration` (`vitest.integration.config.ts`). They
    write to the database in `DATABASE_URL`, run one file at a time, and
    load `backend/.env` through `import "dotenv/config"` in
    `src/test/integration/setup.ts`.
  - `frontend/src/test/unit/**/*.test.{ts,tsx}`: `npm test`, no DB.
- **CI exists** (`.github/workflows/ci.yml`), with two jobs:
  - `backend`: typecheck, unit tests, migrations, `seed:menu`, then
    integration tests against a `postgres:17` service container.
  - `frontend`: lint, typecheck, unit tests, and a build against a
    seeded API.
  Both jobs write Vitest **JSON** reports to `<workspace>/test-results/`
  and upload them as `test-results-<workspace>` with `if: always()`.
  Nothing writes JUnit XML yet.
- **Schema** (migrations `01` to `07`). These are the real names this
  server must match:
  - Every `id` is node-pg-migrate's `id` shorthand: a **`serial`
    integer**, not a UUID.
  - `customers(id, phone, phone_verified, name, no_show_count,
    is_blocked, created_at, updated_at)`, with `UNIQUE(phone)`.
  - `menu_items(id, name, description, price_cents, image_url, category,
    is_available, display_order, available_from time, created_at,
    updated_at)`, with `UNIQUE(category, name)`.
  - `capacity_slots(id, day_of_week, date, start_time, end_time,
    max_orders, created_at, updated_at)`, with a CHECK that exactly one of
    `day_of_week` / `date` is set.
  - `orders(id, customer_id → customers RESTRICT, channel, status,
    fulfillment_type, requested_time, estimated_ready_at, payment_method,
    payment_status, currency_paid, total_cents, idempotency_key uuid,
    created_at, updated_at)`.
  - `order_items(id, order_id → orders CASCADE, menu_item_id → menu_items
    RESTRICT, quantity, price_at_order_cents, notes, created_at)`.
  - `pgmigrations` (node-pg-migrate's bookkeeping table). `otp_codes` was
    dropped in `06`.
  - Row-level security is enabled on every public table (`04`). The
    backend connects as the owner role, so RLS doesn't affect it.
- **Enum values (CHECK constraints):**

  | Column | Allowed values | Default |
  |---|---|---|
  | `orders.status` | `created`, `confirmed`, `preparing`, `ready`, `picked_up`, `no_show`, `cancelled` | `created` |
  | `orders.payment_status` | `unpaid`, `awaiting_payment`, `paid` | `unpaid` |
  | `orders.payment_method` | `card`, `bank_transfer`, `cash` (`oxxo` dropped in `07`) | none |
  | `orders.fulfillment_type` | `asap`, `scheduled` | none |
  | `orders.channel` | `online`, `phone`, `in_store` | none |
  | `orders.currency_paid` | `MXN`, `USD` (nullable) | none |

- **Business rules in code.** `backend/src/lib/pickupRules.ts` enforces
  same-day pickup during opening hours (Mon to Sat, 07:30 to 15:30,
  `America/Ciudad_Juarez`) and `available_from`. `POST /orders` rejects
  items with `price_cents <= 0`. **Nothing reads `capacity_slots`,
  `no_show_count` or `is_blocked` yet**, and no block threshold is defined
  anywhere (`architecture.md` §6 and §8 leave it open).
- **Tooling available today.** The official GitHub MCP server has
  `get_job_logs` (with `failed_only` and `tail_lines`). The Supabase MCP
  server, already registered in `.mcp.json` against the **production**
  project, has `execute_sql`.
- **MCP Python SDK.** The current stable line is `mcp` 2.x (2.3.0, for
  the 2026-07-28 spec). Checked against the 2.3.0 wheel:
  `from mcp.server import MCPServer` (the `mcp.server.fastmcp` module now
  raises `ModuleNotFoundError`), `MCPError` lives in
  `mcp.shared.exceptions`, tool errors are raised as `ToolError` from
  `mcp.server.mcpserver.exceptions`, and annotations are
  `mcp.types.ToolAnnotations(read_only_hint=..., destructive_hint=...,
  idempotent_hint=..., open_world_hint=...)`. A tool annotated
  `-> Annotated[CallToolResult, Model]` returns a text summary plus
  `structuredContent` validated against `Model`.
- The team is one developer. Python 3.14 is installed locally. `uv` is
  not installed yet.

## Decision

We will build **`pesado-debug`**, a local MCP server in **Python**, as a
standalone uv project in `tools/pesado-debug-mcp/`. It talks to the
GitHub REST API and to a **test-only** Postgres directly, and runs over
**stdio**. It covers the full test-tooling loop: test data setup,
failure analysis, flake detection, reporting, and agent workflows.

It exposes six tools and three prompts:

- **Read-only:** `get_failed_runs`, `get_run_logs`, `get_failing_tests`.
- **Writes to the test DB only:** `reset_test_db`, `seed_test_data`.
- **Runs a test locally:** `rerun_test`.
- **Prompts (agent workflows):** `investigate_ci_failure`,
  `summarize_failures`, `write_regression_test`.

Around the server:

- **CLI** (`pesado-debug`): the same core, for humans and CI: `seed`,
  `reset`, `init-test-db`, `migrate-test-db`, `report`.
- **CI reporting:** a `report` job writes a markdown test report (pass
  rates per suite, failing tests with collapsible stacks) to every run's
  GitHub job summary page. GitHub renders it, so there is no dashboard
  to host or style.
- **Claude Code subagent** (`.claude/agents/ci-triager.md`): a triage
  agent limited to this server's read-only tools plus `rerun_test`, which
  the main agent delegates to.
- **Evaluation harness** (`evals/`): known broken branches with expected
  diagnoses, so the agent workflow's accuracy is measured, not assumed.
- **Later phase:** Playwright end-to-end tests for the ordering flow,
  reported through the same JUnit pipeline.

Every database write must first pass three independent locks:

1. The server reads only `PESADO_TEST_DATABASE_URL`.
2. The URL's host must be on an allowlist.
3. The database must contain a marker row in its own schema
   (`pesado_meta.env`), checked in the same transaction as the writes.

The same locks also guard the two places where the tool starts a Node
process against the database: migrating the test DB
(`pesado-debug migrate-test-db`) and rerunning integration tests.

The production Supabase MCP entry in `.mcp.json` becomes read-only and
scoped to one project, and the investigation prompt forbids using it.

## Options considered

### Option A — Use the official GitHub and Supabase MCP servers only
- Pros: nothing to build or maintain. `get_job_logs` already trims logs
  to failed jobs.
- Cons:
  - The GitHub server's token typically spans every repo the user can
    reach.
  - Neither server parses JUnit or test artifacts.
  - There are no El Pesado scenarios, so every reproduction means
    hand-written SQL.
  - Supabase `execute_sql` is arbitrary SQL against real projects. In
    this repo `.mcp.json` points at production, which is the opposite of
    what reproducing a failing test needs.

### Option B — Custom server in TypeScript, inside the repo's Node toolchain
- Pros: one language for the whole repo (`coding_standards.md` §2). It
  could import the backend's types, such as `MenuCategory`.
- Cons:
  - It couples a dev tool to the app's dependency tree: Node 24, Vitest
    and TypeScript 7 upgrades would all touch it.
  - Safe ZIP and XML handling needs extra npm dependencies (`yauzl`, an
    XXE-safe XML parser).
  - Importing backend modules such as `src/config/env.ts` would run the
    app's env validation and `process.exit` inside the MCP server.

### Option C — Custom server in Python, standalone uv project (chosen)
- Pros:
  - The stdlib covers the risky input handling: `zipfile` and `io` for
    artifacts, `zoneinfo` for shop time, `asyncio` subprocesses for
    `rerun_test`. `defusedxml` is a small, well-known XXE and
    billion-laughs guard.
  - pydantic gives input and output JSON schemas straight from type
    hints, which is how the MCP SDK builds tool schemas.
  - The project is fully isolated from the app's Node toolchain: its own
    lockfile and its own CI job.
- Cons:
  - A second toolchain (uv, Python, ruff, mypy) in a TypeScript repo.
  - **No shared types with the backend.** Table, column and enum names
    are duplicated in Python, so they can drift from the migrations.

### Option D — HTTP transport instead of stdio
- Pros: one long-running server shared by several clients.
- Cons: it opens a port, so it needs auth. Claude Code would have to
  manage its lifecycle. No client here needs that.

### Reporting: job summary vs. HTML file vs. web dashboard
- **GitHub job summary (chosen):** markdown written to
  `$GITHUB_STEP_SUMMARY` appears on the run page. No hosting, no
  styling, nothing to download. It reuses the JUnit parser.
- **Self-contained HTML artifact:** more styling work, and readers must
  download and unzip it to see it.
- **FastAPI dashboard with history:** needs a server and storage for
  past runs. Not worth it at this repo's size. Revisit if pass-rate
  trends over time become a real need.

## Rationale

The value of this server is in the narrow, El Pesado-specific parts:

- A read-only token locked to this repo.
- JUnit and artifact parsing.
- Named, fixed scenarios.
- A DB tool that can only touch a database marked as test.

The generic servers can't provide these. Building them as a separate
Python project keeps the dev tool from ever touching the app's runtime
or dependency tree. It also puts the risky parsing (ZIP, XML,
subprocesses) on well-tested stdlib modules.

The main cost of Python is **schema drift**. We mitigate it in two ways:

- **Schema integration test (CI).** Against a freshly migrated Postgres,
  it compares the Python column and enum constants with
  `information_schema` and the CHECK constraint definitions, then seeds
  every scenario.
- **Fail-fast inserts.** Scenario rows are inserted through a
  per-table column allowlist, so a renamed column fails at insert time,
  not silently.

A migration that drifts from the Python constants turns the `debug-mcp`
CI job red on the same PR.

### Architecture

- **Transport: stdio only.** The entry point is `mcp.run()`, and Claude
  Code spawns the server as a child process. There is no port and no auth
  surface. **Nothing may write to stdout**, because a stray `print()`
  corrupts the protocol stream. To enforce that:
  - `logging` goes to stderr, as JSON lines (`coding_standards.md` §10).
  - ruff's `T20` rule bans `print`, except in `cli.py`.
- **Core / adapter / CLI split.** All logic lives in
  `src/pesado_debug/core/`, as plain async functions with no MCP
  imports, so it is unit-testable.
  - `server.py` is a thin adapter: it validates input, calls core, and
    wraps the result in `Annotated[CallToolResult, Model]`.
  - `cli.py` (argparse) uses the same core: `pesado-debug seed
    <scenario>`, `reset`, `init-test-db`, `migrate-test-db`. Humans and
    CI can use scenarios without MCP.
  - `core/node_runner.py` is the one place that starts Node. It builds
    the cleaned child env and runs entry points directly with `node`
    (never `npm` or `npx`). `rerun_test`, `migrate-test-db` and the
    `seed:menu` step all go through it.
- **Config** (`pydantic-settings`):
  - Owner and repo come from config, never from tool arguments.
  - A missing variable disables only the tools that need it. Calling one
    of those returns a `ToolError` that names the missing variable, and
    the server keeps running.
- **Registration.** A `pesado-debug` entry is **added** to the existing
  `.mcp.json`. Secrets come in through `${VAR}` expansion only.
- **The existing `supabase` entry is narrowed.** Today it gives any agent
  in this repo `execute_sql` against **production**, right next to a
  server whose job is changing databases while debugging. In commit 2 it
  becomes **read-only and scoped to the production project ref**:
  `?project_ref=<ref>&read_only=true&features=database,debugging,development,docs`.
  Supabase documents `read_only=true` as running SQL as a read-only
  Postgres user, but doesn't say it disables `deploy_edge_function` or
  the branching tools, so the `functions` and `branching` groups are
  dropped as well. The `investigate_ci_failure`
  prompt also says: never use the `supabase` server's tools during an
  investigation. If read-only mode isn't available, the entry moves out
  of the committed `.mcp.json` into user scope instead.

### Test database safety

The seed and reset tools delete data. All three locks below live in
`core/testdb.py`, each with its own unit test proving it blocks on its
own.

1. **Separate variable.** `config.py` declares only
   `PESADO_TEST_DATABASE_URL`. The server never reads `DATABASE_URL`,
   `SUPABASE_*` or any `.env` other than its own. A unit test sets
   `DATABASE_URL` to a sentinel and asserts that no setting picks it up.
2. **Host allowlist.** The URL is parsed with
   `psycopg.conninfo.conninfo_to_dict`, which accepts both URL and
   `key=value` forms.
   - Every `host` (libpq allows a comma-separated list) and every
     `hostaddr` must be `localhost`, `127.0.0.1` or `::1`, or exactly
     equal `PESADO_TEST_DB_ALLOWED_HOST`.
   - These are refused: a missing host (libpq would fall back to
     `PGHOST`), a Unix socket path, and a `service=` parameter (which
     points at an external service file).
3. **Marker row.** `pesado_meta.env(name text primary key, created_at
   timestamptz not null default now())` must contain `'test'`. The check
   runs as the first statement **inside the transaction that writes**,
   using `to_regclass('pesado_meta.env')` first, so a missing table is a
   clean refusal and not an aborted transaction. Production never has
   this schema.

**Why its own schema, not `public`:** anything that cleans tables by
listing `public` (our own reset, and possibly the backend's integration
`setup.ts`) would otherwise truncate the marker and silently disable
every seed after the first integration rerun. A separate schema is out
of reach of that code. It is also not exposed by Supabase's Data API by
default, so it needs no RLS. Dropping or recreating the whole database
removes it, which fails safe: the locks refuse until you run
`init-test-db` again.

Creating the marker:

- `pesado-debug init-test-db` creates the schema, table and row. It is a
  CLI command only, **never an MCP tool**.
- It enforces lock 2 before doing anything, so it can never mark a
  non-allowlisted database (such as production) as test.
- It prints the host and database name and requires typing the database
  name back. For CI, `--confirm <dbname>` must match the database name.
  Because of this, the local test database is named `pesado_test`, not
  `postgres`: typing back "postgres" would prove nothing.

Migrating the test DB:

- `pesado-debug migrate-test-db` (CLI only) enforces locks 1 and 2, then
  runs node-pg-migrate's entry point directly through `node_runner`, with
  `DATABASE_URL` set to the test URL and `--envPath` pointing at an empty
  temp file.
- This replaces typing `DATABASE_URL=... npx node-pg-migrate up` by hand.
  That command is bash-only (it fails in PowerShell), and a typo in the
  variable makes node-pg-migrate fall back to `backend/.env`, which means
  migrating **production** from a laptop. The command puts migrations
  behind the same locks as everything else.
- Lock 3 is not checked here, because a fresh database has no marker
  yet. The order is: `migrate-test-db`, then `init-test-db`.

More safeguards:

- Tools write rows directly with parameterized queries. Identifiers are
  composed with `psycopg.sql.Identifier`, never f-strings.
- Tools never call the Express API, Twilio or Stripe, so seeding can't
  send a WhatsApp message.
- Scenario phone numbers are obviously fake: `+1500555xxxx` (Twilio's
  magic test range) and `+52656555xxxx`. A unit test enforces this.

**Test DB options** (README). No Supabase branching or other paid
features are used.

- **Local, recommended:** a plain `postgres:17` container from
  `tools/pesado-debug-mcp/docker-compose.test.yml` (Docker is installed),
  on port `54329`, database `pesado_test`. CI's backend job already
  migrates and runs integration tests against plain `postgres:17`, which
  shows the migrations need nothing Supabase-specific. Using the same
  image locally makes local and CI the same thing, and it is much
  lighter than the full Supabase stack. Then `uv run pesado-debug
  migrate-test-db` and `uv run pesado-debug init-test-db`.
- **CI:** a `postgres:17` service container in the `debug-mcp` job,
  prepared the same way.
- **Alternatives:**
  - Supabase CLI `npx supabase start` works too (free, local), if a test
    ever needs Supabase-only features.
  - A separate free Supabase project. Not recommended: it uses the
    second of the two free active projects, and free projects pause
    after a week of inactivity. If used, connect through the **Session
    Pooler** string (the direct endpoint is IPv6-only in some
    environments) and set `PESADO_TEST_DB_ALLOWED_HOST` to that pooler
    host.

### CI test report

`core/report.py` turns a folder of JUnit XML files into markdown, using
the same `junit.py` parser as `get_failing_tests`.

- **Content:** an overall status line, a table per suite (passed,
  failed, skipped, pass rate), then each failing test with its file and
  first error line. The full message and trimmed stack sit in a
  collapsible `<details>` block. At most 25 failures, with a "+N more"
  line.
- **Where it runs:** a `report` job in `ci.yml` with
  `needs: [backend, frontend]` and `if: always()`. It downloads the
  `junit-*` artifacts from the same run and calls `pesado-debug report
  --from-dir artifacts --out "$GITHUB_STEP_SUMMARY"`. It needs no GitHub
  token and no database.
- **Untrusted input:** test names and messages come from test output.
  Names are escaped for markdown and HTML (`html.escape`, plus `|`, `` ` ``
  and `*`), and messages and stacks go inside fenced code blocks whose
  fence is longer than any backtick run in the text. A unit test feeds
  in names containing `<script>`, `|` and backticks.
- **No JUnit at all** (the run failed before tests ran): the report says
  so and points to the failing job, instead of showing an empty table.

### Agent workflows

Three MCP prompts, which Claude Code exposes as slash commands:

- **`investigate_ci_failure(run_id?)`:** from a red run to a root-cause
  hypothesis with evidence and a flake verdict. Never edits code, and
  never uses the `supabase` server's tools.
- **`summarize_failures(run_id)`:** a short summary of what failed and
  the likely cause, sized to paste into a PR comment or a bug report
  (title, steps to reproduce, expected, actual, evidence).
- **`write_regression_test(run_id?, file?)`:** after a root cause is
  confirmed, writes **one** failing test that reproduces it, runs it with
  `rerun_test` to prove it fails for the right reason, and stops. It
  doesn't fix the bug.

One **Claude Code subagent**, `.claude/agents/ci-triager.md`:

- Its tool list is limited to `get_failed_runs`, `get_run_logs`,
  `get_failing_tests` and `rerun_test`. No file edits, no shell, no seed
  or reset, no `supabase` tools.
- The main agent delegates triage to it and gets back a structured
  finding (failing tests, verdict, suspected file and line, evidence).
  Long logs stay in the subagent's context instead of the main one.
- This is the orchestration pattern: a narrow agent with read-mostly
  tools does the investigation, and the main agent decides what to do
  with the result.

### Evaluation

The agent workflow is measured against known faults, in
`tools/pesado-debug-mcp/evals/`:

- **Cases** (`evals/cases/*.yaml`): each one names a branch
  (`eval/<case>`) with one injected fault, and the expected result:
  failure category, root-cause file, and flake verdict.
- **Planned cases:**

  | Case | Injected fault | Expected |
  |---|---|---|
  | `unit-assertion` | wrong expected value in a backend unit test | `deterministic_fail`, that test file |
  | `logic-bug` | off-by-one in `pickupRules.ts` that a unit test catches | `deterministic_fail`, `pickupRules.ts` |
  | `flaky-timing` | a test that depends on the current millisecond | `flaky` |
  | `typecheck` | a type error in a backend route | no JUnit, cause found from `get_run_logs` |
  | `frontend-unit` | a broken frontend helper | `deterministic_fail`, frontend file |
  | `integration-db` | an integration test that expects a menu item `seed:menu` doesn't create | `deterministic_fail`, root cause is test data |

- **Runner:** `evals/run.md` describes running `/investigate_ci_failure`
  on each case's CI run in a fresh Claude Code session, and recording
  the result in `evals/results.md`: root cause right or wrong, verdict
  right or wrong, number of tool calls, and time to answer. The same
  cases are also timed when investigated by hand, without the server.
- **Why:** the results table turns "it helps" into numbers (cases
  diagnosed correctly, time saved), and it catches regressions when the
  prompts or tools change.
- The `eval/*` branches are never merged. Their CI runs are kept as
  fixtures.

### Later phase: Playwright end-to-end tests

Once the six ordering screens exist (see the frontend screens prompt),
the ordering flow (menu → item → cart → checkout → OTP → confirmation)
gets Playwright tests in `frontend/src/test/e2e/`.

- They write `frontend/reports/junit-e2e.xml` with Playwright's JUnit
  reporter, so `get_failing_tests` and the CI report pick them up with no
  change, because both already read every `*.xml`.
- The OTP step uses a test-only verification bypass, enabled only when
  the API runs against a database that passes the three locks, never by
  a flag that could be set in production.
- `rerun_test` stays Vitest-only until then. Adding Playwright is a
  separate runner entry in `rerun.py`.

### Output caps and context budget

Every tool returns a compact pydantic model plus a one- or two-line text
summary.

| Cap | Limit |
|---|---|
| Log text per call | 20,000 characters (about 5k tokens) |
| Failures per call | 25 |
| Stack trace | first 8 frames inside the repo; `node_modules` and `node:` frames dropped |
| Failed runs per call | 20 |
| `tail_lines` | 1,000 |

Every response carries a `truncated` flag and a `hint` that says how to
get more (for example "narrow with `grep`", "pass `job_name`", or "raise
`tail_lines`").

### `rerun_test` threat model

| Threat | Mitigation |
|---|---|
| Shell injection through `file` or `test_name` | `asyncio.create_subprocess_exec` with an args list, never `shell=True`. On Windows, npm's `.cmd` shims run through `cmd.exe`, where argument quoting can't be made safe (the BatBadBut class of bugs). So the tool runs **`node <workspace>/node_modules/vitest/vitest.mjs run ...` directly**, with `node` found by `shutil.which`. `npx` and `npm` are never used. |
| Regex injection or unintended matches in `-t` | `test_name` goes through `re.escape` before it is passed to `-t`. |
| Path traversal, symlinks, junctions | `workspace` maps to a directory through a fixed dict. `file` must pass `Path.resolve(strict=True)` (which follows symlinks and junctions), be `is_relative_to(<workspace>/src/test)`, and match `\.(test|spec)\.tsx?$`. |
| Leaking the production DB or real credentials into tests | The child env (built by `node_runner`) copies `os.environ`, then removes `DATABASE_URL`, `GITHUB_TOKEN` and `PESADO_*`, then sets `DATABASE_URL` to the test URL. It also sets `DOTENV_CONFIG_PATH` to an empty temp file, so the integration setup's `import "dotenv/config"` can't load `backend/.env`. Removing `DATABASE_URL` alone would not be enough, because dotenv would refill it from `backend/.env`. **Every key in `backend/.env.example` gets a placeholder value** (the same placeholders CI uses), generated from that file rather than a hand-written list. If `src/config/env.ts` ever loads `backend/.env` through an explicit path, dotenv still won't override keys that are already set, so no real Twilio, JWT or Supabase value can leak in. A unit test fails if any `.env.example` key is missing from the child env. |
| An integration test writing to an unmarked DB | Files under `backend/src/test/integration/` run with `vitest.integration.config.ts`, and only after all three DB locks pass. |
| A false `deterministic_fail` from the wrong DB state | CI runs integration tests on a DB that was migrated and then filled by `seed:menu` (the 35 real items). Before an integration file runs, `rerun_test` recreates that state: lock 3, truncate `public` (without loading `baseline`), then the `seed:menu` script's entry point through `node_runner`. Otherwise a test that expects a real menu item would fail on every run and look like a real bug. This wipes any scenario data, and the result says so. |
| Runaway or hung test | A 60 s `asyncio.wait_for` per run. On timeout the whole process tree is killed (`taskkill /T /F` on Windows, `killpg` on POSIX), because Vitest's fork pool spawns child processes. |
| Misreading results | Each run writes JUnit to a temp file, parsed by the same `junit.py`. If zero tests ran (for example, `test_name` matched nothing), the result is an error, not a pass. |

`get_failing_tests` reads untrusted CI artifacts. The defenses:

- The artifact download is capped at 50 MB.
- A ZIP may have at most 50 members. Each member is read with a hard
  10 MB limit, so a lying `file_size` header doesn't help.
- XML is parsed only with `defusedxml`.
- Job-log and artifact downloads follow GitHub's 302 to blob storage.
  httpx drops the `Authorization` header on cross-origin redirects, and a
  test asserts it.
- Logs and artifacts expire. GitHub's 410 (or 404 for an artifact that
  is gone) becomes a clear `ToolError`, such as "artifacts for run N have
  expired; rerun the workflow".

## Gaps

Places where the request didn't match the repo, and what this ADR does
about each:

1. **IDs are `serial` integers, not UUIDs.** Scenarios can't use fixed
   UUIDs. They use **fixed integer IDs in a reserved block per table**:
   customers 9001+, menu items 9101+, capacity slots 9201+, orders 9301+,
   order items 9401+. Reset restarts the sequences at 1, so rows the app
   creates afterwards never collide.
2. **No block threshold exists.** The `blocked_customer` scenario
   ("`no_show_count` at the block threshold") needs a value that isn't
   defined anywhere (`architecture.md` §8). **Left out until the
   threshold exists.** A placeholder count would quietly become a rule
   that tests depend on before the business has decided it.
3. **Capacity isn't enforced, and slot occupancy isn't defined.** Nothing
   reads `capacity_slots`, and no code says which orders count against a
   slot (`requested_time`? `estimated_ready_at`? `created_at` for ASAP?).
   So "a slot whose `max_orders` is already reached" can't be seeded
   without inventing that rule. **`capacity_full` is left out.**
   `baseline` still seeds today's slots, because the table and columns
   exist.
4. **`scheduled_pickup` was "tomorrow at 12:30", but the API only
   accepts same-day pickups.** A state the API can never create would
   send debugging in the wrong direction, so it is now **same-day**. Its
   `at` defaults to **10:00 shop time on today's date if today is Mon to
   Sat, otherwise the next Monday**, and `requested_time` is 12:30 on that
   date. Defaulting to "now" would give an invalid row when seeding on a
   Sunday or after 12:30. An explicit `at` after 12:30, or on a Sunday,
   is refused with a clear error.
5. **The API's clock can't be injected.** `POST /orders` calls
   `new Date()`. `after_2pm_before_14` seeds data as of 13:30 shop time,
   but it doesn't move the API's clock. Tests of the 14:00 gate still
   need `vi.setSystemTime`, or the pure `resolvePickupMinutes(now, ...)`
   in `pickupRules.ts`.
6. **The backend runs Vitest twice, so it has two JUnit files.** The
   request assumes one `reports/junit.xml` per workspace. The plan
   writes `reports/junit-unit.xml` (both workspaces) and
   `reports/junit-integration.xml` (backend). `get_failing_tests` reads
   every `*.xml` in `reports/` (local) or in the artifact zip (CI). The
   existing JSON reports and `test-results-*` artifacts stay unchanged
   for now. Removing them, if nothing reads them, is a separate cleanup
   PR.
7. **No Jest in the repo.** The JUnit parser is tested against real
   Vitest output, plus one hand-written `jest-junit`-format fixture so it
   stays runner-agnostic. `rerun_test` supports Vitest only.
8. **No grace period is defined** (`architecture.md` §8).
   `unpaid_order` sets `estimated_ready_at = at - 30 min`. That is a
   fixture value, not a rule.
9. **The marker table doesn't follow two standards.** `pesado_meta.env`
   is created outside migrations, and has no `id` (`coding_standards.md`
   §4). Both are deliberate: migrations run in production, and this
   table must **never** exist there. It has `created_at`; `name` stays
   the primary key.
10. **Python isn't covered by `coding_standards.md`**, which says
    "TypeScript everywhere". See the proposed section below.
11. **The backend has no ESLint**, though `coding_standards.md` §2 says
    ESLint everywhere. This is out of scope. The JS checks run for
    touched files are the existing `typecheck` and tests.
12. **Scenario data and integration-test data are two separate states.**
    Integration tests expect `seed:menu`'s real menu. Scenarios use the
    small `baseline` menu, whose `Burritos/Asado` row would also collide
    with `seed:menu`'s row under `UNIQUE(category, name)`. They are never
    loaded together: scenarios are for reproducing a bug by hand through
    the API or UI, and `rerun_test` rebuilds CI's state itself for
    integration files.
13. **GitHub's workflow-runs endpoint doesn't accept display names.**
    `GET /actions/workflows/{workflow_id}/runs` takes a numeric ID or a
    file name (`ci.yml`). `get_failed_runs` resolves anything else
    through `GET /actions/workflows`, and an unknown name returns a
    `ToolError` that lists the real workflows.
14. **The frontend ordering screens don't exist yet**, so there's
    nothing for Playwright to test. End-to-end tests are a later phase,
    after those screens ship.
15. **Eval branches use CI minutes.** Six `eval/*` branches each trigger
    a CI run. That's a one-time cost; the runs are kept, not repeated,
    unless the prompts or tools change.

## Proposed addition to `coding_standards.md`

To be added as a new section in commit 2, if you agree:

> ## 12. Python (dev tooling only)
>
> Python is allowed only for standalone developer tools under `tools/`
> (ADR-007), never for app code.
>
> - One uv project per tool: `pyproject.toml` + committed `uv.lock`,
>   `src/` layout, Python ≥ 3.12. CI installs with `uv sync --locked`.
> - Type hints everywhere. `mypy --strict` (with the pydantic plugin)
>   must pass. No `Any` without a comment explaining why (same rule as
>   §2).
> - Formatter and linter: `ruff format` and `ruff check` (rules at least
>   `E,F,I,B,UP,S,T20,ASYNC`). No inline `noqa` without a reason.
> - Tests: `pytest`. Tests that need a database are marked
>   `@pytest.mark.integration` and run in CI.
> - SQL: parameterized queries only. Identifiers are composed with
>   `psycopg.sql`, never f-strings.
> - Subprocesses: argument lists only, never `shell=True`.

## Consequences

- **Easier:**
  - An agent can go from "CI is red" to the failing test, the trimmed
    log and a flake verdict in a few tool calls, without touching
    production.
  - Every way the tool touches a database (seed, reset, migrate, rerun)
    goes through the same three locks.
  - Every CI run shows a readable test report on its page, with no
    extra tools needed to read it.
  - A failure can go from triage to a PR-ready summary to a failing
    regression test through three slash commands.
  - The agent workflow's accuracy is measured on known faults, and
    re-measured when prompts or tools change.
  - Scenarios are also usable by hand: `uv run pesado-debug seed
    unpaid_order`.
- **Harder:**
  - A second toolchain to install (uv) and keep green in CI.
  - A migration that renames a column or changes an enum must also update
    `core/schema.py`. The `debug-mcp` CI job fails until it does.
  - Rerunning an integration test wipes any scenario data in the test
    DB (Gap 12).
  - The Supabase MCP can no longer write to production from this repo.
    Any production write now goes through the dashboard or the backend's
    own tooling.
- **New debt:** the scenario set is incomplete until the no-show
  threshold and capacity occupancy rules exist (Gaps 2 and 3).
- **Revisit if:**
  - The backend gets a second test runner, or moves off Vitest.
  - The team needs a shared server (HTTP transport plus auth).
  - The capacity and no-show logic is built, so the two left-out
    scenarios can be added.
  - The ordering screens ship, which starts the Playwright phase.
  - Pass-rate trends over time become a real need, which would justify a
    dashboard with history.
  - The duplicated schema constants cause repeated drift. At that point,
    consider generating them from `information_schema` at build time.

## Resolved questions

1. `blocked_customer`: **left out** until a threshold exists (Gap 2).
2. `scheduled_pickup`: **same-day 12:30**, with `at` defaulting to 10:00
   on the next Mon to Sat date (Gap 4).
3. CI reports: **keep the JSON reports** next to JUnit for now. Remove
   them in a later PR if nothing reads them.
4. Type checker: **mypy strict**. It is pure Python, has a pydantic
   plugin, and needs no Node download in CI.

## Checks before Phase 3

These decide details of the build. All four are answered:

1. **`backend/src/test/integration/setup.ts` cleanup.** It cleans
   nothing; it only fills in a placeholder `TWILIO_VERIFY_SERVICE_SID`.
   `orders.test.ts` deletes its own rows in `afterAll`, matched by random
   `+1555010xxxx` / `+1555011xxxx` phones (no overlap with scenario
   phones), and looks up real `seed:menu` items such as `Burritos`. So
   `rerun_test`'s prep (truncate, then `seed:menu`) is what it expects.
2. **`price_cents` constraint.** No migration has a CHECK on
   `price_cents` (only `NOT NULL`), so `baseline`'s zero-price row can be
   inserted as planned.
3. **Entry points** (run with `backend/` as the working directory, Node
   24.13.1 locally):
   - `seed:menu` is `tsx scripts/seed-menu.ts`, so `node_runner` runs
     `node node_modules/tsx/dist/cli.mjs scripts/seed-menu.ts`.
   - node-pg-migrate's bin is `bin/node-pg-migrate.js`, so
     `migrate-test-db` runs
     `node node_modules/node-pg-migrate/bin/node-pg-migrate.js up --envPath <empty file>`.
   - `backend/.env.example` has 8 active keys (`NODE_ENV`, `PORT`,
     `DATABASE_URL`, `JWT_SECRET`, `TWILIO_ACCOUNT_SID`,
     `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `CORS_ORIGINS`)
     and a commented-out `STRIPE_SECRET_KEY`. The placeholder generator
     reads active keys only, because an empty `STRIPE_SECRET_KEY` fails
     validation.
4. **Supabase MCP options.** Supabase's MCP docs give `read_only=true`,
   `project_ref=<id>` and `features=<groups>` as URL query parameters,
   which can be combined. Applied as described under Architecture.

## Related

- `architecture.md` §2 (components, hosting), §3 (data model), §5
  (capacity), §6 (no-show), §8 (open questions this depends on).
- `coding_standards.md` §2 (TypeScript everywhere; this ADR adds a
  Python exception), §4 (migrations, table columns, parameterized SQL),
  §7 (secrets), §8 (tests), §10 (structured logs, masking).
- ADR-003 (WhatsApp OTP via Twilio Verify; scenarios never call it).
- ADR-005 (Supabase project, Session Pooler).
- ADR-006 (`oxxo` removed from `payment_method`).
- The frontend ordering screens prompt (the Playwright phase depends on
  it).
- Plan: `docs/plans/debug-mcp-server.md`.