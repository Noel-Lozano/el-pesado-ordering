"""Pydantic models shared by the MCP adapter and the CLI.

Tool output models live here so the SDK can derive each tool's output schema
from its return annotation. Core functions return these models; the adapter
only wraps them.
"""

from datetime import datetime

from pydantic import BaseModel


class Truncation(BaseModel):
    truncated: bool
    hint: str | None = None


# --- get_failed_runs -------------------------------------------------------


class FailedJob(BaseModel):
    job_id: int
    name: str
    failed_step: str | None


class FailedRun(BaseModel):
    run_id: int
    workflow: str
    branch: str
    short_sha: str
    commit_title: str
    created_at: datetime
    url: str
    failed_jobs: list[FailedJob]


class FailedRuns(BaseModel):
    runs: list[FailedRun]


# --- get_run_logs ----------------------------------------------------------


class JobLog(BaseModel):
    name: str
    failed_step: str | None
    lines: list[str]
    truncated: bool
    hint: str | None = None


class RunLogs(BaseModel):
    run_id: int
    jobs: list[JobLog]
    hint: str | None = None
