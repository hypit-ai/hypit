from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import logging
import threading

from .application import RequestError, WhisperXApplication


LOGGER = logging.getLogger("hypit.whisperx")


class WhisperXHttpServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], application: WhisperXApplication):
        super().__init__(address, WhisperXRequestHandler)
        self.application = application


class WhisperXRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "hypit-whisperx"
    sys_version = ""

    @property
    def application(self) -> WhisperXApplication:
        server = self.server
        if not isinstance(server, WhisperXHttpServer):
            raise RuntimeError("invalid WhisperX server")
        return server.application

    def _send(self, status: int, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self._send(404, b'{"error":{"code":"NOT_FOUND","message":"not found"}}')
            return
        response = self.application.health()
        self._send(response.status, response.body)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/transcribe":
            self._send(404, b'{"error":{"code":"NOT_FOUND","message":"not found"}}')
            return
        try:
            raw_length = self.headers.get("Content-Length")
            if raw_length is None:
                raise RequestError(411, "LENGTH_REQUIRED", "Content-Length is required")
            try:
                length = int(raw_length)
            except ValueError as error:
                raise RequestError(400, "INVALID_LENGTH", "Content-Length is invalid") from error
            if length < 0:
                raise RequestError(400, "INVALID_LENGTH", "Content-Length is invalid")
            if length > self.application.config.max_request_bytes:
                raise RequestError(413, "REQUEST_TOO_LARGE", "request body exceeds the configured limit")
            body = self.rfile.read(length)
            if len(body) != length:
                raise RequestError(400, "TRUNCATED_REQUEST", "request body is truncated")
            response = self.application.transcribe(
                {key.lower(): value for key, value in self.headers.items()},
                body,
            )
        except RequestError as error:
            response = self.application.error(error)
        except Exception:  # noqa: BLE001
            LOGGER.exception("WhisperX inference failed")
            response = self.application.error(RequestError(
                500,
                "INFERENCE_FAILED",
                "WhisperX inference failed",
            ))
        self._send(response.status, response.body)

    def log_message(self, format_value: str, *args: object) -> None:
        LOGGER.info("%s - %s", self.client_address[0], format_value % args)


def serve(application: WhisperXApplication) -> None:
    server = WhisperXHttpServer(("127.0.0.1", application.config.port), application)
    LOGGER.info("ready on http://127.0.0.1:%d", application.config.port)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        LOGGER.info("shutdown requested")
    finally:
        server.shutdown()
        server.server_close()


def stop_in_background(server: WhisperXHttpServer) -> None:
    threading.Thread(target=server.shutdown, daemon=True).start()
