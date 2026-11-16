"""The ci-triager subagent's tool list is exactly the four allowed tools, so an edit can't widen it."""

from mcp import Client

from pesado_debug.config import DEFAULT_REPO_ROOT, Settings
from pesado_debug.server import SERVER_NAME, build_server

AGENT_FILE = DEFAULT_REPO_ROOT / ".claude" / "agents" / "ci-triager.md"
ALLOWED = {"get_failed_runs", "get_run_logs", "get_failing_tests", "rerun_test"}


def _frontmatter_lists() -> dict[str, list[str]]:
    """The YAML lists in the frontmatter (kept dependency-free: only `key:` + `  - item` lines)."""
    text = AGENT_FILE.read_text(encoding="utf-8")
    _, frontmatter, _ = text.split("---", 2)
    lists: dict[str, list[str]] = {}
    current: str | None = None
    for line in frontmatter.splitlines():
        if line.startswith("  - ") and current is not None:
            lists[current].append(line.removeprefix("  - ").strip())
        elif line and not line.startswith(" "):
            key, _, value = line.partition(":")
            current = key.strip() if not value.strip() else None
            if current is not None:
                lists[current] = []
    return lists


def test_tools_are_exactly_the_four_allowed() -> None:
    tools = _frontmatter_lists()["tools"]
    assert len(tools) == len(set(tools))
    assert set(tools) == {f"mcp__{SERVER_NAME}__{name}" for name in ALLOWED}


def test_supabase_is_disallowed() -> None:
    assert _frontmatter_lists()["disallowedTools"] == ["mcp__supabase__*"]


async def test_allowed_tools_exist_and_exclude_db_writers(bare_settings: Settings) -> None:
    async with Client(build_server(bare_settings)) as client:
        names = {tool.name for tool in (await client.list_tools()).tools}
    assert names >= ALLOWED
    assert "seed_test_data" not in ALLOWED and "reset_test_db" not in ALLOWED


def test_answer_format_is_present() -> None:
    body = AGENT_FILE.read_text(encoding="utf-8")
    for field in ("FAILING:", "VERDICT:", "SUSPECT:", "EVIDENCE:", "CONFIDENCE:"):
        assert field in body
