from __future__ import annotations

import importlib.metadata as metadata
import math
import os
import threading
from typing import Any, Mapping

from .audio import CanonicalAudio
from .config import ServiceConfig
from .resources import PUNKT_TAB_SHA256, assert_punkt_tab


class InferenceInputError(ValueError):
    pass


class InferenceBusyError(RuntimeError):
    pass


def normalize_language(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("language must be a string")
    language = value.strip().lower()
    if not language or language in {"auto", "detect", "und", "unknown"}:
        return None
    if len(language) > 32 or not all(character.isalnum() or character in {"-", "_"} for character in language):
        raise ValueError("language is invalid")
    return language


def _finite(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def normalize_alignment(language: str, raw: Mapping[str, Any]) -> dict[str, object]:
    raw_segments = raw.get("segments", [])
    if not isinstance(raw_segments, list):
        raise RuntimeError("WhisperX alignment returned a non-array segments value")
    segments: list[dict[str, object]] = []
    for raw_segment in raw_segments:
        if not isinstance(raw_segment, Mapping):
            raise RuntimeError("WhisperX alignment returned an invalid segment")
        raw_words = raw_segment.get("words", [])
        if not isinstance(raw_words, list):
            raise RuntimeError("WhisperX alignment returned a non-array words value")
        words: list[dict[str, object]] = []
        for raw_word in raw_words:
            if not isinstance(raw_word, Mapping):
                raise RuntimeError("WhisperX alignment returned an invalid word")
            value = raw_word.get("word", raw_word.get("text", ""))
            text = value.strip() if isinstance(value, str) else ""
            if not text:
                continue
            start = _finite(raw_word.get("start"))
            end = _finite(raw_word.get("end"))
            score = _finite(raw_word.get("score"))
            word: dict[str, object] = {"text": text}
            # Missing or partial acoustic evidence stays missing. Never manufacture a tick.
            if start is not None and end is not None and 0 <= start <= end:
                word.update(start=start, end=end)
            if score is not None and 0 <= score <= 1:
                word["score"] = score
            words.append(word)
        if not words:
            continue
        segment_text = raw_segment.get("text")
        segment: dict[str, object] = {
            "text": segment_text.strip() if isinstance(segment_text, str) else " ".join(
                str(word["text"]) for word in words
            ),
            "words": words,
        }
        start = _finite(raw_segment.get("start"))
        end = _finite(raw_segment.get("end"))
        if start is not None and end is not None and 0 <= start <= end:
            segment.update(start=start, end=end)
        segments.append(segment)
    return {"language": language, "segments": segments}


class WhisperXEngine:
    def __init__(self, config: ServiceConfig):
        assert_punkt_tab(config.nltk_data_root)
        os.environ["NLTK_DATA"] = str(config.nltk_data_root)
        try:
            import numpy as numpy_module
            import whisperx as whisperx_module
        except ImportError as error:
            raise RuntimeError(
                "WhisperX runtime is unavailable; run `uv sync --project services/whisperx --frozen`"
            ) from error
        self._numpy = numpy_module
        self._whisperx = whisperx_module
        import nltk
        if str(config.nltk_data_root) not in nltk.data.path:
            nltk.data.path.insert(0, str(config.nltk_data_root))
        self._config = config
        self._inference_lock = threading.Lock()
        self._alignment_models: dict[str, tuple[object, object]] = {}
        self._asr = whisperx_module.load_model(
            config.model,
            config.device,
            compute_type=config.compute,
        )
        self._whisperx_version = metadata.version("whisperx")

    def identity(self) -> dict[str, object]:
        return {
            "model": self._config.model,
            "device": self._config.device,
            "compute": self._config.compute,
            "batchSize": self._config.batch_size,
            "whisperxVersion": self._whisperx_version,
            "punktTabDigest": PUNKT_TAB_SHA256,
        }

    def _alignment_model(self, language: str) -> tuple[object, object]:
        model = self._alignment_models.get(language)
        if model is None:
            loaded = self._whisperx.load_align_model(
                language_code=language,
                device=self._config.device,
            )
            if not isinstance(loaded, tuple) or len(loaded) != 2:
                raise RuntimeError("WhisperX returned an invalid alignment model")
            model = loaded
            self._alignment_models[language] = model
        return model

    def transcribe(self, audio: CanonicalAudio, language: str | None) -> dict[str, object]:
        if self._config.model.endswith(".en") and language not in {None, "en"}:
            raise InferenceInputError(
                f"model {self._config.model!r} is English-only and cannot transcribe {language!r}"
            )
        samples = self._numpy.frombuffer(audio.pcm_s16le, dtype="<i2").astype(self._numpy.float32)
        samples /= 32768.0
        samples = self._numpy.ascontiguousarray(samples)
        if not self._inference_lock.acquire(blocking=False):
            raise InferenceBusyError("the warm WhisperX model is already executing one request")
        try:
            transcription = self._asr.transcribe(
                samples,
                batch_size=self._config.batch_size,
                language=language,
            )
            detected = transcription.get("language") or language or "en"
            if not isinstance(detected, str) or not detected.strip():
                raise RuntimeError("WhisperX did not return a valid language")
            segments = transcription.get("segments", [])
            if not isinstance(segments, list):
                raise RuntimeError("WhisperX transcription returned invalid segments")
            if not segments:
                return {"language": detected, "segments": []}
            alignment_model, metadata_value = self._alignment_model(detected)
            aligned = self._whisperx.align(
                segments,
                alignment_model,
                metadata_value,
                samples,
                self._config.device,
                return_char_alignments=False,
            )
            if not isinstance(aligned, Mapping):
                raise RuntimeError("WhisperX returned an invalid alignment result")
            return normalize_alignment(detected, aligned)
        finally:
            self._inference_lock.release()
