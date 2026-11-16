import io
import os
import zipfile
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import respx

from pesado_debug.core import artifacts
from pesado_debug.core.artifacts import ArtifactError
from pesado_debug.core.github import GitHubClient

BASE = "https://api.github.com/repos/o/r"


def _zip(members: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return buffer.getvalue()


def test_extracts_only_xml_members() -> None:
    data = _zip({"junit-unit.xml": b"<a/>", "notes.txt": b"x", "sub/junit-integration.xml": b"<b/>"})
    reports = artifacts.extract_xml_members(data, label="junit-backend")
    assert [r.name for r in reports] == [
        "junit-backend/junit-unit.xml",
        "junit-backend/sub/junit-integration.xml",
    ]


def test_member_over_limit_is_rejected() -> None:
    data = _zip({"big.xml": b"x" * 2_000})
    with pytest.raises(ArtifactError, match="over 1000 bytes"):
        artifacts.extract_xml_members(data, label="a", max_member_bytes=1_000)


def test_lying_file_size_is_still_capped_on_read() -> None:
    data = bytearray(_zip({"bomb.xml": b"x" * 5_000}))
    # Rewrite the uncompressed size in the central directory to claim 10 bytes.
    central = data.rfind(b"PK\x01\x02")
    data[central + 24 : central + 28] = (10).to_bytes(4, "little")
    with pytest.raises(ArtifactError, match=r"bomb\.xml"):
        artifacts.extract_xml_members(bytes(data), label="a", max_member_bytes=1_000)


def test_too_many_members_is_rejected() -> None:
    data = _zip({f"r{i}.xml": b"<a/>" for i in range(6)})
    with pytest.raises(ArtifactError, match="6 files"):
        artifacts.extract_xml_members(data, label="a", max_members=5)


def test_not_a_zip() -> None:
    with pytest.raises(ArtifactError, match="not a valid zip"):
        artifacts.extract_xml_members(b"nope", label="a")


def test_zip_without_xml() -> None:
    with pytest.raises(ArtifactError, match=r"no \.xml"):
        artifacts.extract_xml_members(_zip({"a.txt": b"x"}), label="a")


# --- Local reports -------------------------------------------------------------


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "backend" / "reports").mkdir(parents=True)
    (tmp_path / "frontend").mkdir()
    return tmp_path


def test_local_reports_are_read(repo: Path) -> None:
    (repo / "backend" / "reports" / "junit-unit.xml").write_bytes(b"<a/>")
    (repo / "backend" / "reports" / "junit-integration.xml").write_bytes(b"<b/>")
    (repo / "backend" / "reports" / "other.json").write_bytes(b"{}")
    names = [r.name for r in artifacts.read_local_reports(repo, "backend")]
    assert names == ["backend/reports/junit-integration.xml", "backend/reports/junit-unit.xml"]


def test_missing_reports_folder_explains_how_to_make_one(repo: Path) -> None:
    with pytest.raises(ArtifactError, match="--reporter=junit"):
        artifacts.read_local_reports(repo, "frontend")


def test_symlink_out_of_reports_is_skipped(repo: Path, tmp_path_factory: pytest.TempPathFactory) -> None:
    outside = tmp_path_factory.mktemp("outside") / "secret.xml"
    outside.write_bytes(b"<secret/>")
    link = repo / "backend" / "reports" / "link.xml"
    try:
        os.symlink(outside, link)
    except OSError:
        pytest.skip("symlinks need extra privileges on this OS")
    (repo / "backend" / "reports" / "real.xml").write_bytes(b"<a/>")
    assert [r.name for r in artifacts.read_local_reports(repo, "backend")] == ["backend/reports/real.xml"]


# --- CI artifacts ------------------------------------------------------------


@pytest.fixture
async def client() -> AsyncIterator[GitHubClient]:
    async with GitHubClient("ghp_test", "o", "r") as gh:
        yield gh


def _listing(**overrides: object) -> dict[str, object]:
    artifact = {"id": 77, "name": "junit-backend", "size_in_bytes": 1234, "expired": False, **overrides}
    return {"total_count": 1, "artifacts": [artifact]}


async def test_downloads_and_unzips_the_artifact(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs/5/artifacts").respond(json=_listing())
        router.get(f"{BASE}/actions/artifacts/77/zip").respond(
            302, headers={"Location": "https://blob.example.net/a.zip"}
        )
        blob = router.get("https://blob.example.net/a.zip").respond(content=_zip({"junit-unit.xml": b"<a/>"}))
        reports = await artifacts.download_ci_reports(client, 5, "backend")
    assert [r.name for r in reports] == ["junit-backend/junit-unit.xml"]
    assert "authorization" not in blob.calls[0].request.headers


async def test_missing_artifact_points_to_logs(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs/5/artifacts").respond(json={"total_count": 0, "artifacts": []})
        with pytest.raises(ArtifactError, match=r"before tests ran.*get_run_logs"):
            await artifacts.download_ci_reports(client, 5, "backend")


async def test_expired_artifact(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs/5/artifacts").respond(json=_listing(expired=True))
        with pytest.raises(ArtifactError, match="expired; rerun the workflow"):
            await artifacts.download_ci_reports(client, 5, "backend")


async def test_gone_download_reads_as_expired(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs/5/artifacts").respond(json=_listing())
        router.get(f"{BASE}/actions/artifacts/77/zip").respond(410)
        with pytest.raises(ArtifactError, match="expired"):
            await artifacts.download_ci_reports(client, 5, "backend")


async def test_oversized_artifact_is_refused_before_download(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/actions/runs/5/artifacts").respond(
            json=_listing(size_in_bytes=artifacts.MAX_ARTIFACT_BYTES + 1)
        )
        with pytest.raises(ArtifactError, match="limit"):
            await artifacts.download_ci_reports(client, 5, "backend")


async def test_download_stops_past_the_byte_limit(client: GitHubClient) -> None:
    with respx.mock() as router:
        router.get(f"{BASE}/big").respond(content=b"x" * 5_000)
        with pytest.raises(Exception, match="limit; aborted"):
            await client.download(f"{BASE}/big", max_bytes=1_000)
