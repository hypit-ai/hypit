/**
 * Renderer-neutral local execution seam. Endpoint packages select a concrete capture backend;
 * this module owns request staging, limits, progress and disposable worker supervision.
 */
export {
  captureStagedVisual,
} from "./capture.js";
export type {
  CaptureInput,
  SharedTextureCapture,
  SharedTextureCaptureBackend,
  SharedTextureCapturePages,
} from "./capture.js";
export { runCaptureProcess } from "./capture-process.js";
export type { CaptureWorkerLaunch } from "./capture-process.js";
export { releaseCaptureExitCleanup } from "./capture-exit.js";
export { createFramePreparer } from "./opaque-capture.js";
export type { FramePreparationTiming, SourceFrameUpdate } from "./opaque-capture.js";
export { renderWorkerLimit } from "./concurrency.js";
export { assert } from "./process.js";
export { renderProgressReporter } from "./progress.js";
export {
  endpointSupport,
  localHtmlRasterRejection,
} from "./support.js";
export {
  rasterizeHtmlProgramWithBackend,
  resolveLocalHtmlExecutionOptions,
} from "./render.js";
export type {
  HtmlRasterBackend,
  HtmlRasterOptions,
  HtmlRasterProgress,
} from "./render.js";
export type {
  HtmlBrowserGpu,
  HtmlExecutionOptions,
  HtmlWorkers,
} from "./options.js";
export { localHtmlRuntimeConfig } from "./runtime-config.js";
export { probeHtmlMediaTools } from "./program.js";
