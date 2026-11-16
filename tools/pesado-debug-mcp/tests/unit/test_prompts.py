import re

import pytest
from mcp import Client

from pesado_debug import prompts
from pesado_debug.config import Settings
from pesado_debug.server import build_server

TOOL_PREFIX = re.compile(r"`((?:get|seed|reset|rerun)_[a-z_]+)`")

ALL_PROMPTS = {
    "investigate_ci_failure": prompts.investigate_ci_failure(7),
    "investigate_ci_failure (no run)": prompts.investigate_ci_failure(),
    "summarize_failures": prompts.summarize_failures(7),
    "write_regression_test": prompts.write_regression_test(7, "backend/src/lib/pickupRules.ts"),
}


async def _server_names(settings: Settings) -> tuple[set[str], set[str]]:
    async with Client(build_server(settings)) as client:
        tools = {tool.name for tool in (await client.list_tools()).tools}
        prompt_names = {prompt.name for prompt in (await client.list_prompts()).prompts}
    return tools, prompt_names


@pytest.mark.parametrize("name", sorted(ALL_PROMPTS))
async def test_prompts_name_only_real_tools(bare_settings: Settings, name: str) -> None:
    tools, _ = await _server_names(bare_settings)
    mentioned = set(TOOL_PREFIX.findall(ALL_PROMPTS[name]))
    assert mentioned, name
    assert mentioned <= tools, mentioned - tools


@pytest.mark.parametrize("name", sorted(ALL_PROMPTS))
def test_every_prompt_forbids_the_production_supabase_server(name: str) -> None:
    assert "Never use the `supabase` MCP server" in ALL_PROMPTS[name]


def test_investigation_rules() -> None:
    text = prompts.investigate_ci_failure(7)
    assert "Do not edit any code unless the user asks" in text
    assert "ci-triager" in text
    assert "Don't seed a scenario before it" in text
    assert "run_id 7" in text


def test_summary_is_bounded_and_ordered() -> None:
    text = prompts.summarize_failures(7)
    assert "At most 200 words" in text
    assert text.index("One line") < text.index("A bug report") < text.index("Likely cause")


def test_regression_test_prompt_stops_before_fixing() -> None:
    text = prompts.write_regression_test(None, None)
    assert "Do not fix the bug" in text
    assert "Don't fix the bug" in text
    assert "deterministic_fail" in text
    assert "times=3" in text


async def test_server_lists_the_three_prompts(bare_settings: Settings) -> None:
    _, prompt_names = await _server_names(bare_settings)
    assert prompt_names == {"investigate_ci_failure", "summarize_failures", "write_regression_test"}


async def test_prompt_arguments_arrive_as_strings_and_are_coerced(bare_settings: Settings) -> None:
    async with Client(build_server(bare_settings)) as client:
        result = await client.get_prompt("summarize_failures", {"run_id": "123"})
    text = result.messages[0].content.text  # type: ignore[union-attr]
    assert "CI run 123 failed" in text
