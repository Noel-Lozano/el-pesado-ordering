"""Finding JUnit reports: local `<workspace>/reports/*.xml`, or a CI artifact zip.

CI artifacts are untrusted. The zip is downloaded with a hard size cap and
unpacked in memory only (nothing is written to disk, so member paths can't
traverse anywhere). Each member is read with a hard byte limit, so a lying
`file_size` header doesn't help a zip bomb.
"""

import io
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from pesado_debug.core.github import GitHubClient, GitHubError

MAX_ARTIFACT_BYTES = 50 * 1024 * 1024
MAX_MEMBER_BYTES = 10 * 1024 * 1024
MAX_MEMBERS = 50
MAX_LOCAL_REPORTS = 50

Workspace = Literal["backend", "frontend"]


class ArtifactError(Exception):
    """A report source was missing, expired, or rejected as unsafe."""


@dataclass(frozen=True)
class RawReport:
    name: str
    data: bytes


# --- Local ---------------------------------------------------------------------


def read_local_reports(repo_root: Path, workspace: Workspace) -> list[RawReport]:
    reports_dir = (repo_root / workspace / "reports").resolve()
    if not reports_dir.is_dir():
        raise ArtifactError(
            f"No {workspace}/reports/ folder. Run the tests with the JUnit reporter first, e.g. "
            f"`npm test -- --reporter=default --reporter=junit --outputFile.junit=reports/junit-unit.xml`."
        )
    reports: list[RawReport] = []
    for path in sorted(reports_dir.glob("*.xml")):
        resolved = path.resolve()
        # A symlink pointing out of reports/ is skipped, not followed.
        if not resolved.is_relative_to(reports_dir) or not resolved.is_file():
            continue
        if resolved.stat().st_size > MAX_MEMBER_BYTES:
            raise ArtifactError(f"{workspace}/reports/{path.name} is over {MAX_MEMBER_BYTES} bytes")
        reports.append(RawReport(name=f"{workspace}/reports/{path.name}", data=resolved.read_bytes()))
        if len(reports) >= MAX_LOCAL_REPORTS:
            break
    if not reports:
        raise ArtifactError(f"{workspace}/reports/ has no .xml files. Run the tests with the JUnit reporter.")
    return reports


# --- Zip -----------------------------------------------------------------------


def extract_xml_members(
    zip_bytes: bytes,
    *,
    label: str,
    max_member_bytes: int = MAX_MEMBER_BYTES,
    max_members: int = MAX_MEMBERS,
) -> list[RawReport]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as exc:
        raise ArtifactError(f"{label} is not a valid zip file") from exc
    with archive:
        members = archive.infolist()
        if len(members) > max_members:
            raise ArtifactError(
                f"{label} has {len(members)} files (limit {max_members}); refusing to read it"
            )
        reports: list[RawReport] = []
        for info in members:
            if info.is_dir() or not info.filename.lower().endswith(".xml"):
                continue
            if info.file_size > max_member_bytes:
                raise ArtifactError(f"{label}: {info.filename} is over {max_member_bytes} bytes")
            try:
                with archive.open(info) as member:
                    data = member.read(max_member_bytes + 1)
            except (RuntimeError, zipfile.BadZipFile, NotImplementedError) as exc:
                raise ArtifactError(f"{label}: cannot read {info.filename} ({exc})") from exc
            if len(data) > max_member_bytes:
                raise ArtifactError(f"{label}: {info.filename} expands past {max_member_bytes} bytes")
            reports.append(RawReport(name=f"{label}/{info.filename}", data=data))
    if not reports:
        raise ArtifactError(f"{label} contains no .xml files")
    return reports


# --- CI artifacts ------------------------------------------------------------


class _Artifact(BaseModel):
    id: int
    name: str
    size_in_bytes: int
    expired: bool


class _ArtifactsPage(BaseModel):
    artifacts: list[_Artifact]


async def download_ci_reports(client: GitHubClient, run_id: int, workspace: Workspace) -> list[RawReport]:
    name = f"junit-{workspace}"
    page = await client.get_model(
        _ArtifactsPage, f"{client.repo_path}/actions/runs/{run_id}/artifacts", {"name": name, "per_page": 10}
    )
    artifact = next((a for a in page.artifacts if a.name == name), None)
    if artifact is None:
        raise ArtifactError(
            f"Run {run_id} has no {name} artifact. The failure was probably before tests ran "
            f"(lint, typecheck, build or setup); use get_run_logs."
        )
    if artifact.expired:
        raise ArtifactError(f"The {name} artifact for run {run_id} has expired; rerun the workflow.")
    if artifact.size_in_bytes > MAX_ARTIFACT_BYTES:
        raise ArtifactError(
            f"The {name} artifact is {artifact.size_in_bytes} bytes (limit {MAX_ARTIFACT_BYTES})."
        )
    try:
        zip_bytes = await client.download(
            f"{client.repo_path}/actions/artifacts/{artifact.id}/zip", max_bytes=MAX_ARTIFACT_BYTES
        )
    except GitHubError as exc:
        if "(410)" in str(exc):
            raise ArtifactError(
                f"The {name} artifact for run {run_id} has expired; rerun the workflow."
            ) from exc
        raise
    return extract_xml_members(zip_bytes, label=name)
