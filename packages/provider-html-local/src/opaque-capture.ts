import type { Page } from "puppeteer-core";
import type { HtmlProcessUsage } from "@hypit/html-program";
import {
  createFramePreparer,
} from "@hypit/html-render-local";
import type {
  FramePreparationPage,
  SourceFrameUpdate,
} from "@hypit/html-render-local";

/** Capture one prepared Chromium page state as an opaque PNG. */
export async function createOpaqueFrameCapture(
  page: Page,
  canvas: { readonly width: number; readonly height: number },
  matte: string,
  processUsages: readonly HtmlProcessUsage[] = [],
) {
  const cdp = await page.createCDPSession();
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(matte);
  if (match === null) throw new Error("HTML renderer matte must be an opaque hexadecimal color");
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: {
    r: Number.parseInt(match[1]!, 16), g: Number.parseInt(match[2]!, 16), b: Number.parseInt(match[3]!, 16), a: 1,
  } });
  const preparationPage: FramePreparationPage = {
    evaluate: page.evaluate.bind(page) as FramePreparationPage["evaluate"],
    screenshot: async options => await page.screenshot(options) as Uint8Array,
  };
  const prepare = await createFramePreparer(preparationPage, processUsages);
  return async (frame: number, sources: readonly SourceFrameUpdate[] = []) => {
    const timing = await prepare(frame, sources);
    const started = performance.now();
    const result = await cdp.send("Page.captureScreenshot", {
      format: "png", optimizeForSpeed: true, fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: canvas.width, height: canvas.height, scale: 1 },
    });
    return { buffer: Buffer.from(result.data, "base64"), ...timing,
      outputMs: performance.now() - started };
  };
}
