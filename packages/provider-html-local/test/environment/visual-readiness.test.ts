import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { fineCaptionStyle, renderFineCaption, scheduleFineCaption } from "@hypit/caption-fine";
import { MemoryResourceStore } from "@hypit/executor";
import { sealComposition, sealPresentVisualTrack } from "@hypit/composition";
import type { VisualElement, VisualTextTypography } from "@hypit/composition";
import { compileHtmlProgram, materializeHtmlProgram } from "@hypit/html-program";
import { captionDocument, parseScript } from "@hypit/script";
import { sealTimeline } from "@hypit/timeline";
import { browserExecutablePath } from "../../src/browser.js";
import { createOpaqueFrameCapture } from "../../src/opaque-capture.js";
import { rasterizeHtmlFrames, rasterizeHtmlProgram } from "../../src/render.js";
import { htmlProviderDelivery, htmlProviderPicture } from "../provider-scenario.js";

const testBrowser = () => process.env.HYPIT_TEST_CHROME_PATH ?? browserExecutablePath({});
const testBrowserOption = () => process.env.HYPIT_TEST_CHROME_PATH === undefined
  ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH };

test("capture waits for dynamic images and rejects broken images or exact fonts", async (t) => {
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const blue = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#0000ff" } }).png().toBuffer();
  const server = createServer((request, response) => {
    setTimeout(() => {
      response.setHeader("Content-Type", "image/png");
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.end(request.url?.includes("blue") ? blue : png);
    }, 300);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await puppeteer.launch({ executablePath: testBrowser(), headless: true, args: ["--no-sandbox"] });
  try {
    for (const kind of ["class", "pseudo", "mask", "svg", "broken", "font"] as const) await t.test(kind, async () => {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 64, height: 64 });
        const css = kind === "mask" ? `.paint{background:red;mask-image:url(${origin}/mask.png)}`
          : kind === "font" ? '@font-face{font-family:broken;src:url(data:font/woff2;base64,AA==)}body{font-family:broken}' : kind === "pseudo"
          ? `.paint::before{content:'';position:absolute;inset:0;background-image:url(${origin}/pseudo.png)}`
          : `.paint{background-image:url(${origin}/class.png)}`;
        const html = kind === "font" ? '<span>A</span>' : kind === "svg" ? '<svg width="64" height="64"><image id="target" width="64" height="64"/></svg>'
          : kind === "broken" ? '<img src="data:image/png;base64,YmFk"/>'
          : '<div id="target" style="width:64px;height:64px"></div>';
        await page.setContent(`<style>body{margin:0}${css}</style>${html}`);
        if (kind === "broken") await page.waitForFunction(() => document.images[0]!.complete);
        await page.evaluate(({ kind, origin }) => {
          (window as unknown as { __hypitFrameProgram: unknown }).__hypitFrameProgram = { async applyFrame() {
            const target = document.getElementById("target");
            if (kind === "svg") target!.setAttribute("href", `${origin}/svg.png`);
            else if (target !== null) target.classList.add("paint");
          } };
        }, { kind, origin });
        const capture = await createOpaqueFrameCapture(page, { width: 64, height: 64 }, "#000000");
        if (kind === "broken") await assert.rejects(capture(0), /image could not be decoded/u);
        else if (kind === "font") await assert.rejects(capture(0), /font could not be loaded/u);
        else {
          const frame = await capture(0);
          const { data, info } = await sharp(frame.buffer).raw().toBuffer({ resolveWithObject: true });
          const center = (32 * info.width + 32) * info.channels;
          assert.deepEqual([...data.subarray(center, center + 3)], [255, 0, 0]);
        }
      } finally { await page.close(); }
    });
    await t.test("a decoded source frame occupies the compiler video normal-flow box", async () => {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 64, height: 64 });
        await page.setContent(`<style>body{margin:0}.screen{width:64px;height:64px;overflow:hidden}.screen>*{width:64px;height:64px}</style>
          <div class="screen"><video id="source" data-hypit-source-frame></video></div>`);
        await page.evaluate(() => {
          (window as unknown as { __hypitFrameProgram: unknown }).__hypitFrameProgram = {
            async applyFrame() {},
          };
        });
        const capture = await createOpaqueFrameCapture(page, { width: 64, height: 64 }, "#000000");
        const frame = await capture(0, [{
          id: "source",
          url: `data:image/png;base64,${png.toString("base64")}`,
        }]);
        const { data, info } = await sharp(frame.buffer).raw().toBuffer({ resolveWithObject: true });
        const center = (32 * info.width + 32) * info.channels;
        assert.deepEqual([...data.subarray(center, center + 3)], [255, 0, 0]);
      } finally { await page.close(); }
    });
    await t.test("stable pages are discovered once and later inline resource changes stay local", async () => {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 64, height: 64 });
        await page.setContent(`<style>body{margin:0}</style><div id="target" style="width:64px;height:64px;background:#000"></div>${"<span></span>".repeat(200)}`);
        await page.evaluate(origin => {
          const original = window.getComputedStyle.bind(window);
          const state = window as unknown as { __styleReads: number; __hypitFrameProgram: unknown };
          state.__styleReads = 0;
          Object.defineProperty(window, "getComputedStyle", { configurable: true, value(...args: Parameters<typeof getComputedStyle>) {
            state.__styleReads += 1;
            return original(...args);
          } });
          state.__hypitFrameProgram = { async applyFrame(frame: number) {
            if (frame >= 1) document.getElementById("target")!.style.opacity = "0.999";
            if (frame >= 2) document.getElementById("target")!.style.backgroundImage = `url(${origin}/local.png)`;
          } };
        }, origin);
        const capture = await createOpaqueFrameCapture(page, { width: 64, height: 64 }, "#000000");
        await capture(0);
        const initialReads = await page.evaluate(() => (window as unknown as { __styleReads: number }).__styleReads);
        assert.ok(initialReads >= 600, "the initial pass should discover the complete existing document");
        await capture(1);
        assert.equal(await page.evaluate(() => (window as unknown as { __styleReads: number }).__styleReads), initialReads,
          "an unchanged frame must not rescan computed styles");
        const frame = await capture(2);
        const finalReads = await page.evaluate(() => (window as unknown as { __styleReads: number }).__styleReads);
        assert.ok(finalReads - initialReads <= 6, `one changed element unexpectedly caused ${finalReads - initialReads} style reads`);
        const { data, info } = await sharp(frame.buffer).raw().toBuffer({ resolveWithObject: true });
        const center = (32 * info.width + 32) * info.channels;
        assert.deepEqual([...data.subarray(center, center + 3)], [255, 0, 0]);
      } finally { await page.close(); }
    });
    await t.test("a page-owned capture scope limits initial opaque resource discovery", async () => {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 64, height: 64 });
        await page.setContent(`<style>body{margin:0}</style><div id="selected" style="width:64px;height:64px;background:#000"></div><div id="unselected">${"<span></span>".repeat(200)}</div>`);
        await page.evaluate(origin => {
          const original = window.getComputedStyle.bind(window);
          const state = window as unknown as { __styleReads: number; __hypitFrameProgram: unknown; __hypitCaptureRoots: readonly Element[] };
          state.__styleReads = 0;
          Object.defineProperty(window, "getComputedStyle", { configurable: true, value(...args: Parameters<typeof getComputedStyle>) {
            state.__styleReads += 1;
            return original(...args);
          } });
          const selected = document.getElementById("selected")!;
          state.__hypitCaptureRoots = [selected];
          state.__hypitFrameProgram = { async applyFrame(time: number) {
            if (time >= 1 / 30) selected.style.backgroundImage = `url(${origin}/scoped.png)`;
          } };
        }, origin);
        const capture = await createOpaqueFrameCapture(page, { width: 64, height: 64 }, "#000000");
        await capture(0);
        const initialReads = await page.evaluate(() => (window as unknown as { __styleReads: number }).__styleReads);
        assert.ok(initialReads <= 6, `one capture root unexpectedly caused ${initialReads} style reads`);
        const frame = await capture(1);
        const { data, info } = await sharp(frame.buffer).raw().toBuffer({ resolveWithObject: true });
        const center = (32 * info.width + 32) * info.channels;
        assert.deepEqual([...data.subarray(center, center + 3)], [255, 0, 0]);
      } finally { await page.close(); }
    });
    await t.test("native image-style animations remain frame-active without global discovery", async () => {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 64, height: 64 });
        await page.setContent('<style>body{margin:0}</style><div id="target" style="width:64px;height:64px"></div>');
        await page.evaluate(origin => {
          const target = document.getElementById("target")!;
          const animation = target.animate([
            { backgroundImage: `url(${origin}/red.png)` },
            { backgroundImage: `url(${origin}/blue.png)` },
          ], { duration: 1_000, fill: "both" });
          animation.pause();
          (window as unknown as { __hypitFrameProgram: unknown }).__hypitFrameProgram = { async applyFrame(time: number) { animation.currentTime = time * 1_000; } };
        }, origin);
        const capture = await createOpaqueFrameCapture(page, { width: 64, height: 64 }, "#000000");
        const first = await capture(0);
        const last = await capture(30);
        for (const [frame, expected] of [[first, [255, 0, 0]], [last, [0, 0, 255]]] as const) {
          const { data, info } = await sharp(frame.buffer).raw().toBuffer({ resolveWithObject: true });
          const center = (32 * info.width + 32) * info.channels;
          assert.deepEqual([...data.subarray(center, center + 3)], expected);
        }
      } finally { await page.close(); }
    });
    await t.test("an opaque CSSOM edit takes the explicit whole-page fallback", async () => {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 64, height: 64 });
        await page.setContent('<style>body{margin:0}</style><div id="target" style="width:64px;height:64px"></div>');
        await page.evaluate(origin => {
          let changed = false;
          (window as unknown as { __hypitFrameProgram: unknown }).__hypitFrameProgram = { async applyFrame(time: number) {
            if (!changed && time >= 1 / 30) {
              changed = true;
              document.styleSheets[0]!.insertRule(`#target{background-image:url(${origin}/cssom.png)}`);
            }
          } };
        }, origin);
        const capture = await createOpaqueFrameCapture(page, { width: 64, height: 64 }, "#000000");
        await capture(0);
        const frame = await capture(1);
        const { data, info } = await sharp(frame.buffer).raw().toBuffer({ resolveWithObject: true });
        const center = (32 * info.width + 32) * info.channels;
        assert.deepEqual([...data.subarray(center, center + 3)], [255, 0, 0]);
      } finally { await page.close(); }
    });
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("compiled frame selection neither stages nor waits for unrelated image resources", async () => {
  const resources = new MemoryResourceStore();
  const unavailable = { kind: "blob" as const, resource: "res_unavailable-unselected-image" as const,
    size: 123, mediaType: "image/png" };
  const broken = await resources.put(new TextEncoder().encode("not an image"), "image/png");
  const red = await resources.put(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ff0000" } })
    .png().toBuffer(), "image/png");
  const space = sealTimeline({ id: "capture-scope", frameCount: 60, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealPresentVisualTrack({ id: "visual", timelineId: space.id, visualIr: "hypit.visual-ir@1", presents: [
    { id: "unavailable-early", span: { startFrame: 0, endFrameExclusive: 10 },
      root: { id: "unavailable", kind: "image", artifact: unavailable,
        style: [{ name: "width", value: "64px" }, { name: "height", value: "64px" }] } },
    { id: "broken-early", span: { startFrame: 10, endFrameExclusive: 30 },
      root: { id: "broken", kind: "image", artifact: broken,
        style: [{ name: "width", value: "64px" }, { name: "height", value: "64px" }] } },
    { id: "red-late", span: { startFrame: 30, endFrameExclusive: 60 },
      root: { id: "red", kind: "image", artifact: red,
        style: [{ name: "width", value: "64px" }, { name: "height", value: "64px" }] } },
  ] });
  const document = compileHtmlProgram(sealComposition({ id: "capture-scope",
    canvas: { width: 64, height: 64, clearColor: "#000000" }, visual: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [] }), space);

  const captured = await rasterizeHtmlFrames({ program: document, picture: htmlProviderPicture(), frames: [45] },
    { resources, workers: 1, processTimeoutMs: 120_000, ...testBrowserOption() });
  const pixels = await sharp((await resources.get(captured.frames[0]!.artifact.resource))!).removeAlpha().raw().toBuffer();
  const center = (32 * 64 + 32) * 3;
  assert.deepEqual([...pixels.subarray(center, center + 3)], [255, 0, 0]);
  if (process.env.HYPIT_TEST_ELECTRON_PATH !== undefined) {
    const visual = await rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high"),
      range: { startFrame: 45, endFrameExclusive: 46 } }, {
      renderer: "electron", electronPath: process.env.HYPIT_TEST_ELECTRON_PATH,
      resources, workers: 1, processTimeoutMs: 120_000,
    });
    const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], {
      input: (await resources.get(visual.artifact.resource))!,
    });
    assert.equal(decoded.status, 0, decoded.stderr.toString());
    const sample = [...decoded.stdout.subarray(center, center + 3)];
    assert.ok(Math.abs(sample[0]! - 255) <= 4 && sample[1]! <= 4 && sample[2]! <= 4,
      `Electron range render changed the selected red picture: ${JSON.stringify(sample)}`);
  }
  await assert.rejects(rasterizeHtmlFrames({ program: document, picture: htmlProviderPicture(), frames: [15] },
    { resources, workers: 1, processTimeoutMs: 120_000, ...testBrowserOption() }), /image could not be decoded/u);
});

