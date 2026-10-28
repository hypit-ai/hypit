import {
  assertHtmlProgram,
  assertHtmlFrameIndex,
  assertHtmlFrameSpan,
  compileHtmlProgram,
  htmlAdjustment,
  htmlVisual,
  htmlProgramTime,
  materializeHtmlProgram,
} from "@hypit/html-program";
import type { FontArtifactRef } from "@hypit/media";
import { sealTimeline } from "@hypit/timeline";
import { audioGraphFromClips, sealAudioTrack, sealComposition, sealPresentVisualTrack, sealVisualTrack, visualElements, visualPresents, visualScopeTracks } from "@hypit/composition";
import type { Composition, VisualTrack } from "@hypit/composition";
import { VISUAL_IR_V1 } from "@hypit/composition";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { frameRangeFixture, frameSamplingMapFixture } from "../../../test/temporal-fixture.js";
import { exactTemporalValueFromFrames, exactTemporalZero, identityTemporalMap, isAffineTemporalMapPiece, sealTemporalMap } from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";

function directVideoSource(artifact: import("@hypit/hypit/protocol").BlobRef,
  sampling: TemporalMap) {
  return { source: artifact, streamIndex: 0, presentationStart: exactTemporalZero(),
    sourceDomain: structuredClone(sampling.stages.at(-1)!.source),
    interpretation: { codedWidth: 100, codedHeight: 100, sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const } };
}

const fixtureFont: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", resource: fixtureResource("html-program:fixture-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};

const scope = (...tracks: VisualTrack[]) => ({ members: tracks.map((track) => ({
  kind: "track" as const,
  id: track.id,
  track,
})) });
const replaceVisualTrack = (composition: Composition, id: string, track: VisualTrack): Composition => sealComposition({
  ...composition,
  visual: { members: composition.visual.members.map((member) => member.kind === "track" && member.track.id === id
    ? { kind: "track" as const, id: member.id, track }
    : member) },
});
const staticAdjustment = (filter: string) => htmlAdjustment({ keyframes: [{
  at: 0,
  filter,
  opacity: 1,
  transform: "none",
  transformOrigin: "50% 50%",
}] });

function fixture() {
  const timeline = sealTimeline({ id: "test-space", frameCount: 30, frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  const picture = {
    kind: "blob" as const,
    resource: fixtureResource("html-program:picture"),
    size: 10,
    mediaType: "image/png",
  };
  const sound = {
    kind: "blob" as const,
    resource: fixtureResource("html-program:sound"),
    size: 20,
    mediaType: "audio/wav",
  };
  const lower = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "lower",
    presents: [{
      id: "picture",
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: {
        id: "media",
        kind: "image",
        artifact: picture,
        style: [{ name: "width", value: "100%" }],
      },
    }],
  });
  const upper = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "upper",
    presents: [{
      id: "words",
      span: { startFrame: 3, endFrameExclusive: 20 },
      root: { id: "root", kind: "box", children: [
        { id: "text", kind: "text", text: "Hello <world>", fonts: [fixtureFont], style: [],
          paints: [
            { kind: "stroke", placement: "outside", widthPx: 2,
              paint: { kind: "solid", color: "#000000" } },
            { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
          ],
        },
      ], style: [{ name: "position", value: "absolute" }] },
    }],
  });
  const audio = sealAudioTrack({ timelineId: "test-space",
    id: "sound",
    graph: audioGraphFromClips([{
      id: "main",
      source: (() => {
        const domain = { id: "fixture-materialization", duration: exactTemporalValueFromFrames(48_000,
          { frameRate: { numerator: 48_000, denominator: 1 } }) };
        return { source: sound, streamIndex: 0, presentationStart: exactTemporalZero(),
          sourceDomain: domain, interpretation: { sampleRate: 48_000, channels: 2 } };
      })(),
      preparation: (() => {
        const domain = { id: "fixture-materialization", duration: exactTemporalValueFromFrames(48_000,
          { frameRate: { numerator: 48_000, denominator: 1 } }) };
        return identityTemporalMap(domain);
      })(),
      target: frameRangeFixture(0, 48_000, { numerator: 48_000, denominator: 1 }),
      sampling: frameSamplingMapFixture({ targetFrameRate: { numerator: 48_000, denominator: 1 }, targetFrames: 48_000,
        sourceFrameRate: { numerator: 48_000, denominator: 1 }, sourceFrames: 48_000,
        pieces: [{ target: { startFrame: 0, endFrameExclusive: 48_000 },
        sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 },
        }] }),
      gain: 1,
      fadeIn: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      fadeOut: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    }]),
  });
  const composition = sealComposition({
    id: "main",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(lower, upper),
    audio: [audio],
  });
  return { composition, picture, sound, timeline };
}

test("HTML renderer flattens generic peer visual Track Presents without absorbing audio rendering", () => {
  const { composition, picture, sound, timeline } = fixture();
  const document = compileHtmlProgram(composition, timeline);
  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.equal(document.visualIr, VISUAL_IR_V1);
  assert.deepEqual(new Set(document.artifacts.map(({ artifact }) => artifact.resource)),
    new Set([picture.resource, fixtureFont.sources[0]!.artifact.resource]));
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === fixtureFont.sources[0]!.artifact.resource)?.usage,
    { kind: "always" });
  const pictureId = document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)!.id;
  assert.ok(document.html.includes(`data-hypit-artifact-src="hypit-artifact://${pictureId}"`));
  assert.doesNotMatch(document.html, /<img\b[^>]*\ssrc=/u,
    "compiler-owned images stay inert until the page applies its render selection");
  assert.ok(document.html.indexOf('data-hypit-occurrence-path="[&quot;lower&quot;]"')
    < document.html.indexOf('data-hypit-occurrence-path="[&quot;upper&quot;]"'));
  assert.equal((document.html.match(/class="hypit-visual-present"/gu) ?? []).length, 2);
  assert.doesNotMatch(document.html, /<audio/u);
  assert.doesNotMatch(document.html, new RegExp(sound.resource, "u"));
  assert.doesNotMatch(document.html, /isolation:isolate|hypit-visual-track/u);
  assert.match(document.html, /Hello &lt;world&gt;/u);
  assert.match(document.html, /display:inline-grid/u);
  assert.doesNotMatch(document.html, /display:inline-grid;padding:/u);
  assert.match(document.html, /-webkit-text-stroke:4px #000000/u);
  assert.doesNotMatch(document.html, /<feMorphology/u);
  assert.doesNotMatch(document.html, /speech-visual-track|caption-track/u);
});

