import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { terminateLocalProcessTree } from "@hypit/html-render-local";

type PendingCall = { readonly resolve: (value: unknown) => void; readonly reject: (reason: unknown) => void };
type ProtocolMessage = {
  readonly id?: number;
  readonly method?: string;
  readonly result?: unknown;
  readonly error?: { readonly message?: string };
  readonly sessionId?: string;
};

async function closeChromiumProcess(
  child: ChildProcessByStdio<null, Readable, Readable>,
  directory: string,
): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    if (child.pid === undefined) child.kill("SIGKILL");
    else await terminateLocalProcessTree(child.pid);
    await exited;
  }
  child.stdout.destroy();
  child.stderr.destroy();
  await rm(directory, { recursive: true, force: true });
}

export class ChromiumHtmlPage {
  readonly #process: ChildProcessByStdio<null, Readable, Readable>;
  readonly #socket: WebSocket;
  readonly #directory: string;
  readonly #sessionId: string;
  readonly #pending = new Map<number, PendingCall>();
  readonly #events = new Map<string, Array<() => void>>();
  #nextId = 1;

  private constructor(process: ChildProcessByStdio<null, Readable, Readable>, socket: WebSocket,
    directory: string, sessionId: string) {
    this.#process = process; this.#socket = socket; this.#directory = directory; this.#sessionId = sessionId;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ProtocolMessage;
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        if (pending === undefined) return;
        this.#pending.delete(message.id);
        if (message.error !== undefined) pending.reject(new Error(message.error.message ?? "Chromium protocol call failed."));
        else pending.resolve(message.result);
      } else if (message.method !== undefined) {
        const key = `${message.sessionId ?? "browser"}:${message.method}`;
        for (const resolve of this.#events.get(key) ?? []) resolve();
        this.#events.delete(key);
      }
    });
  }

  static async open(input: { readonly executable: string; readonly url: string; readonly width: number; readonly height: number;
    readonly selection: readonly { readonly startFrame: number; readonly endFrameExclusive: number }[] }): Promise<ChromiumHtmlPage> {
    const directory = await mkdtemp(join(tmpdir(), "hypit-html-chromium-"));
    const process = spawn(input.executable, ["--headless=new", "--hide-scrollbars", "--no-first-run",
      "--no-default-browser-check", "--allow-file-access-from-files", "--remote-debugging-port=0",
      `--user-data-dir=${join(directory, "profile")}`, `--window-size=${input.width},${input.height}`, "about:blank"],
    { detached: globalThis.process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let socket: WebSocket | undefined;
    try {
      const websocket = await new Promise<string>((resolve, reject) => {
        let value = "";
        const inspect = (chunk: Buffer) => {
          value += chunk.toString("utf8");
          const found = /DevTools listening on (ws:\/\/[^\s]+)/u.exec(value);
          if (found !== null) resolve(found[1]!);
        };
        process.stdout.on("data", inspect); process.stderr.on("data", inspect);
        process.once("error", reject);
        process.once("exit", code => reject(new Error(`Chromium exited before opening DevTools (${code ?? "signal"}).`)));
      });
      socket = new WebSocket(websocket);
      await new Promise<void>((resolve, reject) => {
        socket!.addEventListener("open", () => resolve(), { once: true });
        socket!.addEventListener("error", () => reject(new Error("Cannot connect to Chromium DevTools.")), { once: true });
      });
      const provisional = new ChromiumHtmlPage(process, socket, directory, "");
      const target = await provisional.#call("Target.createTarget", { url: "about:blank" }) as { targetId: string };
      const attached = await provisional.#call("Target.attachToTarget", { targetId: target.targetId, flatten: true }) as { sessionId: string };
      const page = new ChromiumHtmlPage(process, socket, directory, attached.sessionId);
      provisional.#pending.clear();
      await page.#call("Page.enable", {}, true);
      await page.#call("Runtime.enable", {}, true);
      await page.#call("Emulation.setDeviceMetricsOverride", { width: input.width, height: input.height,
        deviceScaleFactor: 1, mobile: false }, true);
      const loaded = page.#event("Page.loadEventFired");
      await page.#call("Page.navigate", { url: input.url }, true);
      await loaded;
      await page.#evaluate("window.__hypitUsePreparedSourceFrames('/__hypit_source')", true);
      await page.#evaluate(`window.__hypitFrameProgram.prepare(${JSON.stringify(input.selection)})`, true);
      return page;
    } catch (error) {
      socket?.close();
      try { await closeChromiumProcess(process, directory); }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Chromium failed to open and its process tree did not close cleanly.");
      }
      throw error;
    }
  }

  async capture(frame: number, transparent: boolean): Promise<Buffer> {
    await this.#evaluate(`window.__hypitFrameProgram.applyFrame(${frame})`, true);
    await this.#call("Emulation.setDefaultBackgroundColorOverride", transparent
      ? { color: { r: 0, g: 0, b: 0, a: 0 } }
      : {}, true);
    const result = await this.#call("Page.captureScreenshot", {
      format: "png", fromSurface: true, captureBeyondViewport: false,
    }, true) as { data?: unknown };
    if (typeof result.data !== "string") throw new Error("Chromium returned no frame image.");
    return Buffer.from(result.data, "base64");
  }

  async close(): Promise<void> {
    this.#socket.close();
    await closeChromiumProcess(this.#process, this.#directory);
  }

  async #evaluate(expression: string, awaitPromise: boolean): Promise<unknown> {
    const value = await this.#call("Runtime.evaluate", { expression, awaitPromise, returnByValue: true }, true) as {
      result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } };
    };
    if (value.exceptionDetails !== undefined) throw new Error(value.exceptionDetails.exception?.description
      ?? value.exceptionDetails.text ?? "Chromium page evaluation failed.");
    return value.result?.value;
  }

  #event(method: string): Promise<void> {
    const key = `${this.#sessionId}:${method}`;
    return new Promise(resolve => this.#events.set(key, [...(this.#events.get(key) ?? []), resolve]));
  }

  #call(method: string, params: unknown, session = false): Promise<unknown> {
    const id = this.#nextId++;
    const message = { id, method, params, ...(session && this.#sessionId.length > 0 ? { sessionId: this.#sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject }); this.#socket.send(JSON.stringify(message));
    });
  }
}
