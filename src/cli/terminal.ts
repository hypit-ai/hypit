import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function openBrowser(value: string) {
  const url = new URL(value).href;
  const windows = process.platform === "win32";
  const command = windows ? process.env.ComSpec ?? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, windows ? ["/d", "/s", "/v:off", "/c", 'start "" "%HYPIT_BROWSER_URL%"'] : [url], {
    detached: true, stdio: "ignore", windowsHide: true, windowsVerbatimArguments: windows,
    ...(windows ? { env: { ...process.env, HYPIT_BROWSER_URL: url } } : {}),
  });
  child.once("error", () => undefined);
  child.unref();
}

/** Consume one callback proof without echoing its bytes or putting it in process arguments. */
export function readProof(signal: AbortSignal): Promise<string | undefined> {
  signal.throwIfAborted();
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise(resolve => {
      const reader = createInterface({ input: stdin, terminal: false });
      const abort = () => reader.close();
      signal.addEventListener("abort", abort, { once: true });
      reader.once("line", line => { resolve(line.trim()); reader.close(); });
      reader.once("close", () => { signal.removeEventListener("abort", abort); stdin.pause(); resolve(undefined); });
    });
  }
  process.stderr.write("Paste the code#state here if the browser cannot return it automatically.\n");
  return new Promise((resolve, reject) => {
    const raw: number[] = [];
    const wasRaw = stdin.isRaw;
    const finish = (value?: string, error?: Error) => {
      stdin.off("data", input);
      stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      signal.removeEventListener("abort", abort);
      raw.fill(0);
      if (error === undefined) resolve(value);
      else reject(error);
    };
    const abort = () => finish();
    const input = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3 || byte === 4) { finish(undefined, new Error("Authorization input cancelled.")); return; }
        if (byte === 10 || byte === 13) { finish(Buffer.from(raw).toString("utf8").trim()); return; }
        if (byte === 8 || byte === 127) {
          let end = raw.length - 1;
          while (end > 0 && (raw[end]! & 0xc0) === 0x80) end--;
          if (end >= 0) raw.splice(end);
        } else if (raw.length < 2048) raw.push(byte);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    stdin.setRawMode(true);
    stdin.on("data", input);
    stdin.resume();
  });
}