test("HTML renderer preserves independent input clocks inside a Visual Process", () => {
  const { composition, timeline } = fixture();
  const processTrack = sealVisualTrack({
    timelineId: timeline.id,
    visualIr: VISUAL_IR_V1,
    id: "process",
    items: [{
      kind: "process",
      id: "handoff",
      span: { startFrame: 10, endFrameExclusive: 20 },
      inputs: [{
        name: "outgoing",
        contribution: {
          kind: "present",
          id: "outgoing",
          span: { startFrame: 0, endFrameExclusive: 20 },
          root: { kind: "box", id: "outgoing-root", style: [], children: [] },
        },
      }, {
        name: "incoming",
        contribution: {
          kind: "present",
          id: "incoming",
          span: { startFrame: 10, endFrameExclusive: 30 },
          root: { kind: "box", id: "incoming-root", style: [], children: [] },
        },
      }],
      program: htmlVisual({
        html: "<div>{{outgoing}}{{incoming}}</div>",
        setup: "return localFrame => { root.dataset.localFrame = String(localFrame); };",
      }),
    }],
  });
  const document = compileHtmlProgram(sealComposition({
    ...composition,
    visual: scope(processTrack),
  }), timeline);
  assert.match(document.html, /data-hypit-process-id="handoff"/u);
  assert.match(document.html, /data-hypit-present-id="outgoing"[^>]*data-hypit-contribution-start-frame="0"/u);
  assert.match(document.html, /data-hypit-present-id="incoming"[^>]*data-hypit-contribution-start-frame="10"/u);
  assert.match(document.html, /new Function\('root', 'data', 'context'/u);
});

test("Programme-local Artifact ids do not depend on Resource-id substring order", () => {
  const timeline = sealTimeline({ id: "artifact-prefix", frameCount: 1, frameRate: { numerator: 1, denominator: 1 } });
  const artifacts: readonly import("@hypit/hypit/protocol").BlobRef[] = [
    { kind: "blob" as const, resource: "res_prefix", size: 1, mediaType: "image/png" },
    { kind: "blob" as const, resource: "res_prefix_long", size: 1, mediaType: "image/png" },
  ];
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,
    visualIr: VISUAL_IR_V1,
    id: "pictures",
    presents: artifacts.map((artifact, index) => ({
      id: `picture-${index}`,
      span: { startFrame: 0, endFrameExclusive: 1 },
      root: { id: `image-${index}`, kind: "image" as const, artifact, style: [] },
    })),
  });
  const document = compileHtmlProgram(sealComposition({
    id: "artifact-prefix",
    canvas: { width: 1, height: 1, clearColor: "#000000" },
    visual: scope(track),
    audio: [],
  }), timeline);
  const ids = document.artifacts.map((entry) => entry.id);
  assert.equal(ids.length, 2);
  for (const id of ids) assert.ok(document.html.includes(`hypit-artifact://${id}`));
  assert.doesNotMatch(document.html, /hypit-artifact:\/\/res_prefix/u);
});

