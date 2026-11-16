from __future__ import annotations

from pathlib import Path


class UnpreparedResourceError(RuntimeError):
    """A selected local execution resource needs explicit preparation."""


def default_nltk_data_root() -> Path:
    return Path.home() / ".cache" / "hypit" / "whisperx" / "nltk_data"


def assert_punkt_tab(root: Path) -> None:
    import nltk

    location = str(root.expanduser().resolve())
    nltk.data.path[:] = [location]
    try:
        nltk.data.find("tokenizers/punkt_tab", paths=[location])
    except LookupError as error:
        raise UnpreparedResourceError(
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


def assert_sentence_data(root: Path, language: str) -> None:
    from whisperx.utils import PUNKT_LANGUAGES
    from nltk.tokenize.punkt import load_punkt_params
    from nltk.data import FileSystemPathPointer
    # Use the same sentence tokenizer selection as the pinned WhisperX version.
    name = PUNKT_LANGUAGES.get(language, "english")
    try:
        assert_punkt_tab(root)
        load_punkt_params(FileSystemPathPointer(str(root / "tokenizers" / "punkt_tab" / name)))
    except (OSError, LookupError, ValueError) as error:
        # NLTK >= 3.10.4 reports an incomplete Punkt model as LookupError.
        raise UnpreparedResourceError(f"NLTK sentence data for {language} ({name}) is unavailable; run hypit-whisperx-prepare") from error
