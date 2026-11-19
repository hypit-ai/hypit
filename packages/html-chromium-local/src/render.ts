import type { HtmlCaptureBackend } from "@hypit/html-render-local";
import { ChromiumHtmlPage } from "./page.js";

const defaultChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Chromium contributes only a frame-capture worker; shared execution owns staging, ordering and encoding. */
export function chromiumHtmlBackend(chromePath = defaultChrome): HtmlCaptureBackend {
  return {
    id: "hypit.html.chromium",
    mode: "frame-buffer",
    async createWorker(request, staged, options) {
      options.signal?.throwIfAborted();
      const page = await ChromiumHtmlPage.open({
        executable: chromePath,
        url: staged.url,
        width: request.program.canvas.width,
        height: request.program.canvas.height,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        selection: "frames" in request
          ? request.frames.map((frame) => ({ startFrame: frame, endFrameExclusive: frame + 1 }))
          : [request.range ?? { startFrame: 0, endFrameExclusive: request.program.frameCount }],
      });
      let closing: Promise<void> | undefined;
      const close = () => closing ??= page.close();
      const abort = () => { void close().catch(() => undefined); };
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted === true) {
        options.signal.removeEventListener("abort", abort);
        await close();
        options.signal.throwIfAborted();
      }
      return {
        capture: (frame, transparent) => page.capture(frame, transparent),
        close: () => {
          options.signal?.removeEventListener("abort", abort);
          return close();
        },
      };
    },
  };
}