test("one VisualTrack paints by declaration order rather than item identity", () => {
  const timeline = sealTimeline({
    id: "paint-order",
    frameCount: 30,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const visualTrack = (id: string, ids: readonly string[]) => sealPresentVisualTrack({
    timelineId: timeline.id,
    visualIr: VISUAL_IR_V1,
    id,
    presents: ids.map(id => ({
      id,
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id: "root", kind: "box", children: [], style: [] },
    })),
  });
  const composition = sealComposition({
    id: "paint-order",
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
    visual: { members: [
      { kind: "track", id: "b", track: visualTrack("track-b", ["z-first", "a-second"]) },
    ] }, audio: [],
  });

  const html = compileHtmlProgram(composition, timeline).html;
  const first = html.indexOf('data-hypit-present-id="z-first"');
  const second = html.indexOf('data-hypit-present-id="a-second"');
  assert.ok(first >= 0 && first < second);
  assert.doesNotMatch(html, /data-hypit-z=/u);
});

test("one VisualTrack value renders at each distinct visual occurrence path", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual).find((track) => track.id === "lower")!;
  const reused = sealComposition({
    ...composition,
    visual: { members: [
      { kind: "track", id: "background", track: lower },
      { kind: "stack", id: "inset", scope: { members: [
        { kind: "track", id: "picture", track: lower },
      ] } },
    ] },
    audio: [],
  });
  const html = compileHtmlProgram(reused, timeline).html;
  assert.match(html, /data-hypit-occurrence-path="\[&quot;background&quot;\]"/u);
  assert.match(html, /data-hypit-occurrence-path="\[&quot;inset&quot;,&quot;picture&quot;\]"/u);
  const elementIds = [...html.matchAll(/<img id="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(elementIds.length, 2);
  assert.equal(new Set(elementIds).size, 2);
});

test("shared glyph filter definitions live outside temporal Present capture roots", () => {
  const { composition, timeline } = fixture();
  const changed = structuredClone(composition);
  const upper = visualScopeTracks(changed.visual).find((track) => track.id === "upper");
  assert.ok(upper !== undefined);
  const text = visualElements(visualPresents(upper)[0]!.root).find(element => element.kind === "text");
  assert.ok(text?.kind === "text");
  Object.assign(text, { paints: [
    { kind: "glow", paint: { kind: "solid", color: "#ff00ff" }, blurPx: 4, spreadPx: 1 },
    { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
  ] });
  const html = compileHtmlProgram(changed, timeline).html;
  const definitions = html.indexOf("data-hypit-document-definitions");
  const present = html.indexOf('class="hypit-visual-present"');
  assert.ok(definitions >= 0 && definitions < present);
  assert.equal((html.match(/<filter id="hypit-/gu) ?? []).length, 1);
  assert.equal((html.match(/filter:url\(#hypit-/gu) ?? []).length, 1);
});

test("HTML renderer folds Adjustments around the accumulated picture in visual stack order", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual).find((track) => track.id === "lower");
  assert.ok(lower !== undefined);
  const adjusted = sealVisualTrack({
    timelineId: lower.timelineId,
    visualIr: lower.visualIr,
    id: lower.id,
    items: [...lower.items,
      {
        kind: "adjustment",
        id: "soften",
        span: { startFrame: 0, endFrameExclusive: 30 },
        program: staticAdjustment("blur(4px)"),
      },
      {
        kind: "adjustment",
        id: "grade",
        span: { startFrame: 4, endFrameExclusive: 24 },
        visibility: [{ startFrame: 6, endFrameExclusive: 20 }],
        program: staticAdjustment("saturate(1.2) contrast(1.05)"),
      },
    ],
  });
  const value = replaceVisualTrack(composition, lower.id, adjusted);
  const html = compileHtmlProgram(value, timeline).html;
  const grade = html.indexOf('data-hypit-adjustment-id="grade"');
  const soften = html.indexOf('data-hypit-adjustment-id="soften"');
  const clear = html.indexOf("data-hypit-canvas-clear");
  const picture = html.indexOf('data-hypit-present-id="picture"');
  const words = html.indexOf('data-hypit-present-id="words"');
  assert.ok(grade >= 0 && grade < soften && soften < clear && clear < picture && picture < words,
    "later Adjustments wrap the earlier picture while later Presents remain outside");
  assert.match(html, /blur\(4px\)/u);
  assert.match(html, /saturate\(1\.2\) contrast\(1\.05\)/u);
  assert.match(html, /htmlCreateFrameWorkIndex/u);
});

test("recursive Visual Stack closes child compositing before entering its parent sequence", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual).find((candidate) => candidate.id === "lower");
  const upper = visualScopeTracks(composition.visual).find((candidate) => candidate.id === "upper");
  assert.ok(lower !== undefined && upper !== undefined);
  const adjustedUpper = sealVisualTrack({
    ...upper,
    items: [...upper.items, {
      kind: "adjustment",
      id: "child-grade",
      span: { startFrame: 0, endFrameExclusive: 30 },
      program: staticAdjustment("contrast(1.1)"),
    }],
  });
  const nested = sealComposition({
    ...composition,
    visual: { members: [
      { kind: "track", id: "lower", track: lower },
      { kind: "stack", id: "foreground", scope: scope(adjustedUpper) },
    ] },
  });
  const html = compileHtmlProgram(nested, timeline).html;
  const clear = html.indexOf("data-hypit-canvas-clear");
  const picture = html.indexOf('data-hypit-present-id="picture"');
  const stack = html.indexOf('data-hypit-stack-id="foreground"');
  const adjustment = html.indexOf('data-hypit-adjustment-id="child-grade"');
  const words = html.indexOf('data-hypit-present-id="words"');
  assert.ok(clear < picture && picture < stack && stack < adjustment && adjustment < words);
  assert.equal((html.match(/data-hypit-stack-id=/gu) ?? []).length, 1);
});

test("HTML renderer rejects an Adjustment programme owned by another renderer", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual).find((track) => track.id === "lower");
  assert.ok(lower !== undefined);
  const adjusted = sealVisualTrack({
    timelineId: lower.timelineId,
    visualIr: lower.visualIr,
    id: lower.id,
    items: [...lower.items, {
      kind: "adjustment",
      id: "grade",
      span: { startFrame: 0, endFrameExclusive: 30 },
      program: { format: "example.color-grade@1", payload: { exposure: 0.25 }, artifacts: [] },
    }],
  });
  const value = replaceVisualTrack(composition, lower.id, adjusted);
  assert.throws(() => compileHtmlProgram(value, timeline),
    /does not support Visual Adjustment format example\.color-grade@1/u);
});

test("HTML Adjustment activity is an absolute-frame function across arbitrary seeks", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlAdjustmentScript } = await import("../src/html-adjustment.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const element = { style: { filter: "uninitialized" } };
  const peer = { style: { filter: "uninitialized" } };
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  const window_: {
    addEventListener: (_name: string, callback: typeof seek) => void;
    __hypitSetAdjustmentBypassed?: (path: readonly string[], id: string, bypassed: boolean) => boolean;
  } = { addEventListener: (_name, callback) => { seek = callback; } };
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlAdjustmentScript([{
    id: "grade",
    occurrencePath: ["left"],
    adjustmentId: "grade",
    startFrame: 4,
    endFrameExclusive: 24,
    visibility: [{ startFrame: 6, endFrameExclusive: 10 }, { startFrame: 16, endFrameExclusive: 20 }],
    keyframes: [{ at: 0, filter: "blur(4px)", opacity: 1, transform: "none", transformOrigin: "50% 50%" }],
  }, {
    id: "peer-grade",
    occurrencePath: ["right"],
    adjustmentId: "grade",
    startFrame: 4,
    endFrameExclusive: 24,
    keyframes: [{ at: 0, filter: "contrast(1.1)", opacity: 1, transform: "none", transformOrigin: "50% 50%" }],
  }])}`, {
    document: { getElementById: (id: string) => id === "grade" ? element : peer },
    window: window_,
  });
  assert.equal(element.style.filter, "none");
  seek({ detail: { frame: 17 } });
  assert.equal(element.style.filter, "blur(4px)");
  seek({ detail: { frame: 12 } });
  assert.equal(element.style.filter, "none");
  seek({ detail: { frame: 7 } });
  assert.equal(element.style.filter, "blur(4px)");
  assert.equal(peer.style.filter, "contrast(1.1)");
  assert.equal(window_.__hypitSetAdjustmentBypassed?.(["left"], "grade", true), true);
  assert.equal(element.style.filter, "none");
  assert.equal(peer.style.filter, "contrast(1.1)");
  seek({ detail: { frame: 8 } });
  assert.equal(element.style.filter, "none");
  assert.equal(window_.__hypitSetAdjustmentBypassed?.(["left"], "grade", false), true);
  assert.equal(element.style.filter, "blur(4px)");
  assert.equal(window_.__hypitSetAdjustmentBypassed?.(["missing"], "grade", true), false);
  seek({ detail: { frame: 24 } });
  assert.equal(element.style.filter, "none");
});

test("HTML Adjustment samples dynamic effect keyframes on occurrence-local progress", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlAdjustmentScript } = await import("../src/html-adjustment.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const element = { style: { filter: "uninitialized", opacity: "1", transform: "none", transformOrigin: "50% 50%" } };
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  let animationCount = 0;
  class Effect {
    constructor(readonly target: typeof element, readonly keyframes: readonly Record<string, string | number>[]) {}
  }
  class AnimationProbe {
    constructor(readonly effect: Effect) { animationCount += 1; }
    pause() {}
    cancel() {}
    set currentTime(value: number) {
      const state = this.effect.keyframes.find(({ offset }) => offset === value / 1000);
      if (state === undefined) throw new Error(`Fixture has no exact state at ${value}.`);
      this.effect.target.style.filter = String(state.filter);
      this.effect.target.style.opacity = String(state.opacity);
      this.effect.target.style.transform = String(state.transform);
      this.effect.target.style.transformOrigin = String(state.transformOrigin);
    }
  }
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlAdjustmentScript([{
    id: "pulse",
    occurrencePath: ["scope"],
    adjustmentId: "pulse",
    startFrame: 10,
    endFrameExclusive: 13,
    keyframes: [
      { at: 0, filter: "blur(0px)", opacity: 1, transform: "none", transformOrigin: "50% 50%" },
      { at: 0.5, filter: "blur(12px)", opacity: 1, transform: "none", transformOrigin: "50% 50%" },
      { at: 1, filter: "blur(0px)", opacity: 1, transform: "none", transformOrigin: "50% 50%" },
    ],
  }])}`, {
    Animation: AnimationProbe,
    KeyframeEffect: Effect,
    document: { getElementById: () => element, timeline: {} },
    getComputedStyle: () => element.style,
    window: { addEventListener: (_name: string, callback: typeof seek) => { seek = callback; } },
  });
  assert.equal(animationCount, 1);
  seek({ detail: { frame: 10 } });
  assert.equal(element.style.filter, "blur(0px)");
  seek({ detail: { frame: 11 } });
  assert.equal(element.style.filter, "blur(12px)");
  seek({ detail: { frame: 12 } });
  assert.equal(element.style.filter, "blur(0px)");
  assert.equal(animationCount, 1);
});

