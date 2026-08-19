from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
from urllib.request import urlopen
import zipfile


PUNKT_TAB_COMMIT = "550b6625bcef1f2abff2ff770a5a0d272c9c6b2a"
PUNKT_TAB_SHA256 = "e57f64187974277726a3417ca6f181ec5403676c717672eef6a748a7b20e0106"
PUNKT_TAB_URL = (
    "https://raw.githubusercontent.com/nltk/nltk_data/"
    f"{PUNKT_TAB_COMMIT}/packages/tokenizers/punkt_tab.zip"
)
MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
MARKER_NAME = ".hypit-resource.json"


def default_nltk_data_root() -> Path:
    return Path.home() / ".cache" / "hypit" / "whisperx" / "nltk_data"


def _marker(root: Path) -> Path:
    return root / "tokenizers" / "punkt_tab" / MARKER_NAME


def assert_punkt_tab(root: Path) -> None:
    marker = _marker(root)
    try:
        value = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(
            "locked NLTK punkt_tab data is unavailable; run `hypit-whisperx-prepare`"
        ) from error
    if value != {"commit": PUNKT_TAB_COMMIT, "sha256": PUNKT_TAB_SHA256}:
        raise RuntimeError("installed NLTK punkt_tab identity differs from the service lock")
    english = marker.parent / "english"
    for name in ("abbrev_types.txt", "collocations.tab", "ortho_context.tab", "sent_starters.txt"):
        if not (english / name).is_file():
            raise RuntimeError(f"installed NLTK punkt_tab is incomplete: english/{name}")


def _download() -> bytes:
    with urlopen(PUNKT_TAB_URL, timeout=60) as response:  # noqa: S310 - immutable HTTPS URL above
        declared = response.headers.get("Content-Length")
        if declared is not None and int(declared) > MAX_ARCHIVE_BYTES:
            raise RuntimeError("punkt_tab archive exceeds its configured bound")
        payload = response.read(MAX_ARCHIVE_BYTES + 1)
    if len(payload) > MAX_ARCHIVE_BYTES:
        raise RuntimeError("punkt_tab archive exceeds its configured bound")
    return payload


def _extract(payload: bytes, destination: Path) -> None:
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for item in archive.infolist():
            relative = PurePosixPath(item.filename)
            if relative.is_absolute() or ".." in relative.parts or not relative.parts or relative.parts[0] != "punkt_tab":
                raise RuntimeError("punkt_tab archive contains an unsafe path")
            # Unix symlinks are not valid model data.
            if ((item.external_attr >> 16) & 0o170000) == 0o120000:
                raise RuntimeError("punkt_tab archive contains a symbolic link")
            target = destination.joinpath(*relative.parts)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(item))


def prepare_punkt_tab(root: Path, payload: bytes | None = None) -> Path:
    root = root.expanduser().resolve()
    try:
        assert_punkt_tab(root)
        return _marker(root).parent
    except RuntimeError:
        pass
    target = root / "tokenizers" / "punkt_tab"
    if target.exists():
        raise RuntimeError(
            f"refusing to replace unverified NLTK data at {target}; remove or relocate it explicitly"
        )
    archive = _download() if payload is None else payload
    digest = hashlib.sha256(archive).hexdigest()
    if digest != PUNKT_TAB_SHA256:
        raise RuntimeError(f"punkt_tab archive digest mismatch: expected {PUNKT_TAB_SHA256}, got {digest}")

    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="hypit-punkt-tab-", dir=target.parent) as temporary:
        staging = Path(temporary)
        _extract(archive, staging)
        extracted = staging / "punkt_tab"
        (extracted / MARKER_NAME).write_text(
            json.dumps({"commit": PUNKT_TAB_COMMIT, "sha256": PUNKT_TAB_SHA256}, sort_keys=True),
            encoding="utf-8",
        )
        os.replace(extracted, target)
    assert_punkt_tab(root)
    return target
