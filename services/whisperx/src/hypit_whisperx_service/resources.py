from __future__ import annotations

from pathlib import Path


def default_nltk_data_root() -> Path:
    return Path.home() / ".cache" / "hypit" / "whisperx" / "nltk_data"


def assert_punkt_tab(root: Path) -> None:
    import nltk

    location = str(root.expanduser().resolve())
    if location not in nltk.data.path:
        nltk.data.path.insert(0, location)
    try:
        nltk.data.find("tokenizers/punkt_tab", paths=[location])
    except LookupError as error:
        raise RuntimeError(
            "NLTK punkt_tab data is unavailable; run `hypit-whisperx-prepare`"
        ) from error


def prepare_punkt_tab(root: Path) -> Path:
    import nltk

    root = root.expanduser().resolve()
    target = root / "tokenizers" / "punkt_tab"
    # Already installed is already done. `nltk.download` fetches its index before it looks at what is
    # on disk, so preparing an installation that needs nothing still needed the network, and a machine
    # without it failed at the step whose whole job is to make the machine ready offline.
    try:
        assert_punkt_tab(root)
        return target
    except RuntimeError:
        pass
    root.mkdir(parents=True, exist_ok=True)
    if not nltk.download("punkt_tab", download_dir=str(root), quiet=False, raise_on_error=True):
        raise RuntimeError("NLTK could not install punkt_tab")
    assert_punkt_tab(root)
    return target
