import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { runCaptureProcess } from "../src/capture-process.js";
import { resolveExecutionOptions } from "../src/render.js";
import type { CaptureInput } from "../src/capture.js";

test("a stuck renderer and its detached child both stop before the call rejects", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-stuck-render-"));
  const controller = new AbortController();
  let descendant: number | undefined;
  try {
    const entry = join(root, "stuck.mjs");
    await writeFile(entry, `import { spawn } from 'node:child_process';
process.once('message', () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  process.send({ type: 'progress', event: { phase: 'worker-start', browserPid: child.pid } });
});
setInterval(() => {}, 1000);
`);
    await assert.rejects(runCaptureProcess({ config: resolveExecutionOptions({}) } as CaptureInput,
      controller.signal, (event) => {
        if ("browserPid" in event) descendant = event.browserPid;
        controller.abort(new Error("render deadline"));
      }, pathToFileURL(entry)), /render deadline/u);
    assert.ok(descendant !== undefined);
    assert.throws(() => process.kill(descendant!, 0), { code: "ESRCH" });
  } finally {
    if (descendant !== undefined) { try { process.kill(descendant, "SIGKILL"); } catch {} }
    await rm(root, { recursive: true, force: true });
  }
});