test("Text shrink preserves authored hug sizing and trims metrics inside the content box", () => {
  const timeline = sealTimeline({
    id: "text-space",
        frameCount: 30, frameRate: { numerator: 30, denominator: 1 },
  });
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1",
    id: "text",
    presents: [{
      id: "title",
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id: "root", kind: "box", style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }], children: [
        {
          id: "flow",
          kind: "text-flow",
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
          document: { paragraphs: [{
            id: "title",
            inlines: [
              { kind: "text", id: "first", text: "RANKING THE BEST" },
              { kind: "break", id: "break" },
              { kind: "text", id: "second", text: "FOOTBALLERS" },
            ],
          }] },
          typography: {
            fonts: [fixtureFont],
            sizePx: 44,
            weight: 700,
            style: "normal",
            axes: [],
            features: [],
            synthesis: "none",
            kerning: "auto",
            trackingPx: 0,
            wordSpacingPx: 0,
            lineHeight: 1,
            direction: "auto",
            writingMode: "horizontal-tb",
            baselineShiftPx: 0,
            tabSize: 4,
            indentationPx: 0,
            paragraphBeforePx: 0,
            paragraphAfterPx: 0,
            transform: "none",
            variantCaps: "normal",
            verticalAlign: "baseline",
            decorations: [],
            cjk: { textSpacing: "normal", punctuationTrim: "none" },
          },
          paints: [
            { kind: "fill", paint: { kind: "solid", color: "#090a0f" } },
            {
              kind: "box",
              target: "content",
              continuity: "isolated",
              decoration: {
                fill: { kind: "solid", color: "#f1eee6" },
                paddingPx: { top: 4, right: 0, bottom: 4, left: 0 },
                radiiPx: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
                shadows: [],
              },
            },
          ],
          flow: {
            form: { kind: "area" },
            inlineSize: "fixed",
            blockSize: "hug",
            paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
            inlineAlign: "center",
            blockAlign: "center",
            wrap: "none",
            overflow: "shrink",
            maxLines: 2,
            minimumScale: 0.9,
            clipToFrame: false,
            columns: 1,
            columnGapPx: 0,
            metricEdge: "cap-height",
          },
          sequences: [],
        },
      ] },
    }],
  });
  const document = compileHtmlProgram(sealComposition({
    id: "text-boxes",
    canvas: { width: 720, height: 1280, clearColor: "#000000" },
    visual: scope(track), audio: [],
  }), timeline);

  assert.match(document.html, /data-hypit-text-flow data-hypit-text-overflow="shrink" data-hypit-text-inline-size="fixed" data-hypit-text-block-size="hug"/u);
  assert.match(document.html, /flex-shrink:0/u);
  assert.match(document.html, /height:max-content/u);
  assert.match(document.html, /data-hypit-text-metrics style="display:block;text-box-trim:trim-both;text-box-edge:cap alphabetic"/u);
  assert.match(document.html, /flow\.style\.height = blockSize === 'fixed' \? String\(100 \/ scale\) \+ '%' : 'max-content'/u);
  assert.doesNotMatch(document.html, /flow\.style\.height = String\(100 \/ scale\) \+ '%'/u);
});

