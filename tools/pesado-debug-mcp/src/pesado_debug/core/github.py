"""GitHub REST access for the read-only tools.

Owner and repo come from config, never from tool arguments, so the agent can't
point these calls at another repository. Every HTTP failure becomes a
GitHubError with a message an agent can act on.
"""

import asyncio
import logging
from collections.abc import Mapping
from datetime import datetime
from pathlib import PurePosixPath
from types import TracebackType
from typing import Self

import httpx
from pydantic import BaseModel, ValidationError

from pesado_debug.core import logs
from pesado_debug.models import FailedJob, FailedRun, FailedRuns, JobLog, RunLogs

logger = logging.getLogger(__name__)

API_BASE = "https://api.github.com"
API_VERSION = "2022-11-28"
REQUEST_TIMEOUT_S = 30.0
MAX_CONCURRENT_REQUESTS = 4
MAX_FAILED_RUNS = 20
FAILED_CONCLUSIONS = frozenset({"failure", "timed_out"})


class GitHubError(Exception):
    """A GitHub call failed; the message says what to do about it."""


# --- Response shapes (only the fields we use) ------------------------------


class _Step(BaseModel):
    name: str
    conclusion: str | None = None


class _Job(BaseModel):
    id: int
    name: str
    conclusion: str | None = None
    steps: list[_Step] = []


class _JobsPage(BaseModel):
    jobs: list[_Job]


class _HeadCommit(BaseModel):
    message: str


class _Run(BaseModel):
    id: int
    name: str | None = None
    head_branch: str | None = None
    head_sha: str
    head_commit: _HeadCommit | None = None
    display_title: str | None = None
    created_at: datetime
    html_url: str


class _RunsPage(BaseModel):
    workflow_runs: list[_Run]


class _Workflow(BaseModel):
    id: int
    name: str
    path: str


class _WorkflowsPage(BaseModel):
    workflows: list[_Workflow]


# --- Client ----------------------------------------------------------------


class GitHubClient:
    def __init__(self, token: str, owner: str, repo: str, *, base_url: str = API_BASE) -> None:
        self.owner = owner
        self.repo = repo
        # follow_redirects: logs and artifacts answer with a 302 to blob storage.
        # httpx drops the Authorization header when a redirect changes origin,
        # so the token is never sent to the blob host.
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": API_VERSION,
                "User-Agent": "pesado-debug",
            },
            follow_redirects=True,
            timeout=REQUEST_TIMEOUT_S,
        )

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None:
        await self._http.aclose()

    @property
    def repo_path(self) -> str:
        return f"/repos/{self.owner}/{self.repo}"

    async def get(self, path: str, params: Mapping[str, str | int] | None = None) -> httpx.Response:
        try:
            response = await self._http.get(path, params=params)
        except httpx.HTTPError as exc:
            raise GitHubError(f"Could not reach GitHub ({type(exc).__name__}): {exc}") from exc
        if response.status_code >= 400:
            raise GitHubError(_http_error_message(response, path))
        return response

    async def get_model[M: BaseModel](
        self, model: type[M], path: str, params: Mapping[str, str | int] | None = None
    ) -> M:
        response = await self.get(path, params)
        try:
            return model.model_validate(response.json())
        except (ValueError, ValidationError) as exc:
            raise GitHubError(f"Unexpected response from GitHub for {path}: {exc}") from exc


def _http_error_message(response: httpx.Response, path: str) -> str:
    status = response.status_code
    if status == 401:
        return "GitHub rejected the token (401). Check GITHUB_TOKEN."
    if status == 403:
        if response.headers.get("x-ratelimit-remaining") == "0":
            return "GitHub API rate limit reached (403). Try again later."
        return (
            "GitHub refused the request (403). The token needs Actions: read and Contents: read on this repo."
        )
    if status == 404:
        return (
            f"Not found on GitHub (404): {path}. "
            "Check the run or job ID, or that the token can see this repo."
        )
    if status == 410:
        return f"Gone (410): {path}. The logs or artifacts have expired; rerun the workflow."
    return f"GitHub returned HTTP {status} for {path}."


# --- get_failed_runs -------------------------------------------------------


async def resolve_workflow(client: GitHubClient, workflow: str) -> str:
    """The `workflow_id` path segment: a numeric ID or file name as-is, else look up a display name."""
    if workflow.isdigit() or workflow.endswith((".yml", ".yaml")):
        return workflow
    page = await client.get_model(_WorkflowsPage, f"{client.repo_path}/actions/workflows", {"per_page": 100})
    exact = [w for w in page.workflows if w.name == workflow]
    loose = [w for w in page.workflows if w.name.casefold() == workflow.casefold()]
    if exact or loose:
        return str((exact or loose)[0].id)
    known = ", ".join(f"{w.name} ({PurePosixPath(w.path).name})" for w in page.workflows) or "none"
    raise GitHubError(f"No workflow named {workflow!r}. Workflows in this repo: {known}.")


