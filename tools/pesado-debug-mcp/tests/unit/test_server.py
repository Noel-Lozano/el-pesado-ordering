"""The MCP adapter: what the server advertises, and that stdout stays clean."""

import asyncio
import json
import os
import sys

from mcp import Client
from mcp.client.stdio import StdioServerParameters

from pesado_debug.config import Settings
from pesado_debug.server import SERVER_NAME, build_server

EXPECTED_TOOLS: set[str] = set()


async def test_lists_expected_tools(bare_settings: Settings) -> None:
    async with Client(build_server(bare_settings)) as client:
        result = await client.list_tools()
    assert {tool.name for tool in result.tools} == EXPECTED_TOOLS


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
