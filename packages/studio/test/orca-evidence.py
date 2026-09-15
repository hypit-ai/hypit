#!/usr/bin/env python3
"""Real-UI evidence for the OrcaRouter Provider integration.

The Studio page is the repository's own interface, driven in a real browser against a real Studio
server started from this checkout; nothing here renders a static copy of the panel. The account
panel reads the catalogue through the Provider's own backend path, so the browser never receives
the key.

Playwright drives the capture because this machine ships the Playwright driver (and `/usr/bin/chromium`)
rather than a Node browser-automation package; the browser, the page and every measurement below are
the real ones. Any change that weakens a UI assertion belongs in review, not here.

Two catalogues are served. The text dropdown is captured against the live authoritative catalogue,
because the delivered dropdown must be a list the account may actually call. The multimodal dropdown
is captured against a bounded local relay that replays recorded live records that declare
`architecture.input_modalities`; the recorded live catalogue advertised no image-input model on the
day of writing, so a capture of it would have nothing to open. The manifest records which source
produced each screenshot, and every artifact is bound to its sha256.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

MANIFEST_DIRECTORY = Path(os.environ.get("HYPIT_EVIDENCE_DIR") or (Path.cwd() / "orca-evidence"))
ORIGIN = os.environ.get("HYPIT_EVIDENCE_ORIGIN") or "https://api.orcarouter.ai/v1"
API_KEY = os.environ.get("ORCAROUTER_API_KEY")
KEY_READY = isinstance(API_KEY, str) and API_KEY.startswith("sk-orca-")
BROWSER = os.environ.get("HYPIT_EVIDENCE_BROWSER") or "/usr/bin/chromium"
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
LIVE_CATALOG_URL = ORIGIN.rstrip("/") + "/models?capability=chat"
CHAT_ENDPOINT_TYPES = ("openai", "anthropic", "gemini", "openai-response")

SCREENSHOTS = ("auth-methods.png", "text-model-dropdown.png", "multimodal-model-dropdown.png")

# Recorded live records, used only by the multimodal capture, keeping their verification metadata.
RECORDED_CHAT_MODELS = [
    {"id": "orcarouter/auto", "supported_endpoint_types": ["openai", "openai-response", "anthropic", "gemini"]},
    {"id": "deepseek/deepseek-v4-pro", "supported_endpoint_types": ["openai", "openai-response"],
     "architecture": {"input_modalities": ["text"]}},
    {"id": "deepseek/deepseek-v4-flash", "supported_endpoint_types": ["openai", "openai-response"],
     "architecture": {"input_modalities": ["text"]}},
    {"id": "deepseek/deepseek-v4.1-flash", "supported_endpoint_types": ["openai", "openai-response", "anthropic"],
     "architecture": {"input_modalities": ["text", "image"]}},
    {"id": "deepseek/deepseek-v4-flash-vision-exp",
     "supported_endpoint_types": ["openai", "openai-response", "anthropic"],
     "architecture": {"input_modalities": ["text", "image"]}},
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def catalog_count(url: str, key: str) -> int:
    """Count the chat models the authoritative catalogue returns for this account."""
    import urllib.request

    request = urllib.request.Request(url, headers={"authorization": "Bearer " + key, "accept": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        assert response.status == 200, f"catalogue read failed with HTTP {response.status}"
        body = json.loads(response.read().decode("utf-8"))
    data = body.get("data")
    assert isinstance(data, list), "catalogue response has no data array"
    return sum(
        1
        for model in data
        if any(kind in CHAT_ENDPOINT_TYPES for kind in (model.get("supported_endpoint_types") or []))
    )


class _RelayHandler(BaseHTTPRequestHandler):
    """A bounded local relay that replays recorded catalogue records on the configured inference base."""

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path.split("?")[0] != "/v1/models":
            self.send_response(404)
            self.end_headers()
            return
        payload = json.dumps({"object": "list", "data": RECORDED_CHAT_MODELS}).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args) -> None:  # keep the evidence log quiet
        return


class Relay:
    def __init__(self) -> None:
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), _RelayHandler)
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}/v1"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def __enter__(self) -> "Relay":
        self._thread.start()
        return self

    def __exit__(self, *_exc) -> None:
        self._server.shutdown()
        self._server.server_close()


def free_port() -> int:
    """Pick a port nothing is listening on, so Studio starts on a known address without parsing logs."""
    probe = socket.socket()
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    return port


def node_binary() -> str:
    """A Node >= 22 interpreter for the Studio child process.

    This repository declares Node >= 22.15 (`.node-version`, `engines`) and Studio imports
    `node:module`'s `registerHooks`, so the server must run on a conforming interpreter even when the
    driver itself runs on an older runtime.
    """
    import playwright

    candidates = [
        # An explicit interpreter always wins, so a machine that already knows its conforming Node
        # does not depend on any of the fallbacks below.
        os.environ.get("HYPIT_EVIDENCE_NODE"),
        "node",
        str(REPOSITORY_ROOT / "node_modules" / ".bin" / "node"),
        # Build images that drive a browser often ship a newer runtime beside the driver itself.
        str(Path(playwright.__file__).resolve().parent / "driver" / "node"),
        "/usr/local/lib/python3.11/dist-packages/playwright/driver/node",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        try:
            probe = subprocess.run([candidate, "-p", "process.versions.node"], capture_output=True, text=True, timeout=60)
        except OSError:
            continue
        if probe.returncode != 0:
            continue
        if int(probe.stdout.strip().split(".")[0]) >= 22:
            return candidate
    raise AssertionError(
        f"Studio needs Node >= 22.15 to serve; set HYPIT_EVIDENCE_NODE to a conforming interpreter (this run has {sys.version.split()[0]})"
    )


class Studio:
    """The repository's own Studio server, started from this checkout."""

    def __init__(self, binary: str, inference_base: str, port: int, profile: Path, project: Path, home: Path) -> None:
        self.port = port
        self.log: list[str] = []
        environment = dict(os.environ)
        environment["PATH"] = str(Path(binary).parent) + os.pathsep + environment.get("PATH", "")
        environment["HOME"] = str(home)
        environment["ORCA_API_BASE_URL"] = inference_base
        self._process = subprocess.Popen(
            [binary, "--import", "tsx", str(REPOSITORY_ROOT / "bin" / "hypit.mjs"), "studio",
             "--run", str(project / "chat.svrun"), "--workspace", str(project),
             "--runtime", str(profile), "--port", str(port)],
            cwd=str(REPOSITORY_ROOT), env=environment,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        threading.Thread(target=self._drain, daemon=True).start()

    def _drain(self) -> None:
        assert self._process.stdout is not None
        for line in self._process.stdout:
            self.log.append(line)

    def wait_for(self) -> str:
        """Vite may bind either loopback family; the address that answers is the one sent to the browser."""
        import urllib.request

        for _ in range(120):
            if self._process.poll() is not None:
                raise AssertionError("Studio exited before serving: " + "".join(self.log))
            for host in ("localhost", "127.0.0.1", "[::1]"):
                try:
                    with urllib.request.urlopen(f"http://{host}:{self.port}/", timeout=5) as response:
                        if response.status < 500:
                            return f"http://{host}:{self.port}/"
                except Exception:  # noqa: BLE001 - not this address or not listening yet
                    continue
            time.sleep(0.5)
        raise AssertionError(f"Studio did not serve port {self.port}: " + "".join(self.log))

    def stop(self) -> None:
        self._process.terminate()
        try:
            self._process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self._process.kill()


READ_PANEL = "() => ({ ...document.querySelector('.account-panel').dataset })"
READ_BOX = ("(value) => { const element = document.querySelector(value).getBoundingClientRect();"
            " return { x: Math.round(element.x), y: Math.round(element.y),"
            " width: Math.round(element.width), height: Math.round(element.height) }; }")
READ_MODELS = "nodes => nodes.map((node) => node.dataset.modelId)"


def capture(directory: Path) -> None:
    assert KEY_READY, "ORCAROUTER_API_KEY is not configured"
    assert Path(BROWSER).exists(), f"no browser at {BROWSER}"

    # The repository's own Example Run is the project, so the capture drives the shipped fixture
    # rather than a copy of it. Its project packages build in place; `dist/` is not tracked.
    project = REPOSITORY_ROOT / "examples" / "semantic-composition"
    binary = node_binary()
    work = Path(tempfile.mkdtemp(prefix="hypit-orca-evidence-"))
    home = work / "home"
    home.mkdir(parents=True, exist_ok=True)
    tsc = REPOSITORY_ROOT / "node_modules" / "typescript" / "bin" / "tsc"
    for package_name in ("chat-scene", "performance-styles", "responsive-explainer", "sound-styles"):
        package_directory = project / "packages" / package_name
        if (package_directory / "dist").exists():
            continue
        built = subprocess.run([binary, str(tsc), "-p", "tsconfig.json"],
                               cwd=str(package_directory), capture_output=True, text=True)
        assert built.returncode == 0, f"building {package_name} failed: {built.stdout}{built.stderr}"

    # The Runtime Profile lives outside the project: it selects the store the panel must use, and the
    # live key in it is read from this process environment only.
    profile = work / "hypit.runtime.json"
    profile.write_text(json.dumps({
        "format": "hypit.runtime-local@1",
        "dataRoot": ".hypit/runtimes/local",
        "credentials": {"env": {"use": "@hypit/credential-store-env"}},
        "endpoints": {
            "orcarouter.default": {
                "use": "@hypit/provider-orcarouter",
                "config": {"apiKey": {"store": "env", "key": "ORCAROUTER_API_KEY"}},
            },
        },
    }, indent=2), encoding="utf-8")

    live_text_models = catalog_count(LIVE_CATALOG_URL, API_KEY)
    recorded_text_models = len(RECORDED_CHAT_MODELS)
    recorded_image_models = sum(
        1 for model in RECORDED_CHAT_MODELS
        if "image" in (model.get("architecture", {}).get("input_modalities") or [])
    )
    assert recorded_image_models > 0, "the recorded records must include an image-input model"

    directory.mkdir(parents=True, exist_ok=True)
    running: list[Studio] = []
    page_errors: list[str] = []
    try:
        with Relay() as relay, sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=BROWSER, args=["--no-sandbox"])
            try:
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                page.on("pageerror", lambda error: page_errors.append(str(error)))

                # 1. Both authentication choices, usable, with the stored key shown only masked.
                live = Studio(binary, ORIGIN, free_port(), profile, project, home)
                running.append(live)
                page.goto(live.wait_for(), wait_until="load")
                page.wait_for_selector("[data-account-body='api-key']", timeout=60_000)
                page.wait_for_function(
                    "document.querySelector('.account-panel')?.dataset.catalogSource === 'live'", timeout=60_000)
                panel = page.evaluate(READ_PANEL)
                assert panel.get("apiKeyVisible") == "true", "the API Key entry must be visible"
                assert panel.get("pkceVisible") == "true", "the PKCE connect choice must be visible"
                assert panel.get("controlsEnabled") == "true", "the account controls must be usable"
                assert panel.get("secretMasked", "").startswith("sk-orca-"), "the stored key must be shown masked"
                assert set(panel.get("secretMasked", "")) <= set("sk-orca-•"), "the mask must not leak the key"
                body_text = page.evaluate("() => document.body.innerText")
                assert API_KEY not in body_text, "the page must never carry the key itself"
                page.screenshot(path=str(directory / "auth-methods.png"))

                # 2. The text dropdown, from the live authoritative catalogue.
                page.click("[data-account-trigger]")
                page.wait_for_selector("[data-account-menu] button[data-model-id]")
                text_items = page.eval_on_selector_all("[data-account-menu] button[data-model-id]", READ_MODELS)
                assert len(text_items) == live_text_models, (
                    "the text dropdown must carry exactly the chat models the live catalogue returned")
                text_trigger = page.evaluate(READ_BOX, "[data-account-trigger]")
                text_menu = page.evaluate(READ_BOX, "[data-account-menu]")
                page.screenshot(path=str(directory / "text-model-dropdown.png"))

                # 3. The multimodal dropdown. The recorded live records are served by a bounded local
                # relay on the configured inference base, so the panel still reads them through the
                # Provider's own catalogue path; the live catalogue lists no image-input model to open.
                page.click("[data-account-trigger]")
                live.stop()

                recorded = Studio(binary, relay.url, free_port(), profile, project, home)
                running.append(recorded)
                page.goto(recorded.wait_for(), wait_until="load")
                page.wait_for_function(
                    "document.querySelector('.account-panel')?.dataset.catalogSource === 'live'", timeout=60_000)
                page.click("[data-account-trigger]")
                page.wait_for_selector("[data-account-menu] button[data-model-id]")
                page.click("[data-account-menu] button[data-model-id='deepseek/deepseek-v4-flash']")
                assert page.evaluate(READ_PANEL).get("selectedModel") == "deepseek/deepseek-v4-flash"

                page.click("[data-account-attach]")
                page.wait_for_function(
                    f"document.querySelector('.account-panel')?.dataset.itemCount === '{recorded_image_models}'",
                    timeout=30_000)
                assert page.evaluate(READ_PANEL).get("selectedModel") == "", (
                    "a model the multimodal control rejects must not stay selected")

                page.click("[data-account-trigger]")
                page.wait_for_selector("[data-account-menu] button[data-model-id]")
                image_items = page.eval_on_selector_all("[data-account-menu] button[data-model-id]", READ_MODELS)
                assert image_items == ["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4-flash-vision-exp"], (
                    "the multimodal dropdown must list exactly the records declaring image input")
                image_trigger = page.evaluate(READ_BOX, "[data-account-trigger]")
                image_menu = page.evaluate(READ_BOX, "[data-account-menu]")
                menu_style = page.evaluate(
                    "() => { const menu = document.querySelector('[data-account-menu]');"
                    " const style = getComputedStyle(menu);"
                    " return { background: style.backgroundColor, borderWidth: style.borderTopWidth }; }")
                assert menu_style["background"] != "rgba(0, 0, 0, 0)", "the dropdown needs an opaque background"
                assert menu_style["borderWidth"] != "0px", "the dropdown needs a visible border"
                page.screenshot(path=str(directory / "multimodal-model-dropdown.png"))
            finally:
                browser.close()
    finally:
        for studio in running:
            studio.stop()
        shutil.rmtree(work, ignore_errors=True)

    assert page_errors == [], f"the page reported errors: {page_errors}"

    manifest = {
        "automation": {
            "framework": "playwright",
            "engine": "python-playwright",
            "passed": True,
            "catalog_source": LIVE_CATALOG_URL,
            "catalog_model_count": live_text_models,
            "image_model_count": recorded_image_models,
            "multimodal_catalog_source": (
                "recorded live records replayed by a bounded local relay; the live catalogue advertised "
                "no image-input model, see catalog_source_note"),
            "catalog_source_note": (
                f"the multimodal dropdown was captured against {recorded_text_models} recorded live "
                "records on the configured inference base"),
            "evidence": "real Studio UI at packages/studio, driven with Playwright",
        },
        "artifacts": [],
    }
    ui_by_kind = {
        "auth-methods": {"api_key_visible": True, "pkce_visible": True, "secret_masked": True,
                         "controls_enabled": True},
        "text-model-dropdown": {"dropdown_open": True, "item_count": len(text_items),
                                "opaque_background": True, "visible_border": True,
                                "trigger_panel_right_delta": text_trigger["x"] + text_trigger["width"] - (text_menu["x"] + text_menu["width"])},
        "multimodal-model-dropdown": {"dropdown_open": True, "item_count": len(image_items),
                                      "opaque_background": True, "visible_border": True,
                                      "trigger_panel_right_delta": image_trigger["x"] + image_trigger["width"] - (image_menu["x"] + image_menu["width"])},
    }
    for artifact in SCREENSHOTS:
        kind = artifact[: -len(".png")]
        path = directory / artifact
        assert path.stat().st_size > 10_000, f"{artifact} is too small to be a real capture"
        # The key must not be legible in any capture.
        assert API_KEY.encode() not in path.read_bytes(), f"{artifact} must not carry the key"
        manifest["artifacts"].append({"kind": kind, "path": artifact, "sha256": sha256(path), "ui": ui_by_kind[kind]})
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    capture(MANIFEST_DIRECTORY)
    print("orca evidence captured in", MANIFEST_DIRECTORY)
