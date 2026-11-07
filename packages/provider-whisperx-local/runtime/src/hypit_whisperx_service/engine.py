from __future__ import annotations

import importlib.metadata as metadata
import logging
import math
import os
import threading
import time
from typing import Any, Mapping

from .audio import CanonicalAudio
from .config import ServiceConfig
from .resources import assert_punkt_tab, assert_sentence_data
from .models import asr_path, alignment_path, alignment_selection, hf_cache, torch_cache, use_local_resources_only

logger = logging.getLogger("hypit.whisperx")


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
            word: dict[str, object] = {"text": text}
            # Missing or partial acoustic evidence stays missing. Never manufacture a tick.
            if start is not None and end is not None and 0 <= start <= end:
                word.update(start=start, end=end)
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
        use_local_resources_only()
        assert_punkt_tab(config.nltk_data_root)
        os.environ["NLTK_DATA"] = str(config.nltk_data_root)
        try:
            import numpy as numpy_module
            import whisperx as whisperx_module
        except ImportError as error:
            raise RuntimeError(
                "WhisperX runtime is unavailable; prepare the selected local WhisperX Provider"
            ) from error
        self._numpy = numpy_module
        self._whisperx = whisperx_module
        import nltk
        if str(config.nltk_data_root) not in nltk.data.path:
            nltk.data.path.insert(0, str(config.nltk_data_root))
        self._config = config
        self._inference_lock = threading.Lock()
        self._alignment_models: dict[str, tuple[object, object]] = {}
        started = time.monotonic()
        logger.info("loading prepared ASR model=%s", config.model)
        self._asr = whisperx_module.load_model(
            asr_path(config),
            config.device,
            compute_type=config.compute,
            local_files_only=True,
        )
        logger.info("ASR model ready in %.1fs", time.monotonic() - started)
        self._whisperx_version = metadata.version("whisperx")

    def identity(self) -> dict[str, object]:
        return {
            "model": self._config.model,
            "device": self._config.device,
            "compute": self._config.compute,
            "batchSize": self._config.batch_size,
            "whisperxVersion": self._whisperx_version,
        }

    def _alignment_model(self, language: str) -> tuple[object, object]:
        model = self._alignment_models.get(language)
        if model is None:
            started = time.monotonic()
            logger.info("loading prepared alignment model for language=%s", language)
            try:
                kind, selected = alignment_path(self._config, language)
            except ValueError as error:
                raise InferenceInputError(str(error)) from error
            assert_sentence_data(self._config.nltk_data_root, language)
            loaded = self._whisperx.load_align_model(
                language_code=language,
                device=self._config.device,
                model_name=selected,
                model_dir=str(torch_cache(self._config)) if kind == "torchaudio" else hf_cache(self._config),
                model_cache_only=True,
            )
            if not isinstance(loaded, tuple) or len(loaded) != 2:
                raise RuntimeError("WhisperX returned an invalid alignment model")
            model = loaded
            self._alignment_models[language] = model
            logger.info("alignment model ready for language=%s in %.1fs", language, time.monotonic() - started)
        return model

    def transcribe(self, audio: CanonicalAudio, language: str | None) -> dict[str, object]:
        if self._config.model.endswith(".en") and language not in {None, "en"}:
            raise InferenceInputError(
                f"model {self._config.model!r} is English-only and cannot transcribe {language!r}"
            )
        if language is not None:
            try:
                alignment_selection(language)
            except ValueError as error:
                raise InferenceInputError(str(error)) from error
        samples = self._numpy.frombuffer(audio.pcm_s16le, dtype="<i2").astype(self._numpy.float32)
        samples /= 32768.0
        samples = self._numpy.ascontiguousarray(samples)
        if not self._inference_lock.acquire(blocking=False):
            raise InferenceBusyError("the warm WhisperX model is already executing one request")
        try:
            started = time.monotonic()
            logger.info("transcribing %.2fs of audio, language=%s", audio.duration_sec, language or "auto")
            transcription = self._asr.transcribe(
                samples,
                batch_size=self._config.batch_size,
                language=language,
            )
            logger.info("transcription completed in %.1fs", time.monotonic() - started)
            detected = transcription.get("language") or language
            if not isinstance(detected, str) or not detected.strip():
                raise RuntimeError("WhisperX did not return a valid language")
            segments = transcription.get("segments", [])
            if not isinstance(segments, list):
                raise RuntimeError("WhisperX transcription returned invalid segments")
            if not segments:
                logger.info("no speech segments; alignment is unnecessary")
                return {"language": detected, "segments": []}
            alignment_model, metadata_value = self._alignment_model(detected)
            started = time.monotonic()
            logger.info("aligning %d speech segments, language=%s", len(segments), detected)
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
            result = normalize_alignment(detected, aligned)
            logger.info("word timing ready in %.1fs", time.monotonic() - started)
            return result
        finally:
            self._inference_lock.release()