test("real capture keeps later Present animation local with picture content and independent workers", async () => {
  const resources = new MemoryResourceStore();
  const black = await resources.put(await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#000000" },
  }).png().toBuffer(), "image/png");
  const timeline = sealTimeline({ id: "local-animation", frameCount: 90, frameRate: { numerator: 30, denominator: 1 } });
  const picture = sealPresentVisualTrack({ id: "picture", timelineId: timeline.id, visualIr: "hypit.visual-ir@1", presents: [{
    id: "picture", span: { startFrame: 0, endFrameExclusive: 90 },
    root: { id: "picture", kind: "image", artifact: black,
      style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
        { name: "width", value: "64px" }, { name: "height", value: "64px" }] },
  }] });
  const animated = sealPresentVisualTrack({ id: "animated", timelineId: timeline.id, visualIr: "hypit.visual-ir@1",
    presents: [0, 30, 60].map((startFrame, index) => ({
      id: `pose-${index + 1}`, span: { startFrame, endFrameExclusive: startFrame + 30 },
      root: { id: "pose", kind: "box", children: [], style: [
        { name: "position", value: "absolute" }, { name: "inset", value: 0 }, { name: "background", value: "#ffffff" },
      ], animation: { keyframes: [
        { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
        { atFrame: 30, style: [{ name: "opacity", value: 1 }] },
      ] } },
    })),
  });
  const document = compileHtmlProgram(sealComposition({ id: "local-animation", canvas: {
    width: 64, height: 64, clearColor: "#000000",
  }, visual: { members: [picture, animated].map((track) => ({ kind: "track" as const, id: track.id, track })) }, audio: [] }), timeline);
  const frames = await rasterizeHtmlFrames({ program: document, picture: htmlProviderPicture(),
    frames: [15, 45, 75] }, {
    resources, workers: 2, processTimeoutMs: 120_000, ...testBrowserOption(),
  });
  for (const [index, frame] of frames.frames.entries()) {
    const pixels = await sharp((await resources.get(frame.artifact.resource))!).removeAlpha().raw().toBuffer();
    const center = (32 * 64 + 32) * 3;
    const sample = [...pixels.subarray(center, center + 3)];
    for (const channel of sample) assert.ok(Math.abs(channel - 128) <= 3,
      `frame ${[15, 45, 75][index]} used a non-local animation pose: ${JSON.stringify(sample)}`);
  }
});

