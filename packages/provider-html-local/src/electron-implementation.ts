/** Internal implementation surface consumed by the separate Electron Endpoint package. */
export { createLocalElectronHtmlProvider } from "./provider.js";
export type { CreateLocalElectronHtmlProviderOptions } from "./provider.js";
export { rasterizeElectronHtmlProgram } from "./render.js";
export type { ElectronHtmlRasterOptions, HtmlRasterProgress } from "./render.js";
export type { HtmlBrowserGpu, HtmlWorkers } from "./options.js";
