import { createRequire } from "node:module";
import {
  captureStagedVisual,
  releaseCaptureExitCleanup,
} from "@hypit/provider-html-local/execution";
import type { CaptureInput } from "@hypit/provider-html-local/execution";

import { electronSharedTextureCaptureBackend } from "./gpu-capture.js";

const controller = new AbortController();
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const disconnected = () => controller.abort(new Error("Render owner disconnected"));
const report = (value: object) => {
  if (process.connected) process.send?.(value, undefined, undefined, (error) => { if (error) controller.abort(error); });
};
const finish = (value: { type: "completed" } | { type: "failed"; error: string }) => {
  if (value.type === "failed") { report(value); return; }
  releaseCaptureExitCleanup();
  process.off("disconnect", disconnected);
  process.off("message", receive);
  if (!process.connected) return;
  process.send?.(value, undefined, undefined, (error) => {
    if (error) { console.error(message(error)); process.exitCode = 1; }
    if (process.connected) process.disconnect();
    createRequire(import.meta.url)("electron").app.exit(error ? 1 : 0);
  });
};
controller.signal.addEventListener("abort", () => {
  report({ type: "stopping", error: message(controller.signal.reason) });
}, { once: true });
const receive = (value: { type: "start"; input: CaptureInput } | { type: "abort"; error: string }) => {
  if (value.type === "abort") { controller.abort(new Error(value.error)); return; }
  void captureStagedVisual(value.input, controller,
    event => report({ type: "progress", event }), electronSharedTextureCaptureBackend).then(
    () => finish({ type: "completed" }),
    error => finish({ type: "failed", error: message(error) }),
  );
};
process.on("message", receive);
process.on("disconnect", disconnected);