test("visual Artifact placeholders are materialized only by the Runtime boundary", () => {
  const { composition, picture, sound, timeline } = fixture();
  const document = compileHtmlProgram(composition, timeline);
  assert.match(document.html, /hypit-artifact:\/\/artifact-/u);
  assert.doesNotMatch(document.html, new RegExp(picture.resource, "u"));
  const resolved = materializeHtmlProgram(document,
    (artifact) => `https://assets.example/${artifact.resource}?x=1&y=2`);
  assert.doesNotMatch(resolved, /hypit-artifact:\/\//u);
  assert.match(resolved, new RegExp(`https://assets\\.example/${picture.resource}\\?x=1&amp;y=2`, "u"));
  assert.doesNotMatch(resolved, new RegExp(sound.resource, "u"));
  assert.equal(document.html.includes("assets.example"), false, "materialization must not mutate the compiled document");
});

test("HtmlProgram carries the complete render facts needed by a Provider", () => {
  const { composition, timeline } = fixture();
  const document = compileHtmlProgram(composition, timeline);
  assert.deepEqual(document.frameRate, { numerator: 30_000, denominator: 1_001 });
  assert.equal(document.frameCount, 30);
  assert.deepEqual(document.canvas, { width: 1080, height: 1920 });
  assert.match(document.html, /data-hypit-frame-numerator="30000"/u);
  assert.match(document.html, /data-hypit-frame-denominator="1001"/u);
  assert.match(document.html, /data-hypit-frame-count="30"/u);
  assert.equal(htmlProgramTime.frameSeconds(30, 30_000, 1_001), "1.001");
  assert.equal(htmlProgramTime.fpsDecimal(30_000, 1_001), "29.970029970029");
});

test("any legal frame and Provider-owned chunk can be addressed without traversing earlier frames", () => {
  const fixtureValue = fixture();
  const document = compileHtmlProgram(fixtureValue.composition, fixtureValue.timeline);
  assert.doesNotThrow(() => assertHtmlFrameIndex(document, 0));
  assert.doesNotThrow(() => assertHtmlFrameIndex(document, 17));
  assert.doesNotThrow(() => assertHtmlFrameIndex(document, 29));
  assert.throws(() => assertHtmlFrameIndex(document, -1), /outside/u);
  assert.throws(() => assertHtmlFrameIndex(document, 30), /outside/u);

  const chunks = [
    { startFrame: 0, endFrameExclusive: 7 },
    { startFrame: 7, endFrameExclusive: 14 },
    { startFrame: 14, endFrameExclusive: 21 },
    { startFrame: 21, endFrameExclusive: 28 },
    { startFrame: 28, endFrameExclusive: 30 },
  ];
  for (const chunk of chunks) assert.doesNotThrow(() => assertHtmlFrameSpan(document, chunk));
  assert.equal(chunks[0]?.startFrame, 0);
  assert.equal(chunks.at(-1)?.endFrameExclusive, document.frameCount);
  assert.equal(chunks.reduce((frames, chunk) => frames + chunk.endFrameExclusive - chunk.startFrame, 0), document.frameCount);
  assert.throws(
    () => assertHtmlFrameSpan(document, { startFrame: 29, endFrameExclusive: 31 }),
    /outside/u,
  );
});

test("HTML renderer emits compact absolute-frame animation without creating a Track stacking context", async () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual).find((track) => track.id === "lower");
  assert(lower !== undefined);
  const present = visualPresents(lower)[0]!;
  const media = present.root;
  const animated = sealPresentVisualTrack({...lower,
    presents: [{
      ...present,
      root: {
        ...media,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(100%)" }] },
            { atFrame: 10, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0%)" }] },
            { atFrame: 30, style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0%)" }] },
          ],
        },
      },
    }],
  });
  const document = compileHtmlProgram(replaceVisualTrack(composition, "lower", animated), timeline);
  assert.match(document.html, /@keyframes hypit-/u);
  assert.match(document.html, /33\.333333333%\{opacity:1;transform:translateY\(0%\)/u);
  assert.match(document.html, /animation-duration:1\.001s/u);
  assert.match(document.html, /100%\{opacity:1;transform:translateY\(0%\)\}/u);
  assert.match(document.html, /htmlCreateFrameWorkIndex/u);
  assert.match(document.html, /new Animation\(new KeyframeEffect\(/u);
  assert.doesNotMatch(document.html, /const frames = \[\]/u, "poses are evaluated per seek, not tabulated per Present frame");
  assert.doesNotMatch(document.html, /\.animate\(/u, "HTML renderer' waapi adapter tracks Element.animate");
  assert.doesNotMatch(document.html, /isolation:isolate/u);

  const marker = document.html.indexOf("const millisecondsPerFrame");
  assert.ok(marker >= 0);
  const scriptStart = document.html.lastIndexOf("<script>", marker) + "<script>".length;
  const scriptEnd = document.html.indexOf("</script>", marker);
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const runtime = `${frameWorkIndexRuntime}\n${document.html.slice(scriptStart, scriptEnd)}`;
  const toFrame = (milliseconds: number) => Math.round(milliseconds * 30 / 1_001);
  // The test page advances every animation that remains live after Hypit's
  // seek handler. This is the collision which made later Presents use absolute
  // composition time even though Hypit had first applied a local pose.
  const evaluate = async (
    spans: readonly { readonly start: number; readonly duration: number }[],
    frames: readonly number[],
    selection?: readonly { readonly startFrame: number; readonly endFrameExclusive: number }[],
  ) => {
    const { runInNewContext } = await import("node:vm");
    type FakeElement = { pose: number | undefined; readonly style: Record<string, unknown> };
    type FakeAnimation = { readonly target: FakeElement; currentTime: number; pause(): void; cancel(): void };
    const positions = spans.map((): number[] => []);
    const live = new Set<FakeAnimation>();
    let materialized = 0;
    let unpausedProbes = 0;
    let staleUnderlying = 0;
    let seek: (event: { detail: { frame: number } }) => void = () => {};
    const animate = (target: FakeElement, record?: number[], effect?: object, kind?: "probe"): FakeAnimation => {
      let paused = false;
      const animation = {
        target,
        effect,
        set currentTime(value: number) {
          if (kind === "probe") {
            if (!paused) unpausedProbes += 1;
            if (String(target.style.opacity) !== "authored") staleUnderlying += 1;
          }
          record?.push(toFrame(value));
          target.pose = toFrame(value);
        },
        pause() { paused = true; },
        cancel() {
          live.delete(animation);
          target.pose = undefined;
        },
      };
      live.add(animation);
      return animation;
    };
    const elements = spans.map((span) => {
      const element = {
        pose: undefined as number | undefined,
        style: { opacity: "authored" } as Record<string, unknown>,
        getBoundingClientRect() {},
        getAnimations: () => [...live].filter((animation) => animation.target === element),
        getAttribute: (name: string) => String(name.endsWith("start-frame") ? span.start : span.duration),
      };
      animate(element, undefined, {
        getKeyframes: () => {
          materialized += 1;
          return [
            { offset: 0, computedOffset: 0, easing: "linear", composite: "auto", opacity: "0" },
            { offset: 1, computedOffset: 1, easing: "linear", composite: "auto", opacity: String(span.duration) },
          ];
        },
        getTiming: () => ({ duration: span.duration * 1_001 / 30, fill: "both" }),
      });
      return element;
    });
    runInNewContext(`${runtime}
      htmlPrepareFrameSelection(${JSON.stringify(selection)});
      for (const initialize of htmlFrameProgramInitializers) initialize();`, {
      document: { querySelectorAll: () => elements, documentElement: { getBoundingClientRect() {} }, timeline: {} },
      window: { addEventListener(_name: string, callback: typeof seek) { seek = callback; } },
      KeyframeEffect: class {
        readonly target: FakeElement;
        constructor(target: FakeElement) { this.target = target; }
      },
      Animation: function (effect: { target: FakeElement }) {
        return animate(effect.target, positions[elements.indexOf(effect.target as typeof elements[number])], undefined, "probe");
      },
      getComputedStyle: (element: FakeElement) => ({ opacity: String(element.pose) }),
    });
    for (const frame of frames) {
      seek({ detail: { frame } });
      for (const animation of live) animation.currentTime = frame * 1_001 / 30;
    }
    const shown = elements.map((element) => element.pose === undefined ? element.style.opacity : String(element.pose));
    return { materialized, live: live.size, positions, shown, staleUnderlying, unpausedProbes };
  };
  assert.deepEqual(await evaluate([{ start: 15, duration: 30 }], [30, 44, 15, 45, 60]), {
    materialized: 1,
    live: 0,
    positions: [[15, 29, 0]],
    shown: ["0"],
    staleUnderlying: 0,
    unpausedProbes: 0,
  }, "every seek restores authored underlying values and pauses its probe before seeking");
  assert.deepEqual(await evaluate([{ start: 15, duration: 30 }], [30]), {
    materialized: 1, live: 0, positions: [[15]], shown: ["15"], staleUnderlying: 0, unpausedProbes: 0,
  },
    "a fresh worker derives the same middle pose without visiting preceding frames");
  assert.deepEqual(await evaluate([{ start: 30, duration: 60 }], [33, 60, 86]), {
    materialized: 1,
    live: 0,
    positions: [[3, 30, 56]],
    shown: ["56"],
    staleUnderlying: 0,
    unpausedProbes: 0,
  }, "a Present starting after frame 0 keeps its Present-relative pose when HTML renderer seeks live animations");
  assert.deepEqual(await evaluate([
    { start: 0, duration: 30 },
    { start: 90, duration: 30 },
  ], [100], [{ startFrame: 100, endFrameExclusive: 101 }]), {
    materialized: 1,
    live: 1,
    positions: [[], [10]],
    shown: ["100", "10"],
    staleUnderlying: 0,
    unpausedProbes: 0,
  }, "a selected render does not materialize animations from unrelated Presents");
  assert.deepEqual(await evaluate([
    { start: 0, duration: 5 },
    { start: 5, duration: 5 },
    { start: 3, duration: 5 },
    { start: 100, duration: 2 },
  ], [0, 3, 4, 5, 7, 8, 100, 101, 102, 6]), {
    materialized: 4,
    live: 0,
    positions: [
      [0, 3, 4],
      [0, 2, 3, 1],
      [0, 1, 2, 4, 3],
      [0, 1],
    ],
    shown: ["4", "1", "3", "1"],
    staleUnderlying: 0,
    unpausedProbes: 0,
  }, "the point index preserves overlap, half-open boundaries, distant spans and reverse seeks");
});

test("HTML renderer clips a long animation by Present visibility instead of rejecting it", () => {
  const { composition, timeline } = fixture();
  const lower = visualScopeTracks(composition.visual).find((track) => track.id === "lower");
  assert(lower !== undefined);
  const present = visualPresents(lower)[0]!;
  const media = present.root;
  const animated = sealPresentVisualTrack({...lower,
    presents: [{ ...present, root: { ...media, animation: { keyframes: [
      { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
      { atFrame: 45, style: [{ name: "opacity", value: 1 }] },
    ] } } }],
  });
  const document = compileHtmlProgram(replaceVisualTrack(composition, "lower", animated), timeline);
  assert.match(document.html, /animation-duration:1\.5015s/u);
  assert.match(document.html, /data-hypit-animation-sample-frames="30"/u);
  assert.doesNotMatch(document.html, /data-hypit-animation-properties|data-hypit-animation-duration-frames/u);
  assert.match(document.html, /100%\{opacity:1\}/u);
});

test("content-bound fonts and typed compositable Surfaces cross the same Artifact boundary", () => {
  const space = sealTimeline({ id: "test-space", frameCount: 30, frameRate: { numerator: 30, denominator: 1 },
  });
  const font: FontArtifactRef = {
    sources: [{ artifact: {
      kind: "blob",
      resource: fixtureResource("html-program:font"),
      size: 1_024,
      mediaType: "font/woff2",
    } }],
    weight: 700,
    style: "normal",
  };
  const surfaceResource = fixtureResource("html-program:alpha-surface");
  const track = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "bound-render-dependencies",
    presents: [{
      id: "bound",
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id: "root", kind: "box", style: [], children: [
        {
          id: "text",
          kind: "text",
          text: "SVML",
          fonts: [font],
          style: [{ name: "font-size", value: "72px" }],
        },
        {
          id: "surface",
          kind: "surface",
          surface: {
            artifact: { kind: "blob", resource: surfaceResource, size: 2_048, mediaType: "video/webm" },
            width: 1080,
            height: 1920,
            colorSpace: "srgb",
            alphaMode: "straight",
            timing: {
              kind: "frames",
              frameRate: { numerator: 30, denominator: 1 },
              frameCount: 30,
            },
          },
          sampling: frameSamplingMapFixture({
            targetFrameRate: space.frameRate, targetFrames: 30,
            sourceFrameRate: { numerator: 30, denominator: 1 }, sourceFrames: 30,
            pieces: [{
              target: { startFrame: 0, endFrameExclusive: 30 },
              sourceAtStart: { numerator: 0, denominator: 1 },
              rate: { numerator: 1, denominator: 1 },
            }],
          }),
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
        },
      ] },
    }],
  });
  const document = compileHtmlProgram(sealComposition({
    id: "render-dependencies",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: scope(track), audio: [],
  }), space);
  assert.doesNotThrow(() => assertHtmlProgram(document));
  assert.deepEqual(document.artifacts.map(({ artifact }) => artifact.resource), [font.sources[0]!.artifact.resource, surfaceResource].sort());
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === font.sources[0]!.artifact.resource)?.usage,
    { kind: "always" });
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === surfaceResource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.match(document.html, /@font-face\{/u);
  assert.match(document.html, /format\("woff2"\)/u);
  assert.match(document.html, /font-synthesis:none/u);
  assert.match(document.html, /data-hypit-alpha-mode="straight"/u);
  assert.match(document.html, /data-hypit-color-space="srgb"/u);
  const materialized = materializeHtmlProgram(document,
    (artifact) => `https://assets.example/${artifact.resource}?token=1&part=2`);
  assert.doesNotMatch(materialized, /hypit-artifact:\/\//u);
  assert.match(materialized, new RegExp(font.sources[0]!.artifact.resource, "u"));
  assert.match(materialized, new RegExp(surfaceResource, "u"));
});

