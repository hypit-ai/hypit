import { releaseCaptureExitCleanup } from "./capture-exit.js";
import { captureStagedVisual } from "./capture.js";
import type { CaptureInput } from "./capture.js";

const controller = new AbortController();
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const disconnected = () => controller.abort(new Error("Render owner disconnected"));
const report = (value: object) => {
  if (process.connected) process.send?.(value, undefined, undefined, (error) => { if (error) controller.abort(error); });
};
const finish = (value: { type: "completed" } | { type: "failed"; error: string }) => {
  // Failure can leave descendants behind. Keep the owner connected until it has
  // discovered and stopped that tree, rather than orphaning it by exiting first.
  if (value.type === "failed") { report(value); return; }
  // Successful capture has closed its resources. Flush the result before closing our IPC handle;
  // our own disconnect is not a cancellation by the owner.
  releaseCaptureExitCleanup();
  process.off("disconnect", disconnected);
  process.off("message", receive);
  if (!process.connected) return;
  process.send?.(value, undefined, undefined, (error) => {
    if (error) { console.error(message(error)); process.exitCode = 1; }
    if (process.connected) process.disconnect();
  });
};
controller.signal.addEventListener("abort", () => {
  report({ type: "stopping", error: message(controller.signal.reason) });
}, { once: true });
const receive = (value: { type: "start"; input: CaptureInput } | { type: "abort"; error: string }) => {
  if (value.type === "abort") { controller.abort(new Error(value.error)); return; }
  void captureStagedVisual(value.input, controller,
    (event) => report({ type: "progress", event })).then(
    () => finish({ type: "completed" }),
    (error) => finish({ type: "failed", error: message(error) }),
  );
};
process.on("message", receive);
process.on("disconnect", disconnected);
