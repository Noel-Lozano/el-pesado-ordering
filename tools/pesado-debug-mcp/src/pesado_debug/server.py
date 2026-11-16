"""MCP adapter: registers tools and prompts on an MCPServer and runs it over stdio.

Thin by design (ADR-007): each tool validates input through its type hints,
calls a function in `core/`, and wraps the result as a short text summary plus
structured content validated against the tool's output model. Known failures
(missing config, GitHub errors, ...) become a ToolError the agent can read.
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime
from typing import Annotated, Literal

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from pydantic import AwareDatetime, BaseModel, Field

from pesado_debug import __version__
from pesado_debug.config import ConfigMissingError, Settings
from pesado_debug.core import artifacts, github, junit, rerun, testdb
from pesado_debug.core.artifacts import ArtifactError
from pesado_debug.core.github import GitHubClient, GitHubError
from pesado_debug.core.junit import JUnitError
from pesado_debug.core.migrate import BackendScriptError
from pesado_debug.core.node_runner import NodeRunnerError
from pesado_debug.core.rerun import RerunError
from pesado_debug.core.scenarios import REGISTRY, ScenarioError, ScenarioName
from pesado_debug.core.shop_time import NaiveDatetimeError
from pesado_debug.core.testdb import TestDbError, TestDbRefused
from pesado_debug.logging_setup import configure_logging
from pesado_debug.models import FailedRuns, FailingTests, RerunResult, ResetResult, RunLogs, SeedResult

logger = logging.getLogger(__name__)

SERVER_NAME = "pesado-debug"
INSTRUCTIONS = (
    "Investigates El Pesado test and CI failures: failed GitHub Actions runs, trimmed job logs, "
    "JUnit test results, test-only database scenarios, and a local flake checker. "
    "Database tools only ever touch a database marked as test; they never touch production."
)

# Reads GitHub only. open_world: results come from an external service.
GITHUB_READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=True)

# Deletes and rewrites rows, but only in a database marked as test (ADR-007 locks).
TEST_DB_WRITE = ToolAnnotations(
    read_only_hint=False, destructive_hint=True, idempotent_hint=True, open_world_hint=False
)
# Runs a local test. Destructive: an integration file resets the test DB first.
RERUN = ToolAnnotations(
    read_only_hint=False, destructive_hint=True, idempotent_hint=False, open_world_hint=False
)
TEST_DB_SEED = ToolAnnotations(
    read_only_hint=False, destructive_hint=True, idempotent_hint=False, open_world_hint=False
)

# Errors whose message is written for the agent; anything else is a bug.
EXPECTED_ERRORS: tuple[type[Exception], ...] = (
    ConfigMissingError,
    GitHubError,
    ArtifactError,
    JUnitError,
    TestDbRefused,
    TestDbError,
    ScenarioError,
    NaiveDatetimeError,
    RerunError,
    NodeRunnerError,
    BackendScriptError,
)


def tool_result(summary: str, model: BaseModel) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=summary)],
        structured_content=model.model_dump(mode="json"),
    )


@contextmanager
def agent_errors() -> Iterator[None]:
    try:
        yield
    except EXPECTED_ERRORS as exc:
        raise ToolError(str(exc)) from exc


def _now() -> datetime:
    return datetime.now().astimezone()


def build_server(settings: Settings) -> MCPServer:
    server: MCPServer = MCPServer(name=SERVER_NAME, version=__version__, instructions=INSTRUCTIONS)

    @asynccontextmanager
    async def github_client(feature: str) -> AsyncIterator[GitHubClient]:
        token, owner, repo = settings.require_github(feature)
        async with GitHubClient(token, owner, repo) as client:
            yield client

    @server.tool(annotations=GITHUB_READ_ONLY)
    async def get_failed_runs(
        branch: Annotated[str | None, Field(description="Only runs for this branch.")] = None,
        workflow: Annotated[
            str | None,
            Field(description='Workflow file name ("ci.yml"), numeric ID, or display name ("CI").'),
        ] = None,
        limit: Annotated[int, Field(ge=1, le=20, description="How many failed runs to return.")] = 5,
    ) -> Annotated[CallToolResult, FailedRuns]:
        """List recent failed GitHub Actions runs in this repo, with each run's failed jobs and failed step.

        Start here when CI is red. Use a run_id from the result with get_run_logs or get_failing_tests.
        """
        with agent_errors():
            async with github_client("get_failed_runs") as client:
                result = await github.get_failed_runs(client, branch=branch, workflow=workflow, limit=limit)
        return tool_result(github.summarize_runs(result), result)

    @server.tool(annotations=GITHUB_READ_ONLY)
    async def get_run_logs(
        run_id: Annotated[int, Field(description="GitHub Actions run ID.")],
        job_name: Annotated[
            str | None, Field(description="Read this job only. Default: every failed job in the run.")
        ] = None,
        tail_lines: Annotated[int, Field(ge=1, le=1000, description="Lines to keep from the end.")] = 200,
        grep: Annotated[
            str | None,
            Field(
                description="Case-insensitive substring; searches the whole log instead of the failed step."
            ),
        ] = None,
    ) -> Annotated[CallToolResult, RunLogs]:
        """Read a run's job logs, cleaned (no ANSI codes or timestamps) and cut to the failed step.

        `##[error]` lines are always kept. Output is capped at 20,000 characters per call; when
        a job is truncated, its `hint` says how to get more. Use this when there is no JUnit report
        (lint, typecheck or build failures).
        """
        with agent_errors():
            async with github_client("get_run_logs") as client:
                result = await github.get_run_logs(
                    client, run_id=run_id, job_name=job_name, tail_lines=tail_lines, grep=grep
                )
        return tool_result(github.summarize_logs(result), result)

    @server.tool(annotations=GITHUB_READ_ONLY)
    async def get_failing_tests(
        source: Annotated[
            Literal["local", "ci"],
            Field(
                description=(
                    "local: <workspace>/reports/*.xml on disk. ci: the run's junit-<workspace> artifact."
                )
            ),
        ],
        workspace: Annotated[Literal["backend", "frontend"], Field(description="Which npm project's tests.")],
        run_id: Annotated[
            int | None, Field(description="GitHub Actions run ID; required when source='ci'.")
        ] = None,
    ) -> Annotated[CallToolResult, FailingTests]:
        """Failing tests from JUnit reports: file, test name, message and a trimmed stack.

        Returns at most 25 failures; stacks keep the first 8 frames inside the repo. If a CI run has
        no JUnit artifact, the failure happened before tests ran: use get_run_logs instead.
        """
        with agent_errors():
            if source == "local":
                raw = artifacts.read_local_reports(settings.pesado_repo_root, workspace)
            else:
                if run_id is None:
                    raise ToolError("run_id is required when source='ci'.")
                async with github_client("get_failing_tests") as client:
                    raw = await artifacts.download_ci_reports(client, run_id, workspace)
            parsed = junit.parse_reports(raw, workspace=workspace, repo_root=str(settings.pesado_repo_root))
            result = junit.to_failing_tests(parsed)
        return tool_result(junit.summarize(result), result)

    @server.tool(annotations=TEST_DB_WRITE)
    async def reset_test_db(
        confirm: Annotated[Literal[True], Field(description="Must be true: this deletes every app row.")],
    ) -> Annotated[CallToolResult, ResetResult]:
        """Empty every app table in the TEST database and load the baseline menu and capacity slots.

        Only runs against a database that passes all three locks (PESADO_TEST_DATABASE_URL, an allowed
        host, and the pesado_meta.env marker row). Never touches production.
        """
        with agent_errors():
            result = await asyncio.to_thread(testdb.reset, settings, at=_now())
        tables = sum(result.rows_inserted.values())
        return tool_result(
            f"Reset {result.database}: truncated {len(result.tables_truncated)} tables, inserted {tables} "
            "baseline rows.",
            result,
        )

    @server.tool(annotations=TEST_DB_SEED)
    async def seed_test_data(
        scenario: Annotated[
            ScenarioName,
            Field(description="; ".join(f"{name}: {s.description}" for name, s in REGISTRY.items())),
        ],
        reset: Annotated[bool, Field(description="Truncate every app table first.")] = True,
        at: Annotated[
            AwareDatetime | None,
            Field(
                description=(
                    "Scenario time, with a UTC offset. Default: the scenario's own default (often now)."
                )
            ),
        ] = None,
    ) -> Annotated[CallToolResult, SeedResult]:
        """Load a named scenario into the TEST database and return the IDs it created.

        Rows are written directly (never through the API, Twilio or Stripe), with fixed IDs in reserved
        blocks (customers 9001+, menu 9101+, slots 9201+, orders 9301+, order items 9401+). Use it to
        reproduce a bug by hand through the API or UI. Don't seed before rerun_test on an integration
        file: that rerun resets the database itself.
        """
        with agent_errors():
            chosen_at = at if at is not None else REGISTRY[scenario].default_at(_now())
            result = await asyncio.to_thread(
                testdb.seed, settings, scenario=scenario, at=chosen_at, reset_first=reset
            )
        created = ", ".join(f"{table} {ids}" for table, ids in result.ids.items())
        return tool_result(
            f"Seeded {scenario} into {result.database} at {result.at.isoformat()}: {created}", result
        )

    @server.tool(annotations=RERUN)
    async def rerun_test(
        workspace: Annotated[Literal["backend", "frontend"], Field(description="Which npm project.")],
        file: Annotated[
            str,
            Field(
                description='Test file relative to the workspace, e.g. "src/test/unit/lib/pricing.test.ts".'
            ),
        ],
        test_name: Annotated[
            str | None,
            Field(description='Run only this test (as get_failing_tests names it, e.g. "suite > test").'),
        ] = None,
        times: Annotated[int, Field(ge=1, le=10, description="How many sequential runs.")] = 5,
    ) -> Annotated[CallToolResult, RerunResult]:
        """Run one Vitest test file (or one test) several times locally and give a flake verdict.

        Verdicts: deterministic_fail (every run failed), flaky (mixed), passes_locally (every run
        passed). Each run has a 60 s limit. Files under backend/src/test/integration need the test DB:
        it is reset and filled by seed:menu first (CI's state), so any seeded scenario is wiped.
        """
        with agent_errors():
            result = await rerun.rerun_test(
                settings, workspace=workspace, file=file, test_name=test_name, times=times
            )
        return tool_result(rerun.summarize(result), result)

    logger.info(
        "server_built",
        extra={"github_ready": settings.github_ready, "db_ready": settings.db_ready},
    )
    return server


def main() -> None:
    configure_logging()
    settings = Settings()
    build_server(settings).run()  # stdio is the default (and only) transport


if __name__ == "__main__":
    main()
