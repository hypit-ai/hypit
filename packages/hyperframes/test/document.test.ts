import {
  assertHyperframesDocument,
  assertHyperframesFrameIndex,
  assertHyperframesFrameSpan,
  compileHyperframesDocument,
  hyperframesTime,
  materializeHyperframesHtml,
} from "@narratage/hyperframes";
import type { FontArtifactRef } from "@narratage/media";
import { sealProgramSpace } from "@narratage/program-space";
import { sealAudioTrack, sealComposition, sealVisualTrack } from "@narratage/composition";
import type { Track } from "@narratage/composition";
import { VISUAL_IR_V1 } from "@narratage/visual-ir";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

const fixtureFont: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", digest: fixtureDigest("hyperframes:fixture-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};

function fixture() {
  const programSpace = sealProgramSpace({
    durationSec: 1001 / 1000,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  const picture = {
    kind: "blob" as const,
    digest: fixtureDigest("hyperframes:picture"),
    size: 10,
    mediaType: "image/png",
  };
  const sound = {
    kind: "blob" as const,
    digest: fixtureDigest("hyperframes:sound"),
    size: 20,
    mediaType: "audio/wav",
  };
  const lower = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
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
  const upper = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
    id: "upper",
    presents: [{
      id: "words",
      span: { startFrame: 3, endFrameExclusive: 20 },
      stacking: { order: 20, tieBreak: "upper" },
      elements: [
        { id: "root", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }] },
        { id: "text", parent: "root", order: 1, kind: "text", text: "Hello <world>", fonts: [fixtureFont], style: [] },
      ],
    }],
  });
  const audio = sealAudioTrack({
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
  assert.deepEqual(new Set(document.artifacts.map((artifact) => artifact.digest)),
    new Set([picture.digest, fixtureFont.sources[0]!.artifact.digest]));
  assert.ok(document.html.indexOf('data-narratage-track-id="lower"') < document.html.indexOf('data-narratage-track-id="upper"'));
  assert.equal((document.html.match(/class="clip narratage-visual-present"/gu) ?? []).length, 2);
  assert.doesNotMatch(document.html, /<audio/u);
  assert.doesNotMatch(document.html, new RegExp(sound.digest, "u"));
  assert.doesNotMatch(document.html, /isolation:isolate|narratage-visual-track/u);
  assert.match(document.html, /Hello &lt;world&gt;/u);
  assert.doesNotMatch(document.html, /speech-visual-track|caption-track/u);
});

test("visual Artifact placeholders are materialized only by the Runtime boundary", () => {
  const { composition, picture, sound, programSpace } = fixture();
  const document = compileHyperframesDocument(composition, programSpace);
  assert.match(document.html, /narratage-artifact:\/\/sha256\//u);
  const resolved = materializeHyperframesHtml(document,
    (artifact) => `https://assets.example/${artifact.digest}?x=1&y=2`);
  assert.doesNotMatch(resolved, /narratage-artifact:\/\//u);
  assert.match(resolved, new RegExp(`https://assets\\.example/${picture.digest}\\?x=1&amp;y=2`, "u"));
  assert.doesNotMatch(resolved, new RegExp(sound.digest, "u"));
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
  assert.match(document.html, /data-narratage-frame-count="30"/u);
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

test("HyperFrames emits frame-bound local animation without creating a Track stacking context", () => {
  const { composition, programSpace } = fixture();
  const lower = composition.tracks.find((track) => track.id === "lower");
  assert(lower?.kind === "visual");
  const present = lower.presents[0]!;
  const media = present.elements[0]!;
  const animated = sealVisualTrack({
    ...lower,
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
  assert.match(document.html, /@keyframes narratage-/u);
  assert.match(document.html, /33\.333333333%\{opacity:1;transform:translateY\(0%\)/u);
  assert.match(document.html, /animation-duration:1\.001s/u);
  assert.match(document.html, /100%\{opacity:1;transform:translateY\(0%\)\}/u);
  assert.doesNotMatch(document.html, /isolation:isolate/u);
});

test("HyperFrames clips a long animation by Present visibility instead of rejecting it", () => {
  const { composition, programSpace } = fixture();
  const lower = composition.tracks.find((track) => track.id === "lower");
  assert(lower?.kind === "visual");
  const present = lower.presents[0]!;
  const media = present.elements[0]!;
  const animated = sealVisualTrack({
    ...lower,
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
  assert.match(document.html, /data-narratage-animation-duration-frames="45" data-narratage-animation-sample-frames="30"/u);
  assert.match(document.html, /100%\{opacity:1\}/u);
});

test("content-bound fonts and typed compositable Surfaces cross the same Artifact boundary", () => {
  const space = sealProgramSpace({
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const font: FontArtifactRef = {
    sources: [{ artifact: {
      kind: "blob",
      digest: fixtureDigest("hyperframes:font"),
      size: 1_024,
      mediaType: "font/woff2",
    } }],
    weight: 700,
    style: "normal",
  };
  const surfaceDigest = fixtureDigest("hyperframes:alpha-surface");
  const track = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
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
            artifact: { kind: "blob", digest: surfaceDigest, size: 2_048, mediaType: "video/webm" },
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
  assert.deepEqual(document.artifacts.map((artifact) => artifact.digest), [font.sources[0]!.artifact.digest, surfaceDigest].sort());
  assert.match(document.html, /@font-face\{/u);
  assert.match(document.html, /format\("woff2"\)/u);
  assert.match(document.html, /font-synthesis:none/u);
  assert.match(document.html, /data-narratage-alpha-mode="straight"/u);
  assert.match(document.html, /data-narratage-color-space="srgb"/u);
  const materialized = materializeHyperframesHtml(document,
    (artifact) => `https://assets.example/${artifact.digest}?token=1&part=2`);
  assert.doesNotMatch(materialized, /narratage-artifact:\/\//u);
  assert.match(materialized, new RegExp(font.sources[0]!.artifact.digest, "u"));
  assert.match(materialized, new RegExp(surfaceDigest, "u"));
});

test("exact timed sampling lowers loop boundaries and held frames without zero-rate browser media", () => {
  const programSpace = sealProgramSpace({
    durationSec: 8 / 30,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const artifact = {
    kind: "blob" as const,
    digest: fixtureDigest("hyperframes:sampled-video"),
    size: 1_000,
    mediaType: "video/mp4",
  };
  const track = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
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
  assert.equal((document.html.match(/data-narratage-sampling-part=/gu) ?? []).length, 4);
  assert.match(document.html, /data-media-start="0\.066666666666"/u);
  assert.match(document.html, /data-media-start="0"/u);
  assert.equal((document.html.match(/data-playback-rate="1"/gu) ?? []).length, 4);
  assert.doesNotMatch(document.html, /data-playback-rate="0"/u);
});