test("exact timed sampling keeps a held frame as one compact interval without zero-rate browser media", () => {
  const timeline = sealTimeline({ id: "test-space", frameCount: 8, frameRate: { numerator: 30, denominator: 1 },
  });
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("html-program:sampled-video"),
    size: 1_000,
    mediaType: "video/mp4",
  };
  const track = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "sampled",
    presents: [{
      id: "sampled",
      span: { startFrame: 0, endFrameExclusive: 8 },
      root: (() => {
        const sampling = frameSamplingMapFixture({
          targetFrameRate: timeline.frameRate, targetFrames: 8,
          sourceFrameRate: { numerator: 30, denominator: 1 }, sourceFrames: 4,
          pieces: [
            { target: { startFrame: 0, endFrameExclusive: 6 }, sourceAtStart: { numerator: 2, denominator: 1 },
              rate: { numerator: 1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
            { target: { startFrame: 6, endFrameExclusive: 8 }, sourceAtStart: { numerator: 3, denominator: 1 },
              rate: { numerator: 0, denominator: 1 } },
          ],
        });
        return {
        id: "video",
        kind: "video",
        source: directVideoSource(artifact, sampling),
        muted: true,
        sampling,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      }; })(),
    }],
  });
  const document = compileHtmlProgram(sealComposition({
    id: "sampled",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
    visual: scope(track), audio: [],
  }), timeline);
  assert.equal((document.html.match(/data-hypit-sampling-part=/gu) ?? []).length, 0);
  assert.equal(document.videoSources.length, 1);
  assert.equal(document.videoSources[0]?.kind, "media");
  if (document.videoSources[0]?.kind !== "media") throw new Error("Expected direct media source");
  assert.equal(document.videoSources[0].sampling.stages[0]?.pieces.length, 2);
  assert.equal((document.html.match(/data-hypit-artifact-src="hypit-artifact:\/\//gu) ?? []).length, 1);
  assert.doesNotMatch(document.html, /<video\b[^>]*\ssrc=/u,
    "compiler-owned video stays inert while its exact slots remain statically readable");
  const heldPiece = document.videoSources[0].sampling.stages[0]?.pieces[1];
  assert.ok(heldPiece && isAffineTemporalMapPiece(heldPiece));
  assert.equal(heldPiece.rate.numerator, 0);
});

test("HTML terminal quantizes continuous sampling pieces without moving their source position", () => {
  const timeline = sealTimeline({ id: "partial-piece", frameCount: 3, frameRate: { numerator: 30, denominator: 1 } });
  const sourceFrameRate = { numerator: 24, denominator: 1 };
  const boundary = exactTemporalValueFromFrames(1, { frameRate: { numerator: 48, denominator: 1 } });
  const target = { id: "occurrence", duration: exactTemporalValueFromFrames(3, timeline) };
  const source = { id: "materialization", duration: exactTemporalValueFromFrames(3, { frameRate: sourceFrameRate }) };
  const sampling = sealTemporalMap({ stages: [{ target, source, pieces: [
    {
      target: { start: exactTemporalValueFromFrames(0, timeline), end: boundary },
      sourceAtStart: exactTemporalValueFromFrames(0, { frameRate: sourceFrameRate }),
      rate: { numerator: 1, denominator: 1 },
    },
    {
      target: { start: boundary, end: target.duration },
      sourceAtStart: boundary,
      rate: { numerator: 1, denominator: 1 },
    },
  ] }] });
  const track = sealPresentVisualTrack({ timelineId: timeline.id, visualIr: VISUAL_IR_V1, id: "partial-piece", presents: [{
    id: "partial-piece",
    span: { startFrame: 0, endFrameExclusive: 3 },
    root: {
      id: "video",
      kind: "video",
      source: directVideoSource({ kind: "blob", resource: fixtureResource("html-program:partial-piece"), size: 1, mediaType: "video/mp4" }, sampling),
      muted: true,
      sampling,
      style: [],
    },
  }] });
  const document = compileHtmlProgram(sealComposition({
    id: "partial-piece",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
    visual: scope(track),
    audio: [],
  }), timeline);
  assert.equal(document.videoSources.length, 1);
  assert.equal(document.videoSources[0]?.kind, "media");
  if (document.videoSources[0]?.kind !== "media") throw new Error("Expected direct media source");
  assert.deepEqual(document.videoSources[0].sampling, sampling);
});

test("a Track naming five takes still lowers to DOM identities a Windows path can hold", () => {
  // HTML renderer spends the video element's id as a directory name for that video's extracted
  // frames, under the Provider execution's private decoded-frame directory.
  // That surround is 103 characters of a 260-character budget, so the id is what decides whether
  // extraction can write at all. These identities are the ones a five-take speech Track produces:
  // the Track names every take, and the Present and the layer each repeat the Track.
  const trackId = "speech-visual:opening-monologue-take-1+opening-monologue-take-2"
    + "+opening-monologue-take-3+opening-monologue-take-4+opening-monologue-take-5";
  const presentId = `${trackId}:clip-1`;
  const timeline = sealTimeline({ id: "test-space", frameCount: 8, frameRate: { numerator: 30, denominator: 1 },
  });
  const track = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: trackId,
    presents: [{
      id: presentId,
      span: { startFrame: 0, endFrameExclusive: 8 },
      root: (() => {
        const sampling = frameSamplingMapFixture({
          targetFrameRate: timeline.frameRate, targetFrames: 8,
          sourceFrameRate: { numerator: 30, denominator: 1 }, sourceFrames: 8,
          pieces: [
            { target: { startFrame: 0, endFrameExclusive: 4 }, sourceAtStart: { numerator: 0, denominator: 1 }, rate: { numerator: 1, denominator: 1 } },
            { target: { startFrame: 4, endFrameExclusive: 8 }, sourceAtStart: { numerator: 4, denominator: 1 }, rate: { numerator: 1, denominator: 1 } },
          ],
        });
        return {
        id: `${presentId}:foreground`,
        kind: "video",
        source: directVideoSource({
          kind: "blob" as const,
          resource: fixtureResource("html-program:long-identity-video"),
          size: 1_000,
          mediaType: "video/mp4",
        }, sampling),
        muted: true,
        sampling,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      }; })(),
    }],
  });
  const document = compileHtmlProgram(sealComposition({
    id: "long-identity",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
    visual: scope(track), audio: [],
  }), timeline);

  // The `id` attribute only; `data-hypit-element-id` and friends are meant to stay readable.
  const identities = [...document.html.matchAll(/\sid="([^"]*)"/gu)].map((match) => match[1]!);
  assert.ok(identities.length > 0, "the document names something");
  assert.deepEqual(identities.filter((id) => id.length > 64), [],
    "a DOM identity does not grow with the number of takes its Track names");
  // The parts stay readable where a reader looks for them, spelled the way the author wrote them.
  assert.ok(document.html.includes(`data-hypit-occurrence-path="[&quot;${trackId}&quot;]"`));
  assert.ok(document.html.includes(`data-hypit-element-id="${presentId}:foreground"`));
});

