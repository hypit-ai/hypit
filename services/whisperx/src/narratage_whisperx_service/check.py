from __future__ import annotations

import importlib.metadata as metadata
import json
import sys

from . import PROTOCOL, SERVICE_VERSION
from .config import ServiceConfig
from .resources import PUNKT_TAB_SHA256, assert_punkt_tab


def main() -> None:
    if not ((3, 10) <= sys.version_info[:2] < (3, 14)):
        raise RuntimeError(f"WhisperX service requires Python >=3.10,<3.14; got {sys.version.split()[0]}")
    config = ServiceConfig.from_environment()
    assert_punkt_tab(config.nltk_data_root)
    import numpy  # noqa: F401
    import whisperx

    for name in ("load_model", "load_align_model", "align"):
        if not callable(getattr(whisperx, name, None)):
            raise RuntimeError(f"installed WhisperX is missing required API: {name}")
    versions = {
        name: metadata.version(name)
        for name in ("narratage-whisperx-service", "whisperx", "faster-whisper", "numpy", "torch")
    }
    if versions["whisperx"] != "3.8.6":
        raise RuntimeError(f"expected whisperx 3.8.6, got {versions['whisperx']}")
    print(json.dumps({
        "ok": True,
        "protocol": PROTOCOL,
        "serviceVersion": SERVICE_VERSION,
        "python": sys.version.split()[0],
        "packages": versions,
        "punktTabDigest": PUNKT_TAB_SHA256,
    }, sort_keys=True))
