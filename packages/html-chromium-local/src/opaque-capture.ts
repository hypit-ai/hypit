import type { Page } from "puppeteer-core";
import type { FrameOutputPictureSpec } from "@hypit/media";
import {
  createFramePreparer,
} from "@hypit/html-render-local";
import type {
  FramePreparationPage,
  SourceFrameUpdate,
} from "@hypit/html-render-local";

/** Capture one prepared Chromium page state with the requested PNG alpha interpretation. */
export async function createFrameCapture(
  page: Page,
  canvas: { readonly width: number; readonly height: number },
  alpha: FrameOutputPictureSpec["alpha"],
) {
  const cdp = await page.createCDPSession();
  if (alpha.mode === "opaque") {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(alpha.matte);
    if (match === null) throw new Error("HTML renderer matte must be an opaque hexadecimal color");
    await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: {
      r: Number.parseInt(match[1]!, 16), g: Number.parseInt(match[2]!, 16), b: Number.parseInt(match[3]!, 16), a: 1,
    } });
  } else {
    await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  }
  const preparationPage: FramePreparationPage = {
    evaluate: page.evaluate.bind(page) as FramePreparationPage["evaluate"],
  };
  const prepare = await createFramePreparer(preparationPage);
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
