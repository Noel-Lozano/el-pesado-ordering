"""Pydantic models shared by the MCP adapter and the CLI.

Tool output models live here so the SDK can derive each tool's output schema
from its return annotation. Core functions return these models; the adapter
only wraps them.
"""

from datetime import datetime
from typing import ClassVar

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


# --- get_failing_tests -----------------------------------------------------


class TestFailure(BaseModel):
    __test__: ClassVar[bool] = False  # not a pytest test class

    file: str | None
    suite: str
    name: str
    message: str
    stack: list[str]
    duration_ms: int | None


class FailingTests(BaseModel):
    __test__: ClassVar[bool] = False

    reports: list[str]
    total: int
    failed: int
    skipped: int
    errors: int
    failures: list[TestFailure]
    truncated: bool
    hint: str | None = None


# --- reset_test_db / seed_test_data -----------------------------------------


class ResetResult(BaseModel):
    database: str  # "host:port/dbname", never credentials
    tables_truncated: list[str]
    rows_inserted: dict[str, int]


class SeedResult(BaseModel):
    scenario: str
    at: datetime
    database: str
    reset: bool
    ids: dict[str, list[int]]  # rows created by this call, by table
    notes: list[str]
