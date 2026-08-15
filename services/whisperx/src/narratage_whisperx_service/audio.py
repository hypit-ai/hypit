from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import wave


SAMPLE_RATE = 16_000


class AudioInputError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class CanonicalAudio:
    path: Path
    sample_frames: int
    pcm_s16le: bytes

    @property
    def duration_sec(self) -> float:
        return self.sample_frames / SAMPLE_RATE


def _inside(path: Path, roots: tuple[Path, ...]) -> bool:
    return any(path == root or path.is_relative_to(root) for root in roots)


def read_canonical_audio(
    raw_path: str,
    roots: tuple[Path, ...],
    max_audio_bytes: int,
) -> CanonicalAudio:
    requested = Path(raw_path).expanduser()
    if not requested.is_absolute():
        raise AudioInputError("audio_path must be absolute")
    try:
        path = requested.resolve(strict=True)
    except OSError as error:
        raise AudioInputError("audio_path does not identify a readable file") from error
    if not _inside(path, roots):
        raise AudioInputError("audio_path is outside NARRATAGE_WHISPERX_INPUT_ROOTS")
    if not path.is_file():
        raise AudioInputError("audio_path must identify a regular file")
    if path.stat().st_size > max_audio_bytes:
        raise AudioInputError("audio input exceeds NARRATAGE_WHISPERX_MAX_AUDIO_BYTES")

    try:
        with wave.open(str(path), "rb") as source:
            channels = source.getnchannels()
            sample_width = source.getsampwidth()
            sample_rate = source.getframerate()
            sample_frames = source.getnframes()
            compression = source.getcomptype()
            payload = source.readframes(sample_frames + 1)
    except (OSError, EOFError, wave.Error) as error:
        raise AudioInputError("audio input is not a valid WAV file") from error

    if compression != "NONE" or channels != 1 or sample_width != 2 or sample_rate != SAMPLE_RATE:
        raise AudioInputError("audio input must be 16 kHz mono PCM s16 WAV")
    if sample_frames <= 0:
        raise AudioInputError("audio input must contain at least one sample frame")
    if len(payload) != sample_frames * 2:
        raise AudioInputError("WAV data length differs from its declared sample count")
    return CanonicalAudio(path=path, sample_frames=sample_frames, pcm_s16le=payload)