test("Fine Caption Cues stay isolated over Picture during reverse seeks and independent workers", async () => {
  const resources = new MemoryResourceStore();
  const blackBytes = await sharp({
    create: { width: 320, height: 180, channels: 3, background: "#000000" },
  }).png().toBuffer();
  const black = await resources.put(blackBytes, "image/png");
  const fontBytes = await readFile(new URL(import.meta.resolve(
    "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  )));
  const font = {
    sources: [{ artifact: await resources.put(fontBytes, "font/woff2") }],
    weight: 400,
    style: "normal" as const,
  };
  const timeline = sealTimeline({ id: "fine-caption-isolation", frameCount: 90,
    frameRate: { numerator: 30, denominator: 1 } });
  const document = captionDocument(parseScript("caption-isolation.svml",
    "<line>FIRST || SECOND || THIRD</line>"), "story.caption", "story");
  assert.equal(document.units.length, 3);

  const recipe = (path: string, fill: string) => ({ path, properties: {
    align: "center", background: "#00000000", fill, "line-height": 1,
    padding: "0", radius: 0, size: 72, width: 1, x: 0.5, y: 0.5,
    "anchor-x": "center", "anchor-y": "center", "inline-size": "fixed",
    karaoke: "off", "stroke-width": 0, "shadow-opacity": 0,
    "lead-frames": 0, "tail-frames": 0, handoff: "cut",
    "cue-enter": "fade", "cue-enter-frames": 10,
  } });
  const styles = [
    fineCaptionStyle("red", recipe("caption.red", "#FF0000"), [font]),
    fineCaptionStyle("green", recipe("caption.green", "#00FF00"), [font]),
    fineCaptionStyle("blue", recipe("caption.blue", "#0000FF"), [font]),
  ];
  const useWindow = (id: string, startFrame: number, endFrameExclusive: number) => ({
    id, subjectId: id,
    start: { id: `${id}.start`, subjectId: id, timelineId: timeline.id, frame: startFrame },
    end: { id: `${id}.end`, subjectId: id, timelineId: timeline.id, frame: endFrameExclusive },
    span: { startFrame, endFrameExclusive },
  });
  const program = { id: "captions", documentId: document.id, styles, uses: [
    { id: "red-use", styleId: "red", window: useWindow("red-use", 0, 30) },
    { id: "green-use", styleId: "green", window: useWindow("green-use", 30, 60) },
    { id: "blue-use", styleId: "blue", window: useWindow("blue-use", 60, 90) },
  ] };
  const timing = { timelineId: timeline.id, documentId: document.id, units: document.units.map((unit, index) => ({
    unitId: unit.id, startFrame: index * 30, endFrameExclusive: index * 30 + 30,
  })) };
  const captions = renderFineCaption(scheduleFineCaption(timing, program, document), program, document,
    timeline, { xPx: 0, yPx: 0, widthPx: 320, heightPx: 180 });
  assert.deepEqual(captions.items.map(present => present.span), [
    { startFrame: 0, endFrameExclusive: 30 },
    { startFrame: 30, endFrameExclusive: 60 },
    { startFrame: 60, endFrameExclusive: 90 },
  ]);

  const picture = sealPresentVisualTrack({ id: "picture", timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1", presents: [{ id: "picture",
      span: { startFrame: 0, endFrameExclusive: 90 }, root: { id: "picture",
        kind: "image", artifact: black, style: [{ name: "position", value: "absolute" },
          { name: "inset", value: 0 }, { name: "width", value: "320px" }, { name: "height", value: "180px" }],
        animation: { keyframes: [{ atFrame: 0, style: [{ name: "opacity", value: 1 }] },
          { atFrame: 90, style: [{ name: "opacity", value: 1 }] }] } } }] });
  const html = compileHtmlProgram(sealComposition({ id: "fine-caption-isolation",
    canvas: { width: 320, height: 180, clearColor: "#000000" }, visual: { members: [picture, captions].map((track) => ({ kind: "track" as const, id: track.id, track })) }, audio: [] }), timeline);

  const assertCueColors = async (buffer: Uint8Array, wanted: "red" | "green" | "blue", label: string) => {
    const { data } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = { red: 0, green: 0, blue: 0 };
    for (let offset = 0; offset < data.length; offset += 3) {
      const red = data[offset]!, green = data[offset + 1]!, blue = data[offset + 2]!;
      if (red > 96 && green < red / 3 && blue < red / 3) colors.red += 1;
      if (green > 96 && red < green / 3 && blue < green / 3) colors.green += 1;
      if (blue > 96 && red < blue / 3 && green < blue / 3) colors.blue += 1;
    }
    assert.ok(colors[wanted] > 100, `${label} lost ${wanted} Cue glyphs`);
    for (const color of ["red", "green", "blue"] as const) if (color !== wanted) assert.equal(colors[color], 0,
      `${label} leaked ${color} Cue glyphs: ${JSON.stringify(colors)}`);
  };

  const materialized = materializeHtmlProgram(html, artifact => {
    if (artifact.resource === black.resource) return `data:image/png;base64,${blackBytes.toString("base64")}`;
    if (artifact.resource === font.sources[0]!.artifact.resource) {
      return `data:font/woff2;base64,${fontBytes.toString("base64")}`;
    }
    throw new Error(`unexpected Fine Caption fixture Resource ${artifact.resource}`);
  });
  const browser = await puppeteer.launch({ executablePath: testBrowser(), headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 320, height: 180 });
      await page.setContent(materialized);
      const capture = await createOpaqueFrameCapture(page, { width: 320, height: 180 }, "#000000");
      for (const [frame, color] of [[75, "blue"], [15, "red"], [45, "green"]] as const) {
        await assertCueColors((await capture(frame)).buffer, color, `direct reverse seek frame ${frame}`);
      }
    } finally { await page.close(); }
  } finally { await browser.close(); }

  const requested = [15, 45, 75];
  const expected = ["red", "green", "blue"] as const;
  for (const workers of [1, 3]) {
    const rendered = await rasterizeHtmlFrames({ program: html, picture: htmlProviderPicture(), frames: requested }, {
      resources, workers, processTimeoutMs: 120_000, ...testBrowserOption(),
    });
    for (const [index, frame] of rendered.frames.entries()) {
      await assertCueColors((await resources.get(frame.artifact.resource))!, expected[index]!,
        `worker count ${workers}, frame ${requested[index]}`);
    }
  }
});

