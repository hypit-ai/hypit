import {
  assertHyperframesDocument,
  assertHyperframesFrameIndex,
  assertHyperframesFrameSpan,
  compileHyperframesDocument,
  hyperframesTime,
  materializeHyperframesHtml,
} from "@hypit/hyperframes";
import type { FontArtifactRef } from "@hypit/media";
import { sealProgramSpace } from "@hypit/program-space";
import { sealAudioTrack, sealComposition, sealVisualTrack } from "@hypit/composition";
import type { Track } from "@hypit/composition";
import { VISUAL_IR_V1 } from "@hypit/visual-ir";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

const fixtureFont: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", resource: fixtureResource("hyperframes:fixture-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};

function fixture() {
  const programSpace = sealProgramSpace({ id: "test-space", durationSec: 1001 / 1000,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  const picture = {
    kind: "blob" as const,
    resource: fixtureResource("hyperframes:picture"),
    size: 10,
    mediaType: "image/png",
  };
  const sound = {
    kind: "blob" as const,
    resource: fixtureResource("hyperframes:sound"),
    size: 20,
    mediaType: "audio/wav",
  };
  const lower = sealVisualTrack({ programSpaceId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "lower",
    presents: [{
      id: "picture",
      span: { startFrame: 0, endFrameExclusive: 30 },
      stacking: { order: 10, tieBreak: "lower" },
      elements: [{
        id: "media",
        order: 0,
        kind: "image",
        artifact: picture,
        style: [{ name: "width", value: "100%" }],
      }],
    }],
  });
  const upper = sealVisualTrack({ programSpaceId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "upper",
    presents: [{
      id: "words",
      span: { startFrame: 3, endFrameExclusive: 20 },
      stacking: { order: 20, tieBreak: "upper" },
      elements: [
        { id: "root", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }] },
        { id: "text", parent: "root", order: 1, kind: "text", text: "Hello <world>", fonts: [fixtureFont], style: [],
          paints: [
            { kind: "stroke", placement: "outside", widthPx: 2,
              paint: { kind: "solid", color: "#000000" } },
            { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
          ],
        },
      ],
    }],
  });
  const audio = sealAudioTrack({ programSpaceId: "test-space",
    id: "sound",
    clips: [{
      id: "main",
      artifact: sound,
      target: { startSample: 0, endSampleExclusive: 48_000 },
      source: { sampleFrames: 48_000, startSample: 0, endSampleExclusive: 48_000, loop: false, phaseSample: 0 },
      playbackRate: 1,
      pitch: "preserve",
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    }],
  });
  const composition = sealComposition({
    id: "main",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [upper, audio, lower],
  });
  return { composition, picture, sound, programSpace };
}

test("HyperFrames flattens generic peer visual Track Presents without absorbing audio rendering", () => {
  const { composition, picture, sound, programSpace } = fixture();
  const document = compileHyperframesDocument(composition, programSpace);
  assert.doesNotThrow(() => assertHyperframesDocument(document));
  assert.equal(document.visualIr, VISUAL_IR_V1);
  assert.deepEqual(new Set(document.artifacts.map(({ artifact }) => artifact.resource)),
    new Set([picture.resource, fixtureFont.sources[0]!.artifact.resource]));
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === fixtureFont.sources[0]!.artifact.resource)?.usage,
    { kind: "always" });
  assert.ok(document.html.includes(`data-hypit-resource-src="hypit-resource://${picture.resource}"`));
  assert.doesNotMatch(document.html, /<img\b[^>]*\ssrc=/u,
    "compiler-owned images stay inert until the page applies its render selection");
  assert.ok(document.html.indexOf('data-hypit-track-id="lower"') < document.html.indexOf('data-hypit-track-id="upper"'));
  assert.equal((document.html.match(/class="clip hypit-visual-present"/gu) ?? []).length, 2);
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

test("shared glyph filter definitions live outside temporal Present capture roots", () => {
  const { composition, programSpace } = fixture();
  const changed = structuredClone(composition);
  const upper = changed.tracks.find(track => track.kind === "visual" && track.id === "upper");
  assert.ok(upper?.kind === "visual");
  const text = upper.presents[0]!.elements.find(element => element.kind === "text");
  assert.ok(text?.kind === "text");
  Object.assign(text, { paints: [
    { kind: "glow", paint: { kind: "solid", color: "#ff00ff" }, blurPx: 4, spreadPx: 1 },
    { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
  ] });
  const html = compileHyperframesDocument(changed, programSpace).html;
  const definitions = html.indexOf("data-hypit-document-definitions");
  const present = html.indexOf('class="clip hypit-visual-present"');
  assert.ok(definitions >= 0 && definitions < present);
  assert.equal((html.match(/<filter id="hypit-/gu) ?? []).length, 1);
  assert.equal((html.match(/filter:url\(#hypit-/gu) ?? []).length, 1);
});

test("Text shrink preserves authored hug sizing and trims metrics inside the content box", () => {
  const programSpace = sealProgramSpace({
    id: "text-space",
        durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const track = sealVisualTrack({
    programSpaceId: programSpace.id,
    visualIr: "hypit.visual-ir@1",
    id: "text",
    presents: [{
      id: "title",
      span: { startFrame: 0, endFrameExclusive: 30 },
      stacking: { order: 1, tieBreak: "title" },
      elements: [
        { id: "root", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }] },
        {
          id: "flow",
          parent: "root",
          order: 1,
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
      ],
    }],
  });
  const document = compileHyperframesDocument(sealComposition({
    id: "text-boxes",
    canvas: { width: 720, height: 1280, clearColor: "#000000" },
    tracks: [track],
  }), programSpace);

  assert.match(document.html, /data-hypit-text-flow data-hypit-text-overflow="shrink" data-hypit-text-inline-size="fixed" data-hypit-text-block-size="hug"/u);
  assert.match(document.html, /flex-shrink:0/u);
  assert.match(document.html, /height:max-content/u);
  assert.match(document.html, /data-hypit-text-metrics style="display:block;text-box-trim:trim-both;text-box-edge:cap alphabetic"/u);
  assert.match(document.html, /flow\.style\.height = blockSize === 'fixed' \? String\(100 \/ scale\) \+ '%' : 'max-content'/u);
  assert.doesNotMatch(document.html, /flow\.style\.height = String\(100 \/ scale\) \+ '%'/u);
});

test("visual Artifact placeholders are materialized only by the Runtime boundary", () => {
  const { composition, picture, sound, programSpace } = fixture();
  const document = compileHyperframesDocument(composition, programSpace);
  assert.match(document.html, /hypit-resource:\/\/res_/u);
  const resolved = materializeHyperframesHtml(document,
    (artifact) => `https://assets.example/${artifact.resource}?x=1&y=2`);
  assert.doesNotMatch(resolved, /hypit-resource:\/\//u);
  assert.match(resolved, new RegExp(`https://assets\\.example/${picture.resource}\\?x=1&amp;y=2`, "u"));
  assert.doesNotMatch(resolved, new RegExp(sound.resource, "u"));
  assert.equal(document.html.includes("assets.example"), false, "materialization must not mutate the compiled document");
});

test("HyperframesDocument carries render facts while its Record binds integrity", () => {
  const { composition, programSpace } = fixture();
  const document = compileHyperframesDocument(composition, programSpace);
  assert.equal("digest" in document, false);
  assert.deepEqual(document.frameRate, { numerator: 30_000, denominator: 1_001 });
  assert.equal(document.frameCount, 30);
  assert.deepEqual(document.canvas, { width: 1080, height: 1920 });
  assert.match(document.html, /data-fps="30000\/1001"/u);
  assert.match(document.html, /data-hypit-frame-count="30"/u);
  assert.equal(hyperframesTime.frameSeconds(30, 30_000, 1_001), "1.001");
  assert.equal(hyperframesTime.fpsDecimal(30_000, 1_001), "29.970029970029");
});

test("any legal frame and Provider-owned chunk can be addressed without traversing earlier frames", () => {
  const fixtureValue = fixture();
  const document = compileHyperframesDocument(fixtureValue.composition, fixtureValue.programSpace);
  assert.doesNotThrow(() => assertHyperframesFrameIndex(document, 0));
  assert.doesNotThrow(() => assertHyperframesFrameIndex(document, 17));
  assert.doesNotThrow(() => assertHyperframesFrameIndex(document, 29));
  assert.throws(() => assertHyperframesFrameIndex(document, -1), /outside/u);
  assert.throws(() => assertHyperframesFrameIndex(document, 30), /outside/u);

  const chunks = [
    { startFrame: 0, endFrameExclusive: 7 },
    { startFrame: 7, endFrameExclusive: 14 },
    { startFrame: 14, endFrameExclusive: 21 },
    { startFrame: 21, endFrameExclusive: 28 },
    { startFrame: 28, endFrameExclusive: 30 },
  ];
  for (const chunk of chunks) assert.doesNotThrow(() => assertHyperframesFrameSpan(document, chunk));
  assert.equal(chunks[0]?.startFrame, 0);
  assert.equal(chunks.at(-1)?.endFrameExclusive, document.frameCount);
  assert.equal(chunks.reduce((frames, chunk) => frames + chunk.endFrameExclusive - chunk.startFrame, 0), document.frameCount);
  assert.throws(
    () => assertHyperframesFrameSpan(document, { startFrame: 29, endFrameExclusive: 31 }),
    /outside/u,
  );
});

test("HyperFrames emits compact absolute-frame animation without creating a Track stacking context", async () => {
  const { composition, programSpace } = fixture();
  const lower = composition.tracks.find((track) => track.id === "lower");
  assert(lower?.kind === "visual");
  const present = lower.presents[0]!;
  const media = present.elements[0]!;
  const animated = sealVisualTrack({...lower,
    presents: [{
      ...present,
      elements: [{
        ...media,
        animation: {
          keyframes: [
            { atFrame: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(100%)" }] },
            { atFrame: 10, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0%)" }] },
            { atFrame: 30, style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0%)" }] },
          ],
        },
      }],
    }],
  });
  const document = compileHyperframesDocument(sealComposition({
    ...composition,
    tracks: composition.tracks.map((track) => track.id === "lower" ? animated : track),
  }), programSpace);
  assert.match(document.html, /@keyframes hypit-/u);
  assert.match(document.html, /33\.333333333%\{opacity:1;transform:translateY\(0%\)/u);
  assert.match(document.html, /animation-duration:1\.001s/u);
  assert.match(document.html, /100%\{opacity:1;transform:translateY\(0%\)\}/u);
  assert.match(document.html, /hyperframesCreateFrameWorkIndex/u);
  assert.match(document.html, /new Animation\(new KeyframeEffect\(/u);
  assert.doesNotMatch(document.html, /const frames = \[\]/u, "poses are evaluated per seek, not tabulated per Present frame");
  assert.doesNotMatch(document.html, /\.animate\(/u, "HyperFrames' waapi adapter tracks Element.animate");
  assert.doesNotMatch(document.html, /isolation:isolate/u);

  const marker = document.html.indexOf("const millisecondsPerFrame");
  assert.ok(marker >= 0);
  const scriptStart = document.html.lastIndexOf("<script>", marker) + "<script>".length;
  const scriptEnd = document.html.indexOf("</script>", marker);
  const { frameWorkIndexRuntime, hyperframesFrameSelectionPrelude } = await import("../src/frame-work.js");
  const runtime = `${frameWorkIndexRuntime}\n${document.html.slice(scriptStart, scriptEnd)}`;
  const toFrame = (milliseconds: number) => Math.round(milliseconds * 30 / 1_001);
  // A fake DOM whose opacity is the evaluated local frame. After every seek it
  // also plays HyperFrames' css/waapi adapters, which move each animation still
  // live in the document to absolute composition time.
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
    let seek: (event: { detail: { time: number } }) => void = () => {};
    const animate = (target: FakeElement, record?: number[], effect?: object): FakeAnimation => {
      const animation = {
        target,
        effect,
        set currentTime(value: number) {
          record?.push(toFrame(value));
          target.pose = toFrame(value);
        },
        pause() {},
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
        style: {} as Record<string, unknown>,
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
    runInNewContext(`${selection === undefined ? "" : hyperframesFrameSelectionPrelude(selection)}\n${runtime}`, {
      document: { querySelectorAll: () => elements, documentElement: { getBoundingClientRect() {} }, timeline: {} },
      window: { addEventListener(_name: string, callback: typeof seek) { seek = callback; } },
      KeyframeEffect: class {
        readonly target: FakeElement;
        constructor(target: FakeElement) { this.target = target; }
      },
      Animation: function (effect: { target: FakeElement }) {
        return animate(effect.target, positions[elements.indexOf(effect.target as typeof elements[number])]);
      },
      getComputedStyle: (element: FakeElement) => ({ opacity: String(element.pose) }),
    });
    for (const frame of frames) {
      seek({ detail: { time: frame * 1_001 / 30_000 } });
      for (const animation of live) animation.currentTime = frame * 1_001 / 30;
    }
    // What a captured frame shows: a live animation wins over inline style.
    const shown = elements.map((element) => element.pose === undefined ? element.style.opacity : String(element.pose));
    return { materialized, live: live.size, positions, shown };
  };
  assert.deepEqual(await evaluate([{ start: 15, duration: 30 }], [30, 44, 15, 45, 60]), {
    materialized: 1,
    live: 0,
    positions: [[15, 29, 0]],
    shown: ["0"],
  });
  assert.deepEqual(await evaluate([{ start: 15, duration: 30 }], [30]), { materialized: 1, live: 0, positions: [[15]], shown: ["15"] },
    "a fresh worker derives the same middle pose without visiting preceding frames");
  assert.deepEqual(await evaluate([{ start: 30, duration: 60 }], [33, 60, 86]), {
    materialized: 1,
    live: 0,
    positions: [[3, 30, 56]],
    shown: ["56"],
  }, "a Present starting after frame 0 keeps its Present-relative pose when HyperFrames seeks live animations");
  assert.deepEqual(await evaluate([
    { start: 0, duration: 30 },
    { start: 90, duration: 30 },
  ], [100], [{ startFrame: 100, endFrameExclusive: 101 }]), {
    materialized: 1,
    live: 1,
    positions: [[], [10]],
    shown: ["100", "10"],
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
  }, "the point index preserves overlap, half-open boundaries, distant spans and reverse seeks");
});

test("HyperFrames clips a long animation by Present visibility instead of rejecting it", () => {
  const { composition, programSpace } = fixture();
  const lower = composition.tracks.find((track) => track.id === "lower");
  assert(lower?.kind === "visual");
  const present = lower.presents[0]!;
  const media = present.elements[0]!;
  const animated = sealVisualTrack({...lower,
    presents: [{ ...present, elements: [{ ...media, animation: { keyframes: [
      { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
      { atFrame: 45, style: [{ name: "opacity", value: 1 }] },
    ] } }] }],
  });
  const document = compileHyperframesDocument(sealComposition({
    ...composition,
    tracks: composition.tracks.map((track) => track.id === "lower" ? animated : track),
  }), programSpace);
  assert.match(document.html, /animation-duration:1\.5015s/u);
  assert.match(document.html, /data-hypit-animation-sample-frames="30"/u);
  assert.doesNotMatch(document.html, /data-hypit-animation-properties|data-hypit-animation-duration-frames/u);
  assert.match(document.html, /100%\{opacity:1\}/u);
});

test("content-bound fonts and typed compositable Surfaces cross the same Artifact boundary", () => {
  const space = sealProgramSpace({ id: "test-space", durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const font: FontArtifactRef = {
    sources: [{ artifact: {
      kind: "blob",
      resource: fixtureResource("hyperframes:font"),
      size: 1_024,
      mediaType: "font/woff2",
    } }],
    weight: 700,
    style: "normal",
  };
  const surfaceDigest = fixtureResource("hyperframes:alpha-surface");
  const track = sealVisualTrack({ programSpaceId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "bound-render-dependencies",
    presents: [{
      id: "bound",
      span: { startFrame: 0, endFrameExclusive: 30 },
      stacking: { order: 1, tieBreak: "bound" },
      elements: [
        { id: "root", order: 0, kind: "box", style: [] },
        {
          id: "text",
          parent: "root",
          order: 1,
          kind: "text",
          text: "SVML",
          fonts: [font],
          style: [{ name: "font-size", value: "72px" }],
        },
        {
          id: "surface",
          parent: "root",
          order: 2,
          kind: "surface",
          surface: {
            artifact: { kind: "blob", resource: surfaceDigest, size: 2_048, mediaType: "video/webm" },
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
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
        },
      ],
    }],
  });
  const document = compileHyperframesDocument(sealComposition({
    id: "render-dependencies",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [track],
  }), space);
  assert.doesNotThrow(() => assertHyperframesDocument(document));
  assert.deepEqual(document.artifacts.map(({ artifact }) => artifact.resource), [font.sources[0]!.artifact.resource, surfaceDigest].sort());
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === font.sources[0]!.artifact.resource)?.usage,
    { kind: "always" });
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === surfaceDigest)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.match(document.html, /@font-face\{/u);
  assert.match(document.html, /format\("woff2"\)/u);
  assert.match(document.html, /font-synthesis:none/u);
  assert.match(document.html, /data-hypit-alpha-mode="straight"/u);
  assert.match(document.html, /data-hypit-color-space="srgb"/u);
  const materialized = materializeHyperframesHtml(document,
    (artifact) => `https://assets.example/${artifact.resource}?token=1&part=2`);
  assert.doesNotMatch(materialized, /hypit-resource:\/\//u);
  assert.match(materialized, new RegExp(font.sources[0]!.artifact.resource, "u"));
  assert.match(materialized, new RegExp(surfaceDigest, "u"));
});

test("exact timed sampling keeps a held frame as one compact interval without zero-rate browser media", () => {
  const programSpace = sealProgramSpace({ id: "test-space", durationSec: 8 / 30,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("hyperframes:sampled-video"),
    size: 1_000,
    mediaType: "video/mp4",
  };
  const track = sealVisualTrack({ programSpaceId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "sampled",
    presents: [{
      id: "sampled",
      span: { startFrame: 0, endFrameExclusive: 8 },
      stacking: { order: 1, tieBreak: "sampled" },
      elements: [{
        id: "video",
        order: 0,
        kind: "video",
        artifact,
        muted: true,
        sampling: {
          sourceFrameRate: { numerator: 30, denominator: 1 },
          sourceFrameCount: 4,
          segments: [
            {
              target: { startFrame: 0, endFrameExclusive: 6 },
              sourceFrame: { numerator: 2, denominator: 1 },
              rate: { numerator: 1, denominator: 1 },
              loop: { startFrame: 0, endFrameExclusive: 4 },
            },
            {
              target: { startFrame: 6, endFrameExclusive: 8 },
              sourceFrame: { numerator: 3, denominator: 1 },
              rate: { numerator: 0, denominator: 1 },
            },
          ],
        },
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      }],
    }],
  });
  const document = compileHyperframesDocument(sealComposition({
    id: "sampled",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
    tracks: [track],
  }), programSpace);
  assert.equal((document.html.match(/data-hypit-sampling-part=/gu) ?? []).length, 3);
  assert.match(document.html, /data-media-start="0\.066666666666"/u);
  assert.match(document.html, /data-media-start="0"/u);
  assert.equal((document.html.match(/data-playback-rate="1"/gu) ?? []).length, 3);
  assert.doesNotMatch(document.html, /data-playback-rate="0"/u);
  assert.equal((document.html.match(/data-hypit-resource-src="hypit-resource:\/\//gu) ?? []).length, 3);
  assert.doesNotMatch(document.html, /<video\b[^>]*\ssrc=/u,
    "compiler-owned video stays inert while its exact slots remain statically readable");
  assert.match(document.html, /data-hypit-source-rate="0\/1"[^>]*data-hypit-start-frame="6"[^>]*data-hypit-end-frame="8"/u);
});

test("a Track naming five takes still lowers to DOM identities a Windows path can hold", () => {
  // HyperFrames spends the video element's id as a directory name for that video's extracted
  // frames, under `%TEMP%\hf-render-XXXXXX\compiled\__hyperframes_video_frames\<id>\frame_%05d.png`.
  // That surround is 103 characters of a 260-character budget, so the id is what decides whether
  // extraction can write at all. These identities are the ones a five-take speech Track produces:
  // the Track names every take, and the Present and the layer each repeat the Track.
  const trackId = "speech-visual:opening-monologue-take-1+opening-monologue-take-2"
    + "+opening-monologue-take-3+opening-monologue-take-4+opening-monologue-take-5";
  const presentId = `${trackId}:clip-1`;
  const programSpace = sealProgramSpace({ id: "test-space", durationSec: 8 / 30,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const track = sealVisualTrack({ programSpaceId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: trackId,
    presents: [{
      id: presentId,
      span: { startFrame: 0, endFrameExclusive: 8 },
      stacking: { order: 1, tieBreak: presentId },
      elements: [{
        id: `${presentId}:foreground`,
        order: 0,
        kind: "video",
        artifact: {
          kind: "blob" as const,
          resource: fixtureResource("hyperframes:long-identity-video"),
          size: 1_000,
          mediaType: "video/mp4",
        },
        muted: true,
        // Sampling is what splits the element into parts, and each part appends its own suffix.
        sampling: {
          sourceFrameRate: { numerator: 30, denominator: 1 },
          sourceFrameCount: 8,
          segments: [
            {
              target: { startFrame: 0, endFrameExclusive: 4 },
              sourceFrame: { numerator: 0, denominator: 1 },
              rate: { numerator: 1, denominator: 1 },
            },
            {
              target: { startFrame: 4, endFrameExclusive: 8 },
              sourceFrame: { numerator: 4, denominator: 1 },
              rate: { numerator: 1, denominator: 1 },
            },
          ],
        },
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      }],
    }],
  });
  const document = compileHyperframesDocument(sealComposition({
    id: "long-identity",
    canvas: { width: 100, height: 100, clearColor: "#000000" },
    tracks: [track],
  }), programSpace);

  // The `id` attribute only; `data-hypit-element-id` and friends are meant to stay readable.
  const identities = [...document.html.matchAll(/\sid="([^"]*)"/gu)].map((match) => match[1]!);
  assert.ok(identities.length > 0, "the document names something");
  assert.deepEqual(identities.filter((id) => id.length > 64), [],
    "a DOM identity does not grow with the number of takes its Track names");
  // The parts stay readable where a reader looks for them, spelled the way the author wrote them.
  assert.ok(document.html.includes(`data-hypit-track-id="${trackId}"`));
  assert.ok(document.html.includes(`data-hypit-element-id="${presentId}:foreground"`));
});

test("browser programs own local HTML while retaining typed child resources and format boundaries", async () => {
  const { browserProgram } = await import("../src/browser-program.js");
  const { programSpace, picture } = fixture();
  const opaqueArtifact = { kind: "blob" as const, resource: fixtureResource("hyperframes:opaque-program"),
    size: 12, mediaType: "image/png" };
  const visual = sealVisualTrack({ id: "scene", programSpaceId: programSpace.id, visualIr: VISUAL_IR_V1,
    presents: [{ id: "scene", span: { startFrame: 0, endFrameExclusive: 30 }, stacking: { order: 0, tieBreak: "scene" },
      elements: [{ id: "root", kind: "program", order: 0, style: [], program: browserProgram({
        html: `<section class="viewport">{{photo}}<img class="opaque" src="hypit-resource://${opaqueArtifact.resource}"><svg><path d="M0 0H20"/></svg></section>`,
        css: '.viewport { backdrop-filter:blur(4px); display:grid; }',
        setup: 'return frame => { root.dataset.frame = String(frame); };',
      }, [opaqueArtifact]) }, { id: "photo", parent: "root", kind: "image", order: 1, artifact: picture, style: [] }] }] });
  const composition = sealComposition({ id: "scene", canvas: { width: 200, height: 200, clearColor: "#000000" }, tracks: [visual] });
  const document = compileHyperframesDocument(composition, programSpace);
  assert.equal(document.artifacts.length, 2);
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === opaqueArtifact.resource)?.usage,
    { kind: "always" }, "opaque Browser Program dependencies remain conservative");
  assert.deepEqual(document.artifacts.find(({ artifact }) => artifact.resource === picture.resource)?.usage,
    { kind: "frames", spans: [{ startFrame: 0, endFrameExclusive: 30 }] });
  assert.ok(document.html.includes('<section class="viewport">'));
  assert.ok(document.html.includes(`class="opaque" src="hypit-resource://${opaqueArtifact.resource}"`),
    "opaque Browser Program markup is not rewritten by the structural compiler");
  assert.ok(document.html.includes(`data-hypit-resource-src="hypit-resource://${picture.resource}"`),
    "a typed child keeps the structural compiler's selection-gated resource behavior");
  assert.ok(document.html.includes('@scope'));
  const missing = structuredClone(composition);
  const root = missing.tracks[0]!;
  if (root.kind !== "visual" || root.presents[0]!.elements[0]!.kind !== "program") throw new Error("fixture");
  const program = root.presents[0]!.elements[0]!.program;
  (program as { format: string }).format = "another.renderer@1";
  assert.throws(() => compileHyperframesDocument(missing, programSpace), /does not support visual program format/);
});

test("browser program state follows direct seeks and reports authored evaluation failures", async () => {
  const { runInNewContext } = await import("node:vm");
  const { browserProgramScript } = await import("../src/browser-program.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const root = { frame: -1 };
  let seek: (event: { detail: { time: number } }) => void = () => {};
  const window: { addEventListener: (name: string, callback: typeof seek) => void; __hypitBrowserProgramError?: string } = {
    addEventListener: (_name, callback) => { seek = callback; },
  };
  runInNewContext(`${frameWorkIndexRuntime}\n${browserProgramScript([{ id: "scene", startFrame: 30, durationFrames: 90,
    program: { html: "", setup: 'return frame => { if(frame===60) throw new Error("bad pose"); root.frame=frame; };' },
  }], 30, 1)}`, { window, document: { getElementById: () => root } });
  seek({ detail: { time: 2.5 } });
  assert.equal(root.frame, 45);
  seek({ detail: { time: 1.2 } });
  assert.equal(root.frame, 6);
  seek({ detail: { time: 3 } });
  assert.match(window.__hypitBrowserProgramError!, /bad pose/);
});

test("inactive programs settle once, while re-entry and repeated active seeks still redraw ready assets", async () => {
  const { runInNewContext } = await import("node:vm");
  const { browserProgramScript } = await import("../src/browser-program.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const root = { frames: [] as number[], ready: false, painted: false };
  let seek: (event: { detail: { time: number } }) => void = () => {};
  runInNewContext(`${frameWorkIndexRuntime}\n${browserProgramScript([{ id: "scene", startFrame: 30, durationFrames: 30,
    program: { html: "", setup: 'return frame => { root.frames.push(frame); root.painted=root.ready; };' },
  }], 30, 1)}`, { window: { addEventListener: (_: string, callback: typeof seek) => { seek = callback; } },
    document: { getElementById: () => root } });
  seek({ detail: { time: 0.5 } });
  assert.deepEqual(root.frames, [0]);
  seek({ detail: { time: 1 } });
  root.ready = true;
  seek({ detail: { time: 1 } });
  assert.equal(root.painted, true);
  seek({ detail: { time: 2 } });
  seek({ detail: { time: 3 } });
  assert.deepEqual(root.frames, [0, 0, 0, 30]);
  seek({ detail: { time: 1.5 } });
  seek({ detail: { time: 0.5 } });
  assert.deepEqual(root.frames, [0, 0, 0, 30, 15, 0]);
});

test("sequential Browser Program work follows active and crossed spans instead of all Programs", async () => {
  const { runInNewContext } = await import("node:vm");
  const { browserProgramScript } = await import("../src/browser-program.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const entries = Array.from({ length: 100 }, (_, index) => ({
    id: `scene-${index}`,
    startFrame: index * 10,
    durationFrames: 10,
    program: { html: "", setup: "return () => { root.calls += 1; };" },
  }));
  const roots = new Map(entries.map(entry => [entry.id, { calls: 0 }]));
  let seek: (event: { detail: { time: number } }) => void = () => {};
  runInNewContext(`${frameWorkIndexRuntime}\n${browserProgramScript(entries, 30, 1)}`, {
    window: { addEventListener: (_: string, callback: typeof seek) => { seek = callback; } },
    document: { getElementById: (id: string) => roots.get(id) },
  });
  for (const root of roots.values()) root.calls = 0;
  for (let frame = 0; frame < 1_000; frame++) seek({ detail: { time: frame / 30 } });
  assert.equal([...roots.values()].reduce((sum, root) => sum + root.calls, 0), 1_099);
});

test("browser program setup is limited to Presents overlapping the render selection", async () => {
  const { runInNewContext } = await import("node:vm");
  const { browserProgramScript } = await import("../src/browser-program.js");
  const { frameWorkIndexRuntime, hyperframesFrameSelectionPrelude } = await import("../src/frame-work.js");
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
  runInNewContext(`${hyperframesFrameSelectionPrelude([{ startFrame: 100, endFrameExclusive: 101 }])}
    ${frameWorkIndexRuntime}\n${browserProgramScript(entries, 30, 1)}`, {
    window: { addEventListener() {} },
    document: { getElementById: (id: string) => roots.get(id) },
  });
  assert.deepEqual(roots.get("early"), { setups: 0, renders: 0 });
  assert.deepEqual(roots.get("selected"), { setups: 1, renders: 1 });
});

test("an asynchronous browser program reports its unsupported frame behavior instead of racing capture", async () => {
  const { runInNewContext } = await import("node:vm");
  const { browserProgramScript } = await import("../src/browser-program.js");
  const { frameWorkIndexRuntime } = await import("../src/frame-work.js");
  const window = { addEventListener() {}, __hypitBrowserProgramError: undefined as string | undefined };
  runInNewContext(`${frameWorkIndexRuntime}\n${browserProgramScript([{ id: "scene", startFrame: 0, durationFrames: 30,
    program: { html: "", setup: 'return async frame => { await Promise.resolve(); throw new Error("late drawing failure"); };' },
  }], 30, 1)}`, { window, document: { getElementById: () => ({}) } });
  assert.match(window.__hypitBrowserProgramError!, /must be synchronous/u);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(window.__hypitBrowserProgramError!, /late drawing failure/u);
});
