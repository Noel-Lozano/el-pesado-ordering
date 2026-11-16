"""The MCP adapter: what the server advertises, how tools answer, and that stdout stays clean."""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

import pytest
import respx
from mcp import Client
from mcp.client.stdio import StdioServerParameters

from pesado_debug.config import Settings
from pesado_debug.server import SERVER_NAME, build_server
from tests.fixtures import fixture_path, fixture_text

EXPECTED_TOOLS = {
    "get_failed_runs",
    "get_run_logs",
    "get_failing_tests",
    "reset_test_db",
    "seed_test_data",
    "rerun_test",
}
DB_TOOLS = {"reset_test_db", "seed_test_data", "rerun_test"}
GITHUB_TOOLS = {"get_failed_runs", "get_run_logs", "get_failing_tests"}
BASE = "https://api.github.com/repos/o/r"


@pytest.fixture
def github_settings(clean_env: pytest.MonkeyPatch) -> Settings:
    clean_env.setenv("GITHUB_TOKEN", "ghp_test")
    clean_env.setenv("GITHUB_OWNER", "o")
    clean_env.setenv("GITHUB_REPO", "r")
    return Settings(_env_file=None)


async def _tools(settings: Settings) -> dict[str, Any]:
    async with Client(build_server(settings)) as client:
        result = await client.list_tools()
    return {tool.name: tool for tool in result.tools}


async def test_lists_expected_tools(bare_settings: Settings) -> None:
    assert set(await _tools(bare_settings)) == EXPECTED_TOOLS


async def test_github_tools_are_read_only_and_open_world(bare_settings: Settings) -> None:
    tools = await _tools(bare_settings)
    for name in GITHUB_TOOLS:
        annotations = tools[name].annotations
        assert annotations is not None
        assert annotations.read_only_hint is True
        assert annotations.open_world_hint is True


async def test_db_tools_are_destructive_and_closed_world(bare_settings: Settings) -> None:
    tools = await _tools(bare_settings)
    for name in DB_TOOLS:
        annotations = tools[name].annotations
        assert annotations is not None
        assert annotations.read_only_hint is False
        assert annotations.destructive_hint is True
        assert annotations.open_world_hint is False


async def test_db_tool_schemas(bare_settings: Settings) -> None:
    tools = await _tools(bare_settings)
    confirm = tools["reset_test_db"].input_schema["properties"]["confirm"]
    assert confirm.get("const") is True or confirm.get("enum") == [True]
    scenario = tools["seed_test_data"].input_schema["properties"]["scenario"]
    assert scenario["enum"] == [
        "baseline",
        "asap_order",
        "scheduled_pickup",
        "unpaid_order",
        "mx_customer",
        "after_2pm_before_14",
    ]


