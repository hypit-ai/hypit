/** Renderer-neutral local HTML execution. Concrete renderer packages own capture backends. */
export { captureStagedVisual } from "./capture.js";
export type {
  CaptureInput,
  StagedCaptureBackend,
  StagedCapturePreparation,
  StagedCaptureSession,
  StagedCaptureWorker,
} from "./capture.js";
export { runCaptureProcess } from "./capture-process.js";
export type { CaptureWorkerLaunch } from "./capture-process.js";
export { installCaptureExitCleanup } from "./capture-exit.js";
export { createFramePreparer } from "./frame-preparer.js";
export type { FramePreparationPage, FramePreparationTiming, SourceFrameUpdate } from "./frame-preparer.js";
export { renderWorkerLimit } from "./concurrency.js";
export { assert } from "./process.js";
export { localHtmlFrameRejection, localHtmlRasterRejection } from "./support.js";
export { rasterizeHtmlWithBackend, resolveLocalHtmlExecutionOptions } from "./render.js";
export type {
  HtmlRasterBackend,
  HtmlRasterOptions,
  HtmlRasterProgress,
  ResolvedHtmlExecutionOptions,
} from "./render.js";
export type { HtmlRenderDiagnostic } from "./diagnostic.js";
export type { HtmlBrowserGpu, HtmlExecutionOptions, HtmlWorkers } from "./options.js";
export { probeHtmlMediaTools } from "./program.js";
export type { HtmlMediaToolState } from "./program.js";
