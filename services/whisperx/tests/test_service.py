from __future__ import annotations

import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import wave


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from svml_whisperx_service import PROTOCOL, SERVICE_VERSION  # noqa: E402
from svml_whisperx_service.application import RequestError, WhisperXApplication  # noqa: E402
from svml_whisperx_service.audio import AudioInputError, CanonicalAudio, read_canonical_audio  # noqa: E402
from svml_whisperx_service.config import ServiceConfig  # noqa: E402
from svml_whisperx_service.engine import InferenceBusyError, normalize_alignment, normalize_language  # noqa: E402
from svml_whisperx_service.resources import assert_punkt_tab  # noqa: E402


def write_wav(path: Path, frames: int = 32_000, rate: int = 16_000, channels: int = 1) -> None:
    with wave.open(str(path), "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(struct.pack("<h", 0) * frames * channels)


class FakeEngine:
    def __init__(self) -> None:
        self.seen: tuple[int, str | None] | None = None

    def identity(self) -> dict[str, object]:
        return {
            "model": "small",
            "device": "cpu",
            "compute": "int8",
            "batchSize": 8,
            "whisperxVersion": "3.8.6",
        }


    def transcribe(self, audio: CanonicalAudio, language: str | None) -> dict[str, object]:
        self.seen = (audio.sample_frames, language)
        return {
            "language": language or "en",
            "segments": [{
                "text": "hello",
                "start": 0.1,
                "end": 0.4,
                "words": [{"text": "hello", "start": 0.1, "end": 0.4}],
            }],
        }


class BusyEngine(FakeEngine):
    def transcribe(self, audio: CanonicalAudio, language: str | None) -> dict[str, object]:
        raise InferenceBusyError("busy")


def config(root: Path, **environment: str) -> ServiceConfig:
    return ServiceConfig.from_environment({
        "SVML_WHISPERX_INPUT_ROOTS": str(root),
        **environment,
    })


class ConfigurationTests(unittest.TestCase):
    def test_defaults_are_part_of_one_explicit_runtime_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            value = config(Path(directory))
        self.assertEqual(value.model, "small")
        self.assertEqual(value.device, "cpu")
        self.assertEqual(value.compute, "int8")
        self.assertEqual(value.batch_size, 8)
        self.assertEqual(value.port, 8765)

    def test_invalid_limits_fail_before_loading_model_weights(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "PORT"):
                config(Path(directory), SVML_WHISPERX_PORT="70000")


class AudioTests(unittest.TestCase):
    def test_only_canonical_evidence_wav_is_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "evidence.wav"
            write_wav(path, frames=16_001)
            value = read_canonical_audio(str(path), (root.resolve(),), 1_000_000)
            self.assertEqual(value.sample_frames, 16_001)
            self.assertEqual(len(value.pcm_s16le), 32_002)

            noncanonical = root / "48k.wav"
            write_wav(noncanonical, rate=48_000)
            with self.assertRaisesRegex(AudioInputError, "16 kHz mono"):
                read_canonical_audio(str(noncanonical), (root.resolve(),), 1_000_000)

    def test_path_capability_is_limited_to_configured_roots(self) -> None:
        with tempfile.TemporaryDirectory() as allowed, tempfile.TemporaryDirectory() as outside:
            path = Path(outside) / "evidence.wav"
            write_wav(path)
            with self.assertRaisesRegex(AudioInputError, "outside"):
                read_canonical_audio(str(path), (Path(allowed).resolve(),), 1_000_000)


class ResourceTests(unittest.TestCase):
    def test_locked_sentence_data_is_required_before_model_start(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "svml-whisperx-prepare"):
                assert_punkt_tab(Path(directory))


class EvidenceTests(unittest.TestCase):
    def test_missing_word_time_stays_missing(self) -> None:
        result = normalize_alignment("en", {
            "segments": [{
                "text": "one two three",
                "start": 0,
                "end": 1,
                "words": [
                    {"word": "one", "start": 0.1, "end": 0.2, "score": 0.9},
                    {"word": "two"},
                    {"word": "three", "start": 0.7},
                ],
            }],
        })
        words = result["segments"][0]["words"]  # type: ignore[index]
        self.assertEqual(words[0], {"text": "one", "start": 0.1, "end": 0.2, "score": 0.9})
        self.assertEqual(words[1], {"text": "two"})
        self.assertEqual(words[2], {"text": "three"})

    def test_language_auto_is_explicitly_normalized(self) -> None:
        self.assertIsNone(normalize_language("auto"))
        self.assertEqual(normalize_language("ZH"), "zh")
        with self.assertRaises(ValueError):
            normalize_language("en;rm -rf")


class ApplicationTests(unittest.TestCase):
    def test_health_is_a_complete_provider_handshake(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            application = WhisperXApplication(config(Path(directory)), FakeEngine())
            response = application.health()
        self.assertEqual(response.status, 200)
        value = json.loads(response.body)
        self.assertEqual(value["protocol"], PROTOCOL)
        self.assertEqual(value["serviceVersion"], SERVICE_VERSION)
        self.assertEqual(value["whisperxVersion"], "3.8.6")
        self.assertEqual(value["batchSize"], 8)

    def test_transcribe_reads_one_canonical_file_without_hidden_conversion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "evidence.wav"
            write_wav(path, frames=32_000)
            engine = FakeEngine()
            application = WhisperXApplication(config(root), engine)
            response = application.transcribe(
                {"content-type": "application/json; charset=utf-8"},
                json.dumps({"audio_path": str(path), "language": "en"}).encode(),
            )
        self.assertEqual(response.status, 200)
        self.assertEqual(engine.seen, (32_000, "en"))

    def test_legacy_transcript_override_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            application = WhisperXApplication(config(Path(directory)), FakeEngine())
            with self.assertRaisesRegex(RequestError, "transcript") as raised:
                application.transcribe(
                    {"content-type": "application/json"},
                    json.dumps({"audio_path": "/tmp/input.wav", "transcript": "rewrite me"}).encode(),
                )
        self.assertEqual(raised.exception.code, "UNKNOWN_FIELD")

    def test_a_second_inference_is_not_hidden_in_a_service_queue(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "evidence.wav"
            write_wav(path)
            application = WhisperXApplication(config(root), BusyEngine())
            with self.assertRaises(RequestError) as raised:
                application.transcribe(
                    {"content-type": "application/json"},
                    json.dumps({"audio_path": str(path)}).encode(),
                )
        self.assertEqual(raised.exception.status, 503)
        self.assertEqual(raised.exception.code, "BUSY")


if __name__ == "__main__":
    unittest.main()
