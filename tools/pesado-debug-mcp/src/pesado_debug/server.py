"""MCP adapter: registers tools and prompts on an MCPServer and runs it over stdio.

Thin by design (ADR-007): each tool validates input through its type hints,
calls a function in `core/`, and wraps the result as a short text summary plus
structured content validated against the tool's output model. Known failures
(missing config, GitHub errors, ...) become a ToolError the agent can read.
"""

import logging
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Annotated

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from pydantic import BaseModel, Field

from pesado_debug import __version__
from pesado_debug.config import ConfigMissingError, Settings
from pesado_debug.core import github
from pesado_debug.core.github import GitHubClient, GitHubError
from pesado_debug.logging_setup import configure_logging
from pesado_debug.models import FailedRuns, RunLogs

logger = logging.getLogger(__name__)

SERVER_NAME = "pesado-debug"
INSTRUCTIONS = (
    "Investigates El Pesado test and CI failures: failed GitHub Actions runs, trimmed job logs, "
    "JUnit test results, test-only database scenarios, and a local flake checker. "
    "Database tools only ever touch a database marked as test; they never touch production."
)

# Reads GitHub only. open_world: results come from an external service.
GITHUB_READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=True)

# Errors whose message is written for the agent; anything else is a bug.
EXPECTED_ERRORS: tuple[type[Exception], ...] = (ConfigMissingError, GitHubError)


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