async def test_reset_without_test_db_url_names_the_variable(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("DATABASE_URL", "postgresql://u:p@localhost/prod")
    async with Client(build_server(Settings(_env_file=None))) as client:
        result = await client.call_tool("reset_test_db", {"confirm": True})
    assert result.is_error
    assert "PESADO_TEST_DATABASE_URL" in result.content[0].text  # type: ignore[union-attr]


async def test_reset_refuses_remote_host(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("PESADO_TEST_DATABASE_URL", "postgresql://u:p@db.prod.example/postgres")
    async with Client(build_server(Settings(_env_file=None))) as client:
        result = await client.call_tool("reset_test_db", {"confirm": True})
    assert result.is_error
    assert "not allowed" in result.content[0].text  # type: ignore[union-attr]


async def test_reset_requires_confirm_true(bare_settings: Settings) -> None:
    async with Client(build_server(bare_settings)) as client:
        result = await client.call_tool("reset_test_db", {"confirm": False})
    assert result.is_error


async def test_rerun_test_schema(bare_settings: Settings) -> None:
    schema = (await _tools(bare_settings))["rerun_test"].input_schema
    times = schema["properties"]["times"]
    assert (times["minimum"], times["maximum"], times["default"]) == (1, 10, 5)
    assert sorted(schema["required"]) == ["file", "workspace"]


async def test_rerun_test_refuses_traversal(bare_settings: Settings) -> None:
    async with Client(build_server(bare_settings)) as client:
        result = await client.call_tool(
            "rerun_test", {"workspace": "backend", "file": "../frontend/package.json"}
        )
    assert result.is_error
    assert "not inside backend/src/test" in result.content[0].text  # type: ignore[union-attr]


async def test_input_schemas_carry_bounds(bare_settings: Settings) -> None:
    tools = await _tools(bare_settings)
    limit = tools["get_failed_runs"].input_schema["properties"]["limit"]
    assert (limit["minimum"], limit["maximum"], limit["default"]) == (1, 20, 5)
    tail = tools["get_run_logs"].input_schema["properties"]["tail_lines"]
    assert (tail["minimum"], tail["maximum"], tail["default"]) == (1, 1000, 200)
    assert tools["get_run_logs"].input_schema["required"] == ["run_id"]


async def test_tools_publish_output_schemas(bare_settings: Settings) -> None:
    tools = await _tools(bare_settings)
    assert "runs" in tools["get_failed_runs"].output_schema["properties"]
    assert "jobs" in tools["get_run_logs"].output_schema["properties"]


async def test_disabled_tool_names_missing_vars(bare_settings: Settings) -> None:
    async with Client(build_server(bare_settings)) as client:
        result = await client.call_tool("get_failed_runs", {})
    assert result.is_error
    text = result.content[0].text  # type: ignore[union-attr]
    assert "get_failed_runs is disabled" in text and "GITHUB_TOKEN" in text


async def test_get_failed_runs_returns_summary_and_structured_content(github_settings: Settings) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs").respond(json=json.loads(fixture_text("github", "runs.json")))
        router.get(url__regex=rf"{BASE}/actions/runs/\d+/jobs").respond(
            json=json.loads(fixture_text("github", "jobs.json"))
        )
        async with Client(build_server(github_settings)) as client:
            result = await client.call_tool("get_failed_runs", {"limit": 2})
    assert not result.is_error
    assert result.content[0].text.startswith("2 failed run(s):")  # type: ignore[union-attr]
    assert result.structured_content is not None
    assert result.structured_content["runs"][0]["failed_jobs"][0]["failed_step"] == "Typecheck"


async def test_github_error_becomes_tool_error(github_settings: Settings) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs/9/jobs").respond(404)
        async with Client(build_server(github_settings)) as client:
            result = await client.call_tool("get_run_logs", {"run_id": 9})
    assert result.is_error
    assert "Not found" in result.content[0].text  # type: ignore[union-attr]


async def test_out_of_range_input_is_rejected(github_settings: Settings) -> None:
    async with Client(build_server(github_settings)) as client:
        result = await client.call_tool("get_failed_runs", {"limit": 50})
    assert result.is_error


async def test_get_failing_tests_schema_has_enums(bare_settings: Settings) -> None:
    schema = (await _tools(bare_settings))["get_failing_tests"].input_schema
    assert schema["properties"]["source"]["enum"] == ["local", "ci"]
    assert schema["properties"]["workspace"]["enum"] == ["backend", "frontend"]
    assert sorted(schema["required"]) == ["source", "workspace"]


async def test_get_failing_tests_local(clean_env: pytest.MonkeyPatch, tmp_path: Path) -> None:
    reports = tmp_path / "backend" / "reports"
    reports.mkdir(parents=True)
    (tmp_path / "frontend").mkdir()
    (reports / "junit-unit.xml").write_bytes(fixture_path("junit", "vitest-fail.xml").read_bytes())
    clean_env.setenv("PESADO_REPO_ROOT", str(tmp_path))
    async with Client(build_server(Settings(_env_file=None))) as client:
        result = await client.call_tool("get_failing_tests", {"source": "local", "workspace": "backend"})
    assert not result.is_error
    assert result.structured_content is not None
    assert result.structured_content["failed"] == 2
    assert result.structured_content["reports"] == ["backend/reports/junit-unit.xml"]


async def test_get_failing_tests_ci_needs_run_id(github_settings: Settings) -> None:
    async with Client(build_server(github_settings)) as client:
        result = await client.call_tool("get_failing_tests", {"source": "ci", "workspace": "backend"})
    assert result.is_error
    assert "run_id is required" in result.content[0].text  # type: ignore[union-attr]


async def test_unsafe_report_becomes_tool_error(clean_env: pytest.MonkeyPatch, tmp_path: Path) -> None:
    reports = tmp_path / "frontend" / "reports"
    reports.mkdir(parents=True)
    (tmp_path / "backend").mkdir()
    (reports / "evil.xml").write_bytes(fixture_path("junit", "xxe.xml").read_bytes())
    clean_env.setenv("PESADO_REPO_ROOT", str(tmp_path))
    async with Client(build_server(Settings(_env_file=None))) as client:
        result = await client.call_tool("get_failing_tests", {"source": "local", "workspace": "frontend"})
    assert result.is_error
    assert "rejected unsafe XML" in result.content[0].text  # type: ignore[union-attr]


def _child_env() -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if not key.startswith(("GITHUB_", "PESADO_"))}
    env.pop("DATABASE_URL", None)
    return env


async def test_stdout_is_empty_until_a_request_arrives() -> None:
    """A stray print() at import or startup would corrupt the protocol stream."""
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "pesado_debug.server",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_child_env(),
    )
    stdout, stderr = await asyncio.wait_for(process.communicate(input=b""), timeout=30)
    assert stdout == b""
    # Logs go to stderr, as JSON lines.
    first_line = stderr.decode().splitlines()[0]
    assert json.loads(first_line)["msg"] == "server_built"


async def test_stdio_round_trip() -> None:
    """A real client over stdio parses every byte the server writes."""
    params = StdioServerParameters(
        command=sys.executable, args=["-m", "pesado_debug.server"], env=_child_env()
    )
    async with Client(params) as client:
        result = await client.list_tools()
    assert {tool.name for tool in result.tools} == EXPECTED_TOOLS


def test_server_name(bare_settings: Settings) -> None:
    assert build_server(bare_settings).name == SERVER_NAME
