from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Mapping, Protocol

from . import PROTOCOL, SERVICE_VERSION
from .audio import AudioInputError, CanonicalAudio, read_canonical_audio
from .config import ServiceConfig
from .engine import InferenceBusyError, InferenceInputError, normalize_language


class AlignmentEngine(Protocol):
    def identity(self) -> dict[str, object]: ...

    def transcribe(self, audio: CanonicalAudio, language: str | None) -> dict[str, object]: ...


@dataclass(frozen=True, slots=True)
class ApplicationResponse:
    status: int
    body: bytes


class RequestError(ValueError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code


def _json_response(status: int, value: object) -> ApplicationResponse:
    return ApplicationResponse(
        status=status,
        body=json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8"),
    )


class WhisperXApplication:
    def __init__(self, config: ServiceConfig, engine: AlignmentEngine):
        self.config = config
        self.engine = engine

    def health(self) -> ApplicationResponse:
        return _json_response(200, {
            "ok": True,
            "protocol": PROTOCOL,
            "serviceVersion": SERVICE_VERSION,
            **self.engine.identity(),
        })

    def transcribe(self, headers: Mapping[str, str], body: bytes) -> ApplicationResponse:
        content_type = headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            raise RequestError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json")
        if len(body) > self.config.max_request_bytes:
            raise RequestError(413, "REQUEST_TOO_LARGE", "request body exceeds the configured limit")
        try:
            request = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RequestError(400, "INVALID_JSON", "request body is not valid UTF-8 JSON") from error
        if not isinstance(request, dict):
            raise RequestError(400, "INVALID_REQUEST", "request body must be an object")
        unknown = set(request) - {"audio_path", "language"}
        if unknown:
            raise RequestError(400, "UNKNOWN_FIELD", f"unknown request field: {sorted(unknown)[0]}")
        audio_path = request.get("audio_path")
        if not isinstance(audio_path, str) or not audio_path:
            raise RequestError(400, "INVALID_AUDIO_PATH", "audio_path must be a non-empty string")
        try:
            language = normalize_language(request.get("language"))
            audio = read_canonical_audio(
                audio_path,
                self.config.input_roots,
                self.config.max_audio_bytes,
            )
        except (AudioInputError, ValueError) as error:
            raise RequestError(400, "INVALID_INPUT", str(error)) from error
        try:
            result = self.engine.transcribe(audio, language)
        except InferenceInputError as error:
            raise RequestError(400, "INVALID_INPUT", str(error)) from error
        except InferenceBusyError as error:
            raise RequestError(503, "BUSY", str(error)) from error
        return _json_response(200, result)

    def error(self, error: RequestError) -> ApplicationResponse:
        return _json_response(error.status, {"error": {"code": error.code, "message": str(error)}})
