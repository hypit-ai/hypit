import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
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
    try {
      process.kill(descendant, 0);
      assert.notEqual(process.platform, "win32");
      assert.match(execFileSync("ps", ["-p", String(descendant), "-o", "stat="], { encoding: "utf8" }).trim(), /^Z/u);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  } finally {
    if (descendant !== undefined) { try { process.kill(descendant, "SIGKILL"); } catch {} }
    await rm(root, { recursive: true, force: true });
  }
});

test("a capture process resolves Distribution packages without workspace links", async () => {
  // A packed Distribution ships its package sources with no node_modules link between them,
  // and the launcher's resolver hooks are process-local. Starting this entry outside the
  // checkout reproduces exactly that: nothing above it declares @hypit/hyperframes.
  const root = await mkdtemp(join(tmpdir(), "hypit-capture-resolution-"));
  const tsx = import.meta.resolve("tsx");
  const bootstrap = new URL("../src/capture-bootstrap.ts", import.meta.url).href;
  try {
    const probe = join(root, "probe.mjs");
    await writeFile(probe, `const module = await import("@hypit/hyperframes/project");
process.stdout.write("resolved:" + Object.keys(module).join(",") + "\\n");`);

    // Control: the preload is the only difference between the two arms below.
    const unresolved = spawnSync(process.execPath, ["--import", tsx, probe], { encoding: "utf8", timeout: 120_000 });
    assert.notEqual(unresolved.status, 0);
    assert.match(unresolved.stderr, /ERR_MODULE_NOT_FOUND/u);

    const resolved = spawnSync(process.execPath, ["--import", tsx, "--import", bootstrap, probe],
      { encoding: "utf8", timeout: 120_000 });
    assert.equal(resolved.status, 0, resolved.stderr);
    assert.match(resolved.stdout, /stageHyperframesProject/u);

    // The render entry point must actually pass that preload to its child.
    const worker = join(root, "worker.mjs");
    await writeFile(worker, `process.once("message", async () => {
      const module = await import("@hypit/hyperframes/project");
      process.stdout.write("resolved:" + Object.keys(module).join(",") + "\\n");
      process.send({ type: "completed" });
    });`);
    const diagnostics: string[] = [];
    await runCaptureProcess({ config: resolveExecutionOptions({}) } as CaptureInput,
      new AbortController().signal, () => {}, pathToFileURL(worker),
      async (message) => { diagnostics.push(message.message); });
    assert.ok(diagnostics.some((message) => message.startsWith("resolved:")), diagnostics.join("\n"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("renderer stdout and stderr diagnostics are drained before reporting success", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-diagnostics-"));
  const messages: import("@hypit/runtime").ExecutionDiagnostic[] = [];
  try {
    const entry = join(root, "report.mjs");
    await writeFile(entry, `process.once('message', () => {
      process.stdout.write('browser ready\\n');
      process.stderr.write('render diagnostic\\n');
      process.send({ type: 'completed' });
    });`);
    await runCaptureProcess({ config: resolveExecutionOptions({}) } as CaptureInput,
      new AbortController().signal, () => {}, pathToFileURL(entry), async (message) => {
        await new Promise((resolve) => setTimeout(resolve, 5)); messages.push(message);
      });
    assert.ok(messages.some((item) => item.stream === "stdout" && item.message.includes("browser ready")));
    assert.ok(messages.some((item) => item.stream === "stderr" && item.message.includes("render diagnostic")));
  } finally { await rm(root, { recursive: true, force: true }); }
});