test("HTML visuals own local HTML while retaining typed child resources and format boundaries", async () => {
  const { htmlVisual } = await import("../src/html-visual.js");
  const { timeline, picture } = fixture();
  const opaqueArtifact = { kind: "blob" as const, resource: fixtureResource("html-program:opaque-program"),
    size: 12, mediaType: "image/png" };
  const visual = sealPresentVisualTrack({ id: "scene", timelineId: timeline.id, visualIr: VISUAL_IR_V1,
    presents: [{ id: "scene", span: { startFrame: 0, endFrameExclusive: 30 },
      root: { id: "root", kind: "program", style: [], slots: [{ name: "photo", element: {
        id: "photo", kind: "image", artifact: picture, style: [],
      } }], program: htmlVisual({
        html: `<section class="viewport">{{photo}}<img class="opaque" src="hypit-artifact://${opaqueArtifact.resource}"><svg><path d="M0 0H20"/></svg></section>`,
        css: '.viewport { backdrop-filter:blur(4px); display:grid; }',
        setup: 'return frame => { root.dataset.frame = String(frame); };',
      }, [opaqueArtifact]) } }] });
  const composition = sealComposition({ id: "scene", canvas: { width: 200, height: 200, clearColor: "#000000" }, visual: scope(visual), audio: [] });
  const document = compileHtmlProgram(composition, timeline);
  assert.equal(document.artifacts.length, 2);
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === opaqueArtifact.resource)?.usage,
    { kind: "always" }, "opaque HtmlVisual dependencies remain conservative");
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.ok(document.html.includes('<section class="viewport">'));
  const opaqueId = document.artifacts.find(({ artifact }) => artifact.resource === opaqueArtifact.resource)!.id;
  const pictureId = document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)!.id;
  assert.ok(document.html.includes(`class="opaque" src="hypit-artifact://${opaqueId}"`),
    "opaque HtmlVisual structure keeps its authored HTML while declared locators use Programme identities");
  assert.ok(document.html.includes(`data-hypit-artifact-src="hypit-artifact://${pictureId}"`),
    "a typed child keeps the structural compiler's selection-gated resource behavior");
  assert.ok(document.html.includes('@scope'));
  const missing = structuredClone(composition);
  const root = visualScopeTracks(missing.visual)[0]!;
  const first = visualPresents(root)[0];
  if (first?.root.kind !== "program") throw new Error("fixture");
  const program = first.root.program;
  (program as { format: string }).format = "another.renderer@1";
  assert.throws(() => compileHtmlProgram(missing, timeline), /does not support visual program format/);
});

