from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import tempfile
from typing import Mapping

from .resources import default_nltk_data_root


def _positive_integer(value: str, name: str, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if parsed <= 0 or (maximum is not None and parsed > maximum):
        suffix = f" no greater than {maximum}" if maximum is not None else ""
        raise ValueError(f"{name} must be positive{suffix}")
    return parsed


@dataclass(frozen=True, slots=True)
class ServiceConfig:
    port: int
    model: str
    device: str
    compute: str
    batch_size: int
    input_roots: tuple[Path, ...]
    nltk_data_root: Path
    max_request_bytes: int
    max_audio_bytes: int

    @classmethod
    def from_environment(cls, environment: Mapping[str, str] | None = None) -> "ServiceConfig":
        env = os.environ if environment is None else environment
        device = env.get("NARRATAGE_WHISPERX_DEVICE", "cpu").strip()
        model = env.get("NARRATAGE_WHISPERX_MODEL", "small").strip()
        compute = env.get(
            "NARRATAGE_WHISPERX_COMPUTE",
            "int8" if device == "cpu" else "float16",
        ).strip()
        if not model:
            raise ValueError("NARRATAGE_WHISPERX_MODEL must not be empty")
        if not device:
            raise ValueError("NARRATAGE_WHISPERX_DEVICE must not be empty")
        if not compute:
            raise ValueError("NARRATAGE_WHISPERX_COMPUTE must not be empty")

        raw_roots = env.get("NARRATAGE_WHISPERX_INPUT_ROOTS", tempfile.gettempdir())
        roots = tuple(
            Path(item).expanduser().resolve()
            for item in raw_roots.split(os.pathsep)
            if item.strip()
        )
        if not roots:
            raise ValueError("NARRATAGE_WHISPERX_INPUT_ROOTS must contain at least one path")

        return cls(
            port=_positive_integer(env.get("NARRATAGE_WHISPERX_PORT", "8765"), "NARRATAGE_WHISPERX_PORT", 65535),
            model=model,
            device=device,
            compute=compute,
            batch_size=_positive_integer(
                env.get("NARRATAGE_WHISPERX_BATCH_SIZE", "8"),
                "NARRATAGE_WHISPERX_BATCH_SIZE",
            ),
            input_roots=roots,
            nltk_data_root=Path(
                env.get("NARRATAGE_WHISPERX_NLTK_DATA", str(default_nltk_data_root()))
            ).expanduser().resolve(),
            max_request_bytes=_positive_integer(
                env.get("NARRATAGE_WHISPERX_MAX_REQUEST_BYTES", str(64 * 1024)),
                "NARRATAGE_WHISPERX_MAX_REQUEST_BYTES",
            ),
            max_audio_bytes=_positive_integer(
                env.get("NARRATAGE_WHISPERX_MAX_AUDIO_BYTES", str(512 * 1024 * 1024)),
                "NARRATAGE_WHISPERX_MAX_AUDIO_BYTES",
            ),
        )
