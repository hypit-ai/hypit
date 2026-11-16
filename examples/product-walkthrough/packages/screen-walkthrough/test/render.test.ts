import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { HtmlVisual } from "@hypit/html-program";
import type { SynchronizedMedia } from "@hypit/media";
import type { Timeline } from "@hypit/timeline";
import { composeTemporalWindow, projectProgramInstant } from "@hypit/temporal";
import { fixtureResource } from "../../../../../test/fixture-resource.js";
import { readWalkthroughTake, renderWalkthrough, SAMPLE_SOURCE, walkthroughMotion } from "../src/render.js";
import type { WalkthroughTake } from "../src/render.js";

const sample = runInNewContext(`(${SAMPLE_SOURCE})`) as (keys: number[][], frame: number) => number[];
const timeline: Timeline = { id: "program", frameCount: 300, frameRate: { numerator: 30, denominator: 1 } };
const point = (id: string, frame: number) => projectProgramInstant({ itemId: id, subjectId: id, timeline: { ...timeline },
  projection: { ref: "absolute", at: { unit: "frames", value: frame } } });
const windowOf = (id: string, start: number, end: number) => composeTemporalWindow({ id, subjectId: id }, point(id, start), point(id, end));
const media = (frameCount: number): SynchronizedMedia => ({
  frameDomain: { frameCount, frameRate: timeline.frameRate },
  visual: { artifact: { kind: "blob", resource: fixtureResource("walkthrough-take"), size: 1, mediaType: "video/mp4" } },
} as unknown as SynchronizedMedia);

const take: WalkthroughTake = readWalkthroughTake({
  passed: true, viewport: { width: 1280, height: 800, scale: 1 },
  steps: [
    { index: 0, action: "pause", start: 0, end: 0.8 },
    { index: 1, action: "click", start: 2, end: 2.3, pointer: [1180, 50], box: [1120, 30, 110, 40] },
    { index: 2, action: "type", start: 2.8, end: 4, pointer: [470, 176] },
    { index: 3, action: "click", start: 7, end: 7.3, pointer: [640, 400] },
  ],
}, "take.walkthrough.take");

test("a failed or malformed take is refused instead of presented", () => {
  assert.throws(() => readWalkthroughTake({ passed: false, viewport: take.viewport, steps: [] }, "t"), /failed take/);
  assert.throws(() => readWalkthroughTake({ passed: true, viewport: { width: 0, height: 1, scale: 1 }, steps: [] }, "t"), /viewport/);
  assert.throws(() => readWalkthroughTake({ passed: true, viewport: take.viewport, steps: [{ action: "click", start: 2, end: 1 }] }, "t"),
    /start and end/);
});

test("the cursor arrives where the recorder acted, presses follow, and the camera holds a run of nearby actions", () => {
  const motion = walkthroughMotion(take, (seconds) => Math.round(seconds * 30), 2);
  // Arrival frames carry the recorded pointer.
  assert.deepEqual(sample(motion.cursor, 60), [1180, 50]);
  assert.deepEqual(sample(motion.cursor, 84), [470, 176]);
  assert.deepEqual(sample(motion.cursor, 210), [640, 400]);
  assert.deepEqual(motion.presses, [66, 90, 216]);
  // Zoomed on the first action, clamped so the view stays inside the screen.
  const [scale, cx, cy] = sample(motion.camera, 60);
  assert.equal(scale, 2);
  assert.deepEqual([cx, cy], [1280 - 1280 / 4, 800 / 4]);
  // The click and typing are one group (pan, no zoom-out between them); the late click is a second group.
  assert.equal(sample(motion.camera, 75)[0], 2);
  assert.equal(sample(motion.camera, 170)[0], 1, "the camera lets go during the long pause");
  assert.equal(sample(motion.camera, 210)[0], 2);
  assert.equal(sample(motion.camera, 0)[0], 1);
  assert.deepEqual(walkthroughMotion(take, (s) => Math.round(s * 30), 1).camera, [[0, 1, 640, 400]], "zoom 1 never moves the camera");
});