test("HTML visual state follows direct seeks and reports authored evaluation failures", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const root = { frame: -1 };
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  const window: { addEventListener: (name: string, callback: typeof seek) => void; __hypitHtmlVisualError?: string } = {
    addEventListener: (_name, callback) => { seek = callback; },
  };
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlVisualScript([{ id: "scene", startFrame: 30, durationFrames: 90,
    program: { html: "", setup: 'return frame => { if(frame===60) throw new Error("bad pose"); root.frame=frame; };' },
  }])}`, { window, document: { getElementById: () => root } });
  seek({ detail: { frame: 75 } });
  assert.equal(root.frame, 45);
  seek({ detail: { frame: 36 } });
  assert.equal(root.frame, 6);
  seek({ detail: { frame: 90 } });
  assert.match(window.__hypitHtmlVisualError!, /bad pose/);
});

test("inactive programs settle once, while re-entry and repeated active seeks still redraw ready assets", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const root = { frames: [] as number[], ready: false, painted: false };
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlVisualScript([{ id: "scene", startFrame: 30, durationFrames: 30,
    program: { html: "", setup: 'return frame => { root.frames.push(frame); root.painted=root.ready; };' },
  }])}`, { window: { addEventListener: (_: string, callback: typeof seek) => { seek = callback; } },
    document: { getElementById: () => root } });
  seek({ detail: { frame: 15 } });
  assert.deepEqual(root.frames, [0]);
  seek({ detail: { frame: 30 } });
  root.ready = true;
  seek({ detail: { frame: 30 } });
  assert.equal(root.painted, true);
  seek({ detail: { frame: 60 } });
  seek({ detail: { frame: 90 } });
  assert.deepEqual(root.frames, [0, 0, 0, 30]);
  seek({ detail: { frame: 45 } });
  seek({ detail: { frame: 15 } });
  assert.deepEqual(root.frames, [0, 0, 0, 30, 15, 0]);
});

test("sequential HtmlVisual work follows active and crossed spans instead of every visual", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const entries = Array.from({ length: 100 }, (_, index) => ({
    id: `scene-${index}`,
    startFrame: index * 10,
    durationFrames: 10,
    program: { html: "", setup: "return () => { root.calls += 1; };" },
  }));
  const roots = new Map(entries.map(entry => [entry.id, { calls: 0 }]));
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlVisualScript(entries)}`, {
    window: { addEventListener: (_: string, callback: typeof seek) => { seek = callback; } },
    document: { getElementById: (id: string) => roots.get(id) },
  });
  for (const root of roots.values()) root.calls = 0;
  for (let frame = 0; frame < 1_000; frame++) seek({ detail: { frame } });
  assert.equal([...roots.values()].reduce((sum, root) => sum + root.calls, 0), 1_099);
});

test("HTML visual setup is limited to Presents overlapping the render selection", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const roots = new Map([
    ["early", { setups: 0, renders: 0 }],
    ["selected", { setups: 0, renders: 0 }],
  ]);
  const entries = [
    { id: "early", startFrame: 0, durationFrames: 30,
      program: { html: "", setup: "root.setups += 1; return () => { root.renders += 1; };" } },
    { id: "selected", startFrame: 90, durationFrames: 30,
      program: { html: "", setup: "root.setups += 1; return () => { root.renders += 1; };" } },
  ];
  runInNewContext(`${frameWorkIndexRuntime}
    htmlPrepareFrameSelection([{ startFrame: 100, endFrameExclusive: 101 }]);
    ${htmlVisualScript(entries)}`, {
    window: { addEventListener() {} },
    document: { getElementById: (id: string) => roots.get(id) },
  });
  assert.deepEqual(roots.get("early"), { setups: 0, renders: 0 });
  assert.deepEqual(roots.get("selected"), { setups: 1, renders: 1 });
});

test("an asynchronous HTML visual reports its unsupported frame behavior instead of racing capture", async () => {
  const { runInNewContext } = await import("node:vm");
  const { htmlVisualScript } = await import("../src/html-visual.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const window = { addEventListener() {}, __hypitHtmlVisualError: undefined as string | undefined };
  runInNewContext(`${frameWorkIndexRuntime}\n${htmlVisualScript([{ id: "scene", startFrame: 0, durationFrames: 30,
    program: { html: "", setup: 'return async frame => { await Promise.resolve(); throw new Error("late drawing failure"); };' },
  }])}`, { window, document: { getElementById: () => ({}) } });
  assert.match(window.__hypitHtmlVisualError!, /must be synchronous/u);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(window.__hypitHtmlVisualError!, /late drawing failure/u);
});
