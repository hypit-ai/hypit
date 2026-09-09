import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { withCapture, captureBrowserExecutablePath } from "../src/index.js";
import type { CaptureOutput } from "../src/index.js";

const executablePath = process.env.HYPIT_CAPTURE_TEST_BROWSER ?? await captureBrowserExecutablePath();
const browserReady = existsSync(executablePath);
const codecsReady = ["ffprobe"].every((name) => spawnSync(name, ["-version"], { stdio: "ignore" }).status === 0);

test("capture saves actual page pixels, transparent elements and rectangles at the chosen scale", {
  skip: !browserReady && "Chrome is not installed", timeout: 30_000,
}, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-capture-images-"));
  let launched: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    const source = join(work, "page.html");
    await writeFile(source, `<style>body{margin:0;height:900px;background:transparent}
      #card{position:absolute;top:40px;left:30px;width:160px;height:100px;background:#ff0000;border-radius:20px}
      </style><button id="card" onclick="this.style.background='#0000ff'">Compare</button>`);
    const outputs = await withCapture({ launch: { executablePath,
      defaultViewport: { width: 320, height: 240, deviceScaleFactor: 2 } } }, async (capture) => {
      launched = capture.browser;
      await capture.page.goto(pathToFileURL(source).href);
      await capture.screenshot({ path: join(work, "viewport.png"), omitBackground: true });
      await capture.screenshot({ path: join(work, "full.png"), fullPage: true });
      await capture.screenshot({ path: join(work, "element.png"), selector: "#card", omitBackground: true });
      await capture.page.click("#card");
      await capture.screenshot({ path: join(work, "region.png"), clip: { x: 60, y: 70, width: 10, height: 10 } });
      await assert.rejects(capture.screenshot({ path: join(work, "full.png") }), /already exists/);
    });
    assert.equal(launched?.connected, false, "the owned browser closes after the task");
    assert.deepEqual(outputs.map(({ width, height }) => [width, height]), [[640, 480], [640, 1800], [320, 200], [20, 20]]);
    const pixels = await sharp(join(work, "region.png")).removeAlpha().raw().toBuffer();
    assert.deepEqual([...pixels.subarray(0, 3)], [0, 0, 255], "script interaction changes the captured state");
    const transparent = await sharp(join(work, "viewport.png")).ensureAlpha().raw().toBuffer();
    assert.equal(transparent[3], 0);
    assert.equal(outputs[0]?.url, pathToFileURL(source).href);
    assert.ok((await readFile(join(work, "full.png"))).byteLength > 0);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test("recording finalizes its file and reports actual dimensions and time", {
  skip: (!browserReady || !codecsReady) && "Chrome and ffprobe are required", timeout: 30_000,
}, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-capture-record-"));
  try {
    const published: CaptureOutput[] = [];
    const outputs = await withCapture({ launch: { executablePath,
      defaultViewport: { width: 960, height: 600, deviceScaleFactor: 1 } } }, async (capture) => {
      await capture.page.setContent(`<style>body{background:#123456}div{width:50px;height:50px;background:coral;
        animation:move .4s infinite alternate linear}@keyframes move{to{transform:translateX(120px)}}</style><div></div>`);
      const recording = await capture.record({ path: join(work, "motion.mp4"), fps: 20 });
      await new Promise((done) => setTimeout(done, 650));
      const result = await recording.stop();
      assert.equal(await recording.stop(), result, "stop is idempotent and publishes once");
      assert.equal(result.width, 960);
      assert.equal(result.height, 600);
      // A lower bound near the sleep would assert the host's scheduling rather than this code:
      // a loaded machine recorded 0.29 s of a 0.65 s wait and failed. What is actually ours is
      // that a duration is reported at all and is not nonsense.
      assert.ok(result.duration! > 0 && result.duration! < 3, String(result.duration));
      assert.equal(result.hasAudio, false);
      assert.ok(result.frameRate! > 0);
      await capture.record({ path: join(work, "auto-stop.mp4"), fps: 20 });
      await new Promise((done) => setTimeout(done, 350));
      // Finish the moving recording, then verify a settled screen also records its held state.
    }, (output) => published.push(output));
    const still = await withCapture({ launch: { executablePath,
      defaultViewport: { width: 320, height: 240 } } }, async (capture) => {
      await capture.page.setContent("<p>A settled product screen</p>");
      await new Promise((done) => setTimeout(done, 150));
      await capture.record({ path: join(work, "still.mp4"), fps: 20 });
      await new Promise((done) => setTimeout(done, 350));
    }, (output) => published.push(output));
    assert.equal(outputs.length, 2, "returning from the task finishes its open recording");
    assert.equal(still.length, 1);
    assert.deepEqual(published, [...outputs, ...still]);
    for (const output of outputs) assert.ok((await readFile(output.path)).byteLength > 100);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test("a failed script closes the browser and preserves earlier completed captures", {
  skip: !browserReady && "Chrome is not installed", timeout: 30_000,
}, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-capture-failure-"));
  let launched: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    await assert.rejects(withCapture({ launch: { executablePath }, timeoutMs: 100 }, async (capture) => {
      launched = capture.browser;
      await capture.page.setContent("<p>Available</p>");
      await capture.screenshot({ path: join(work, "saved.png") });
      await capture.screenshot({ path: join(work, "missing.png"), selector: "#missing" });
    }), /Waiting for selector/);
    assert.equal(launched?.connected, false);
    assert.ok(existsSync(join(work, "saved.png")));
    assert.equal(existsSync(join(work, "missing.png")), false);
  } finally { await rm(work, { recursive: true, force: true }); }
});
