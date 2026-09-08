import { captureStagedVisual } from "./capture.js";
import type { CaptureInput } from "./capture.js";

const controller = new AbortController();
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
controller.signal.addEventListener("abort", () => {
  process.send?.({ type: "stopping", error: message(controller.signal.reason) });
}, { once: true });
process.on("message", (value: { type: "start"; input: CaptureInput } | { type: "abort"; error: string }) => {
  if (value.type === "abort") { controller.abort(new Error(value.error)); return; }
  void captureStagedVisual(value.input, controller,
    (event) => process.send?.({ type: "progress", event })).then(
    () => process.send?.({ type: "completed" }),
    (error) => process.send?.({ type: "failed", error: message(error) }),
  );
});
process.on("disconnect", () => controller.abort(new Error("Render owner disconnected")));
