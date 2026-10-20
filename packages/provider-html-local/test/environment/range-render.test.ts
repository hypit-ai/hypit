import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ResourceIOOptions } from "@hypit/runtime";
import { MemoryResourceStore } from "@hypit/executor";
import type { BlobRef } from "@hypit/protocol";
import sharp from "sharp";
import { rasterizeHtmlFrames, rasterizeHtmlProgram } from "../../src/index.js";
import type { HtmlRasterProgress } from "../../src/index.js";
import { htmlRangeDocument } from "../range-scenario.js";

test("real selected renders sample video correctly across wrap, hold and fractional rates with independent browsers", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-range-test-"));
  const browser = process.env.HYPIT_TEST_CHROME_PATH === undefined
    ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH };
  try {
    const colors = [[240, 20, 20], [20, 220, 20], [20, 20, 240], [220, 220, 20]];
    const raw = Buffer.concat(colors.map((color) => Buffer.from(Array.from({ length: 64 * 64 }, () => color).flat())));
    const path = join(root, "source.mp4");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", "64x64", "-r", "30", "-i", "pipe:0", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", path], { input: raw });
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const resources = new MemoryResourceStore();
    const document = htmlRangeDocument(await resources.put(await readFile(path), "video/mp4"));
    const events: HtmlRasterProgress[] = [];
    const render = async (name: string, range: { startFrame: number; endFrameExclusive: number } | undefined,
      workers: number) => {
      const warnings: string[] = [];
      const visual = await rasterizeHtmlProgram({ program: document, ...(range === undefined ? {} : { range }) },
        { resources, workers, quality: "high", processTimeoutMs: 120000, ...browser,
          maxPendingFrameBytes: 1, maxDecodedSourceBytes: 1,
          onProgress: (e) => events.push(e),
          onDiagnostic: async (event) => { if (event.level === "warning") warnings.push(event.message); } });
      assert.deepEqual(warnings, [], "a completed render should close its resources and exit without forced cleanup");
      const file = join(root, `${name}.mp4`);
      await writeFile(file, (await resources.get(visual.artifact.resource))!);
      const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
      assert.equal(decoded.status, 0, decoded.stderr.toString());
      return decoded.stdout;
    };
    const full = await render("full", undefined, 1);
    events.length = 0;
    const selected = await render("selected", { startFrame: 3, endFrameExclusive: 11 }, 3);
    const starts = events.filter((e): e is Extract<HtmlRasterProgress, { browserPid: number | undefined }> => e.phase === "worker-start");
    assert.equal(starts.length, 3);
    assert.equal(new Set(starts.map((e) => e.browserPid)).size, 3);
    const one = await render("one", { startFrame: 7, endFrameExclusive: 8 }, 4);
    const stride = 64 * 64 * 3, center = (32 * 64 + 32) * 3;
    assert.equal(full.length, 12 * stride);
    assert.equal(selected.length, 8 * stride);
    assert.equal(one.length, stride);
    for (const [i, source] of [1, 2, 3, 3, 3, 0, 0, 1].entries()) {
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(selected[i * stride + center + channel]! - colors[source]![channel]!) < 12);
        assert.ok(Math.abs(selected[i * stride + center + channel]! - full[(i + 3) * stride + center + channel]!) < 4);
      }
    }
    for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(one[center + channel]! - colors[3]![channel]!) < 12);
    const snapshots = await rasterizeHtmlFrames({ program: document, frames: [3, 7, 8, 11] },
      { resources, workers: 2, ...browser });
    for (const [index, source] of [1, 3, 0, 1].entries()) {
      const pixels = await sharp((await resources.get(snapshots[index]!.resource))!).removeAlpha().raw().toBuffer();
      for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(pixels[center + channel]! - colors[source]![channel]!) < 12);
    }
    await assert.rejects(rasterizeHtmlProgram({ program: document, range: { startFrame: 7, endFrameExclusive: 8 } },
      { resources, workers: 2, initializationTimeoutMs: 1, processTimeoutMs: 30_000, ...browser }),
      /worker 0 initialization timed out/);
    assert.equal((await render("after-timeout", { startFrame: 7, endFrameExclusive: 8 }, 1)).length, stride);

    const controller = new AbortController();
    const stopped = rasterizeHtmlProgram({ program: document }, { resources, workers: 4, signal: controller.signal, ...browser,
      onProgress: (event) => { if (event.phase === "worker-start") controller.abort(new Error("stop this attempt")); } });
    const [failed, completed] = await Promise.allSettled([stopped, render("concurrent", undefined, 2)]);
    assert.equal(failed.status, "rejected");
    assert.equal(completed.status, "fulfilled");
    if (completed.status === "fulfilled") assert.equal(completed.value.length, 12 * stride);

    class StalledOutput extends MemoryResourceStore {
      active = false;
      override get(resource: BlobRef["resource"], options?: ResourceIOOptions) { return resources.get(resource, options); }
      override async put(_bytes: Uint8Array, _mediaType: string, options: ResourceIOOptions = {}): Promise<BlobRef> {
        this.active = true;
        storeController.abort(new Error("stop output storage"));
        try { await delay(60_000, undefined, { signal: options.signal }); throw new Error("unexpected completion"); }
        finally { this.active = false; }
      }
    }
    const storeController = new AbortController();
    const outputResources = new StalledOutput();
    await assert.rejects(rasterizeHtmlProgram({ program: document, range: { startFrame: 0, endFrameExclusive: 1 } },
      { resources: outputResources, workers: 1, signal: storeController.signal, ...browser }), /stop output storage/u);
    assert.equal(outputResources.active, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