test("terminal text and SVG mask sources retain their Present frame animations across direct seeks and fresh workers", async () => {
  const space = sealTimeline({ id: "animations", frameCount: 60, frameRate: { numerator: 30, denominator: 1 } });
  const image = { kind: "blob", resource: "res_mask", size: 1, mediaType: "image/png" } as const;
  const font = { sources: [{ artifact: { kind: "blob", resource: "res_font", size: 1, mediaType: "font/woff2" } }],
    weight: 400, style: "normal" } as const;
  const typography: VisualTextTypography = { fonts: [font], sizePx: 20, weight: 400, style: "normal", axes: [], features: [],
    synthesis: "none", kerning: "auto", trackingPx: 0, wordSpacingPx: 0, lineHeight: 1, direction: "auto",
    writingMode: "horizontal-tb", baselineShiftPx: 0, tabSize: 4, indentationPx: 0, paragraphBeforePx: 0,
    paragraphAfterPx: 0, transform: "none", variantCaps: "normal", verticalAlign: "baseline", decorations: [],
    cjk: { textSpacing: "normal", punctuationTrim: "none" } };
  const animation = { keyframes: [{ atFrame: 0, style: [{ name: "opacity", value: 0 }] },
    { atFrame: 30, style: [{ name: "opacity", value: 1 }] }] };
  const sequences = [{ id: "letters-in", unit: "grapheme" as const, range: { start: 0, endExclusive: 1 }, order: "forward" as const,
    startFrame: 0, unitDurationFrames: 30, staggerFrames: 0, cycles: 1,
    keyframes: [{ atProgress: 0, style: [{ name: "opacity", value: 0 }] },
      { atProgress: 1, style: [{ name: "opacity", value: 1 }] }] },
  { id: "letters-out", unit: "grapheme" as const, range: { start: 0, endExclusive: 1 }, order: "forward" as const,
    startFrame: 0, unitDurationFrames: 30, staggerFrames: 0, cycles: 1,
    keyframes: [{ atProgress: 0, style: [{ name: "opacity", value: 1 }] },
      { atProgress: 1, style: [{ name: "opacity", value: 0 }] }] }];
  const text = { style: [], animation, document: { paragraphs: [{ id: "p", inlines: [{ kind: "text" as const, id: "t", text: "A" }] }] },
    typography, paints: [{ kind: "fill" as const, paint: { kind: "solid" as const, color: "#ffffff" } }], sequences };
  const root: VisualElement = { id: "root", kind: "box", style: [], children: [
    { ...text, id: "flow", kind: "text-flow", flow: {
      form: { kind: "area" }, inlineSize: "hug", blockSize: "hug", paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
      inlineAlign: "start", blockAlign: "start", wrap: "none", overflow: "visible", clipToFrame: false, columns: 1,
      columnGapPx: 0, metricEdge: "line-box" } },
    { ...text, id: "path", kind: "path-text",
      path: [{ kind: "move", x: 0, y: 20 }, { kind: "line", x: 100, y: 20 }], side: "left", orientation: "follow",
      align: "start", overflow: "visible", startMarginPx: 0, endMarginPx: 0, reverse: false },
    { id: "mask", kind: "mask", mode: "alpha",
      mask: { id: "mask-image", kind: "image", artifact: image, style: [], animation },
      content: { id: "content", kind: "box", children: [], style: [{ name: "background", value: "#ffffff" }] },
      style: [{ name: "width", value: "64px" }, { name: "height", value: "64px" }] },
  ] };
  const track = sealPresentVisualTrack({ id: "visual", timelineId: space.id, visualIr: "hypit.visual-ir@1",
    presents: [{ id: "later", span: { startFrame: 15, endFrameExclusive: 60 }, root }] });
  const compiled = compileHtmlProgram(sealComposition({ id: "animation", canvas: { width: 128, height: 128, clearColor: "#000000" }, visual: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [] }), space);
  const html = materializeHtmlProgram(compiled, artifact => artifact.resource === "res_font"
    ? "data:font/woff2;base64,AA==" : "data:image/png;base64,AA==");
  const browser = await puppeteer.launch({ executablePath: testBrowser(), headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    // Glyph appearance is irrelevant to this element-opacity test; the tiny invalid font
    // settles immediately. Font loading and painted text have separate integration coverage.
    await page.setContent(html);
    const valuesAt = async (target: typeof page, frame: number) => await target.evaluate(async frame => {
      await (window as typeof window & {
        __hypitFrameProgram: { applyFrame(frame: number): Promise<void> };
      }).__hypitFrameProgram.applyFrame(frame);
      const roots = ["flow", "path", "mask-image"].map(id => Number(getComputedStyle(document.querySelector(`[data-hypit-element-id="${id}"]`)!).opacity));
      const units = ["flow", "path"].map(id => Number(getComputedStyle(document.querySelector(`[data-hypit-element-id="${id}"] [data-hypit-text-unit-grapheme="0"]`)!).opacity));
      return { roots, units };
    }, frame);
    for (const frame of [30, 45, 15, 40, 30]) {
      const values = await valuesAt(page, frame);
      for (const value of values.roots) assert.ok(Math.abs(value - (frame - 15) / 30) < 0.001,
        `frame ${frame}: ${JSON.stringify(values)}`);
      for (const value of values.units) assert.ok(Math.abs(value - (1 - (frame - 15) / 30)) < 0.001,
        `frame ${frame}: ${JSON.stringify(values)}`);
    }
    for (const frame of [15, 30, 45]) {
      const fresh = await browser.newPage();
      try {
        await fresh.setContent(html);
        const values = await valuesAt(fresh, frame);
        for (const value of values.roots) assert.ok(Math.abs(value - (frame - 15) / 30) < 0.001,
          `fresh worker frame ${frame}: ${JSON.stringify(values)}`);
        for (const value of values.units) assert.ok(Math.abs(value - (1 - (frame - 15) / 30)) < 0.001,
          `fresh worker frame ${frame}: ${JSON.stringify(values)}`);
      } finally { await fresh.close(); }
    }
  } finally { await browser.close(); }
});
