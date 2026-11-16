import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import httpx
import pytest
import respx

from pesado_debug.core import github
from pesado_debug.core.github import GitHubClient, GitHubError
from tests.fixtures import fixture_text

BASE = "https://api.github.com/repos/o/r"
BLOB = "https://blob.example.net/logs/1001.txt"


def _json(name: str) -> Any:
    return json.loads(fixture_text("github", f"{name}.json"))


@pytest.fixture
async def client() -> AsyncIterator[GitHubClient]:
    async with GitHubClient("ghp_test", "o", "r") as gh:
        yield gh


@pytest.fixture
def api() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        router.get(f"{BASE}/actions/runs").respond(json=_json("runs"))
        router.get(url__regex=rf"{BASE}/actions/runs/\d+/jobs").respond(json=_json("jobs"))
        router.get(f"{BASE}/actions/workflows").respond(json=_json("workflows"))
        router.get(f"{BASE}/actions/jobs/1001/logs").respond(302, headers={"Location": BLOB})
        router.get(BLOB).respond(text=fixture_text("logs", "job-failed-step.txt"))
        router.get(f"{BASE}/actions/jobs/1003/logs").respond(
            text="2026-11-15T20:09:59Z ##[error]The job has exceeded the maximum execution time"
        )
        yield router


async def test_failed_runs_maps_runs_jobs_and_failed_step(
    client: GitHubClient, api: respx.MockRouter
) -> None:
    result = await github.get_failed_runs(client, branch=None, workflow=None, limit=5)
    first, second = result.runs
    assert first.run_id == 101
    assert first.short_sha == "abcdef1"
    assert first.commit_title == "Break the typecheck"
    assert first.branch == "feat/broken"
    assert [(job.name, job.failed_step) for job in first.failed_jobs] == [
        ("Backend (typecheck, unit, integration)", "Typecheck"),
        ("Debug MCP (lint, types, tests)", None),
    ]
    # No head_commit: fall back to the display title.
    assert second.commit_title == "Merge pull request #9"
    request = api.calls[0].request
    assert request.url.params["status"] == "failure"
    assert request.url.params["per_page"] == "5"
    assert request.headers["authorization"] == "Bearer ghp_test"


async def test_branch_filter_is_passed(client: GitHubClient, api: respx.MockRouter) -> None:
    await github.get_failed_runs(client, branch="feat/broken", workflow=None, limit=1)
    assert api.calls[0].request.url.params["branch"] == "feat/broken"


@pytest.mark.parametrize("workflow", ["ci.yml", "555", "nightly.yaml"])
async def test_workflow_file_or_id_passes_through(client: GitHubClient, workflow: str) -> None:
    with respx.mock() as router:
        route = router.get(f"{BASE}/actions/workflows/{workflow}/runs").respond(json={"workflow_runs": []})
        result = await github.get_failed_runs(client, branch=None, workflow=workflow, limit=5)
    assert route.called
    assert result.runs == []


@pytest.mark.parametrize("display_name", ["CI", "ci"])
async def test_workflow_display_name_is_resolved(client: GitHubClient, display_name: str) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/workflows").respond(json=_json("workflows"))
        route = router.get(f"{BASE}/actions/workflows/555/runs").respond(json={"workflow_runs": []})
        await github.get_failed_runs(client, branch=None, workflow=display_name, limit=5)
    assert route.called


async def test_unknown_workflow_lists_real_ones(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/workflows").respond(json=_json("workflows"))
        with pytest.raises(GitHubError, match=r"CI \(ci.yml\), Nightly \(nightly.yml\)"):
            await github.get_failed_runs(client, branch=None, workflow="Deploy", limit=5)


async def test_logs_follow_redirect_without_sending_the_token(
    client: GitHubClient, api: respx.MockRouter
) -> None:
    result = await github.get_run_logs(client, run_id=101, job_name=None, tail_lines=200, grep=None)
    blob_request = next(call.request for call in api.calls if call.request.url.host == "blob.example.net")
    assert "authorization" not in blob_request.headers
    # Failed and timed-out jobs are selected; the successful frontend job is not.
    assert [job.name for job in result.jobs] == [
        "Backend (typecheck, unit, integration)",
        "Debug MCP (lint, types, tests)",
    ]
    backend = result.jobs[0]
    assert backend.failed_step == "Typecheck"
    assert backend.lines[0] == "##[group]Run npm run typecheck"


async def test_logs_for_a_named_job(client: GitHubClient, api: respx.MockRouter) -> None:
    result = await github.get_run_logs(
        client, run_id=101, job_name="backend (typecheck, unit, integration)", tail_lines=200, grep=None
    )
    assert [job.name for job in result.jobs] == ["Backend (typecheck, unit, integration)"]


async def test_unknown_job_name_lists_jobs(client: GitHubClient, api: respx.MockRouter) -> None:
    with pytest.raises(GitHubError, match=r"no job named 'Deploy'.*Frontend"):
        await github.get_run_logs(client, run_id=101, job_name="Deploy", tail_lines=200, grep=None)


async def test_no_failed_jobs_returns_a_hint(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs/7/jobs").respond(
            json={"jobs": [{"id": 1, "name": "Build", "conclusion": "success", "steps": []}]}
        )
        result = await github.get_run_logs(client, run_id=7, job_name=None, tail_lines=10, grep=None)
    assert result.jobs == []
    assert result.hint is not None and "'Build'" in result.hint


async def test_char_budget_is_shared_across_jobs(client: GitHubClient) -> None:
    jobs = {
        "jobs": [
            {"id": 1, "name": "A", "conclusion": "failure", "steps": []},
            {"id": 2, "name": "B", "conclusion": "failure", "steps": []},
        ]
    }
    with respx.mock(assert_all_called=False) as router:
        router.get(f"{BASE}/actions/runs/7/jobs").respond(json=jobs)
        router.get(f"{BASE}/actions/jobs/1/logs").respond(text="x" * 500)
        second_log = router.get(f"{BASE}/actions/jobs/2/logs")
        result = await github.get_run_logs(
            client, run_id=7, job_name=None, tail_lines=10, grep=None, max_chars=100
        )
    a, b = result.jobs
    # Once the budget is spent, the next job's log isn't even downloaded.
    assert not second_log.called
    assert a.truncated and a.lines
    assert b.truncated and b.lines == []
    assert b.hint is not None and "job_name" in b.hint


@pytest.mark.parametrize(
    ("status", "headers", "expected"),
    [
        (401, {}, "rejected the token"),
        (403, {"x-ratelimit-remaining": "0"}, "rate limit"),
        (403, {}, "Actions: read"),
        (404, {}, "Not found"),
        (410, {}, "expired"),
        (500, {}, "HTTP 500"),
    ],
)
async def test_http_errors_become_readable(
    client: GitHubClient, status: int, headers: dict[str, str], expected: str
) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs").respond(status, headers=headers)
        with pytest.raises(GitHubError, match=expected):
            await github.get_failed_runs(client, branch=None, workflow=None, limit=5)


async def test_network_error_becomes_readable(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs").mock(side_effect=httpx.ConnectError("boom"))
        with pytest.raises(GitHubError, match="Could not reach GitHub"):
            await github.get_failed_runs(client, branch=None, workflow=None, limit=5)
