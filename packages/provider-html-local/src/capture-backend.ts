import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";
import { selectHtmlProcessUsages } from "@hypit/html-program";
import type {
  CaptureInput,
  StagedCaptureBackend,
  StagedCaptureSession,
  StagedCaptureWorker,
} from "@hypit/html-render-local";
import { createOpaqueFrameCapture } from "./opaque-capture.js";

export function chromiumCaptureBackend(executablePath: string): StagedCaptureBackend {
  return {
    mode: "frame-buffer",
    label: "opaque Chromium PNG",
    async create(input: CaptureInput, origin: string, _pages, controller): Promise<StagedCaptureSession> {
      const sessions = new Set<Browser>();
      const closing = new Map<Browser, Promise<void>>();
      const closeBrowser = (browser: Browser): Promise<void> => {
        let closingBrowser = closing.get(browser);
        if (closingBrowser === undefined) {
          closingBrowser = browser.close().finally(() => { sessions.delete(browser); });
          closing.set(browser, closingBrowser);
        }
        return closingBrowser;
      };
      const closeAll = async () => { await Promise.allSettled([...sessions].map(closeBrowser)); };
      const abort = () => { void closeAll(); };
      controller.signal.addEventListener("abort", abort, { once: true });
      let closed = false;
      return {
        async createWorker(): Promise<StagedCaptureWorker> {
          controller.signal.throwIfAborted();
          const browser = await puppeteer.launch({ executablePath, headless: true,
            defaultViewport: { width: input.document.canvas.width, height: input.document.canvas.height, deviceScaleFactor: 1 },
            args: ["--no-sandbox", "--disable-dev-shm-usage",
              ...(input.config.browserGpu === "software" ? ["--disable-gpu"] : []),
            ] });
          sessions.add(browser);
          controller.signal.throwIfAborted();
          const page = await browser.newPage();
          if (input.config.initializationTimeoutMs !== undefined) {
            page.setDefaultTimeout(input.config.initializationTimeoutMs);
            page.setDefaultNavigationTimeout(input.config.initializationTimeoutMs);
          }
          await page.goto(origin, { waitUntil: "load" });
          await page.evaluate(async (frameSelection) => {
            const program = (window as unknown as {
              __hypitFrameProgram?: { prepare(spans?: readonly { readonly startFrame: number; readonly endFrameExclusive: number }[]): Promise<void> };
            }).__hypitFrameProgram;
            if (program === undefined) throw new Error("HTML Program page ABI is missing");
            await program.prepare(frameSelection);
          }, input.frameSelection);
          const picture = input.frames === undefined ? input.delivery.picture : input.picture;
          const capturePng = await createOpaqueFrameCapture(page, input.document.canvas, picture.alpha.matte,
            selectHtmlProcessUsages(input.document, input.frameSelection));
          return {
            browserPid: browser.process()?.pid,
            async capture(frame, sources, _ordinal, prepared) {
              const captured = await capturePng(frame, sources);
              prepared();
              return captured;
            },
            close: async () => { await closeBrowser(browser); },
          };
        },
        async close() {
          if (closed) return;
          closed = true;
          controller.signal.removeEventListener("abort", abort);
          await closeAll();
        },
      };
    },
  };
}