async def list_jobs(client: GitHubClient, run_id: int) -> list[_Job]:
    page = await client.get_model(
        _JobsPage, f"{client.repo_path}/actions/runs/{run_id}/jobs", {"filter": "latest", "per_page": 100}
    )
    return page.jobs


def _failed_step(job: _Job) -> str | None:
    return next((step.name for step in job.steps if step.conclusion == "failure"), None)


def _failed_jobs(jobs: list[_Job]) -> list[_Job]:
    return [job for job in jobs if job.conclusion in FAILED_CONCLUSIONS]


async def get_failed_runs(
    client: GitHubClient, *, branch: str | None, workflow: str | None, limit: int
) -> FailedRuns:
    limit = max(1, min(limit, MAX_FAILED_RUNS))
    params: dict[str, str | int] = {"status": "failure", "per_page": limit}
    if branch:
        params["branch"] = branch
    if workflow:
        workflow_id = await resolve_workflow(client, workflow)
        path = f"{client.repo_path}/actions/workflows/{workflow_id}/runs"
    else:
        path = f"{client.repo_path}/actions/runs"
    page = await client.get_model(_RunsPage, path, params)
    runs = page.workflow_runs[:limit]

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

    async def jobs_for(run: _Run) -> list[_Job]:
        async with semaphore:
            return await list_jobs(client, run.id)

    all_jobs = await asyncio.gather(*(jobs_for(run) for run in runs))
    return FailedRuns(
        runs=[
            FailedRun(
                run_id=run.id,
                workflow=run.name or "",
                branch=run.head_branch or "",
                short_sha=run.head_sha[:7],
                commit_title=_commit_title(run),
                created_at=run.created_at,
                url=run.html_url,
                failed_jobs=[
                    FailedJob(job_id=job.id, name=job.name, failed_step=_failed_step(job))
                    for job in _failed_jobs(jobs)
                ],
            )
            for run, jobs in zip(runs, all_jobs, strict=True)
        ]
    )


def _commit_title(run: _Run) -> str:
    message = run.head_commit.message if run.head_commit else (run.display_title or "")
    return message.splitlines()[0] if message else ""


# --- get_run_logs ----------------------------------------------------------


async def get_job_log_text(client: GitHubClient, job_id: int) -> str:
    response = await client.get(f"{client.repo_path}/actions/jobs/{job_id}/logs")
    return response.text


async def get_run_logs(
    client: GitHubClient,
    *,
    run_id: int,
    job_name: str | None,
    tail_lines: int,
    grep: str | None,
    max_chars: int = logs.MAX_LOG_CHARS,
) -> RunLogs:
    tail_lines = max(1, min(tail_lines, logs.MAX_TAIL_LINES))
    jobs = await list_jobs(client, run_id)
    if job_name is not None:
        selected = [job for job in jobs if job.name == job_name] or [
            job for job in jobs if job.name.casefold() == job_name.casefold()
        ]
        if not selected:
            names = ", ".join(repr(job.name) for job in jobs) or "none"
            raise GitHubError(f"Run {run_id} has no job named {job_name!r}. Jobs: {names}.")
    else:
        selected = _failed_jobs(jobs)
        if not selected:
            names = ", ".join(repr(job.name) for job in jobs) or "none"
            return RunLogs(
                run_id=run_id,
                jobs=[],
                hint=f"No failed jobs in run {run_id}. Pass job_name to read one of: {names}.",
            )

    budget = max_chars
    job_logs: list[JobLog] = []
    for job in selected:
        if budget <= 0:
            job_logs.append(
                JobLog(
                    name=job.name,
                    failed_step=_failed_step(job),
                    lines=[],
                    truncated=True,
                    hint="Character budget used up by earlier jobs; pass job_name to read this one.",
                )
            )
            continue
        text = await get_job_log_text(client, job.id)
        extract = logs.extract(text, tail_lines=tail_lines, grep=grep, max_chars=budget)
        budget -= sum(len(line) + 1 for line in extract.lines)
        job_logs.append(
            JobLog(
                name=job.name,
                failed_step=_failed_step(job),
                lines=extract.lines,
                truncated=extract.truncated,
                hint=extract.hint,
            )
        )
    return RunLogs(run_id=run_id, jobs=job_logs)


def summarize_runs(result: FailedRuns) -> str:
    if not result.runs:
        return "No failed runs found."
    lines = [f"{len(result.runs)} failed run(s):"]
    for run in result.runs:
        jobs = ", ".join(
            f"{job.name} @ {job.failed_step}" if job.failed_step else job.name for job in run.failed_jobs
        )
        lines.append(
            f"- {run.run_id} {run.workflow} on {run.branch} ({run.short_sha}): {jobs or 'no job info'}"
        )
    return "\n".join(lines)


def summarize_logs(result: RunLogs) -> str:
    if not result.jobs:
        return result.hint or f"No logs for run {result.run_id}."
    parts = []
    for job in result.jobs:
        note = " (truncated)" if job.truncated else ""
        parts.append(f"{job.name}: {len(job.lines)} lines{note}")
    return f"Run {result.run_id} logs: " + "; ".join(parts)