test("a wide field stays whole in view: the camera zooms less and centres on the element", () => {
  // A phone take typing into a prompt field almost as wide as the screen (the OpenArt case).
  const phone = { passed: true, viewport: { width: 432, height: 768, scale: 2.5 }, duration: 4,
    steps: [{ index: 1, action: "type", start: 1, end: 3, pointer: [216, 330], box: [24, 270, 384, 140] as [number, number, number, number] }] };
  const [scale, cx] = sample(walkthroughMotion(phone, (s) => Math.round(s * 30), 1.4).camera, 40);
  assert.ok(scale > 1 && scale <= 432 * 0.92 / 384 + 1e-9, `scale ${scale} keeps the 384 px field inside the view`);
  assert.equal(cx, 216);
  // A small button still gets the full magnification.
  const button = { ...phone, steps: [{ ...phone.steps[0]!, action: "click", box: [180, 600, 72, 40] as [number, number, number, number] }] };
  assert.equal(sample(walkthroughMotion(button, (s) => Math.round(s * 30), 1.4).camera, 40)[0], 1.4);
});

test("motion stays locked to the footage when the recording starts later in the program", () => {
  const render = (sourceStart: number) => {
    const track = renderWalkthrough(timeline, { xPx: 0, yPx: 0, widthPx: 1280, heightPx: 720 }, windowOf("scene", 0, 300),
      media(240), windowOf("take", sourceStart, sourceStart + 240), take, { id: "demo", zoom: 1.6, cursor: true, stackingOrder: 0, layout: "card" as const });
    const program = track.presents[0]!.elements.find((element) => element.kind === "program")!;
    assert.equal(program.kind, "program");
    const video = track.presents[0]!.elements.find((element) => element.kind === "video")!;
    return { visual: program.program.payload as unknown as HtmlVisual, video };
  };
  const early = render(0), late = render(30);
  assert.equal(early.visual.html, late.visual.html);
  const presses = (visual: HtmlVisual) => (visual.data as { presses: number[] }).presses;
  assert.deepEqual(presses(late.visual), presses(early.visual).map((frame) => frame + 30));
  assert.equal(late.video.kind, "video");
  assert.deepEqual(late.video.kind === "video" && late.video.sourceTime?.pieces[0]?.target, { startFrame: 30, endFrameExclusive: 270 });
  assert.throws(() => renderWalkthrough(timeline, { xPx: 0, yPx: 0, widthPx: 1280, heightPx: 720 }, windowOf("scene", 0, 300),
    media(200), windowOf("take", 0, 240), take, { id: "demo", zoom: 1.6, cursor: true, stackingOrder: 0, layout: "card" as const }), /equal-length/);
});

test("full layout covers the Frame edge to edge; card leaves a framed margin", () => {
  const frame = { xPx: 0, yPx: 0, widthPx: 1080, heightPx: 1920 };
  const phone: WalkthroughTake = { viewport: { width: 540, height: 960, scale: 2 }, steps: take.steps };
  const data = (layout: "card" | "full") => {
    const track = renderWalkthrough(timeline, frame, windowOf("scene", 0, 300), media(240), windowOf("take", 0, 240), phone,
      { id: "demo", zoom: 1.4, cursor: true, stackingOrder: 0, layout });
    const program = track.presents[0]!.elements.find((element) => element.kind === "program")!;
    return program.kind === "program" ? program.program.payload as unknown as HtmlVisual : undefined;
  };
  const full = data("full")!, card = data("card")!;
  assert.deepEqual((full.data as { card: unknown }).card, { width: 1080, height: 1920 });
  assert.equal((full.data as { fit: number }).fit, 2);
  assert.doesNotMatch(full.css, /box-shadow/);
  assert.deepEqual((card.data as { card: unknown }).card, { width: 972, height: 1728 });
  assert.match(card.css, /box-shadow/);
});
