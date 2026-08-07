import assert from "node:assert/strict";
import test from "node:test";

import {
  HYPERFRAMES_VISUAL_IR_V1,
  sealAudioTrack,
  sealComposition,
  sealProgramSpace,
  sealVisualTrack,
} from "@svml/contracts";
import {
  assertHyperframesDocument,
  assertHyperframesFrameIndex,
  assertHyperframesFrameSpan,
  compileHyperframesDocument,
  hyperframesTime,
  materializeHyperframesHtml,
} from "@svml/hyperframes";
import { digestOf } from "@svml/protocol";
import type { FontArtifactRef } from "@svml/contracts";

function fixture() {
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 1001 / 1000,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  const picture = {
    digest: digestOf("hyperframes:picture"),
    size: 10,
    mediaType: "image/png",
    durationSec: 0,
  };
  const sound = {
    digest: digestOf("hyperframes:sound"),
    size: 20,
    mediaType: "audio/wav",
    durationSec: programSpace.durationSec,
  };
  const lower = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
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
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: "upper",
    presents: [{
      id: "words",
      span: { startFrame: 3, endFrameExclusive: 20 },
      stacking: { order: 20, tieBreak: "upper" },
      elements: [
        { id: "root", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }] },
        { id: "text", parent: "root", order: 1, kind: "text", text: "Hello <world>", style: [] },
      ],
    }],
  });
  const audio = sealAudioTrack({
    contract: "svml.audio-track@1",
    id: "sound",
    clips: [{ id: "main", span: { startFrame: 0, endFrameExclusive: 30 }, artifact: sound, bus: "speech" }],
  });
  const composition = sealComposition({
    contract: "svml.composition@1",
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
  assert.equal(document.visualIr, HYPERFRAMES_VISUAL_IR_V1);
  assert.deepEqual(document.artifacts, [{
    kind: "blob",
    digest: picture.digest,
    size: picture.size,
    mediaType: picture.mediaType,
  }]);
  assert.ok(document.html.indexOf('data-svml-track-id="lower"') < document.html.indexOf('data-svml-track-id="upper"'));
  assert.equal((document.html.match(/class="clip svml-visual-present"/gu) ?? []).length, 2);
  assert.doesNotMatch(document.html, /<audio/u);
  assert.doesNotMatch(document.html, new RegExp(sound.digest, "u"));
  assert.doesNotMatch(document.html, /isolation:isolate|svml-visual-track/u);
  assert.match(document.html, /Hello &lt;world&gt;/u);
  assert.doesNotMatch(document.html, /speech-visual-track|caption-track/u);
});

test("visual Artifact placeholders are materialized only by the Runtime boundary", () => {
  const { composition, picture, sound, programSpace } = fixture();
  const document = compileHyperframesDocument(composition, programSpace);
  assert.match(document.html, /svml-artifact:\/\/sha256\//u);
  const resolved = materializeHyperframesHtml(document,
    (artifact) => `https://assets.example/${artifact.digest}?x=1&y=2`);
  assert.doesNotMatch(resolved, /svml-artifact:\/\//u);
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
  assert.match(document.html, /data-svml-frame-count="30"/u);
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
  assert(lower?.contract === "svml.visual-track@1");
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
  assert.match(document.html, /@keyframes svml-/u);
  assert.match(document.html, /33\.333333333%\{opacity:1;transform:translateY\(0%\)/u);
  assert.match(document.html, /animation-duration:1\.001s/u);
  assert.doesNotMatch(document.html, /isolation:isolate/u);
});

test("content-bound fonts and typed compositable Surfaces cross the same Artifact boundary", () => {
  const space = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const font: FontArtifactRef = {
    contract: "svml.font-artifact@1",
    artifact: {
      kind: "blob",
      digest: digestOf("hyperframes:font"),
      size: 1_024,
      mediaType: "font/woff2",
    },
    weight: 700,
    style: "normal",
  };
  const surfaceDigest = digestOf("hyperframes:alpha-surface");
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
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
            contract: "svml.compositable-surface@1",
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
    contract: "svml.composition@1",
    id: "render-dependencies",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [track],
  }), space);
  assert.doesNotThrow(() => assertHyperframesDocument(document));
  assert.deepEqual(document.artifacts.map((artifact) => artifact.digest), [font.artifact.digest, surfaceDigest].sort());
  assert.match(document.html, /@font-face\{/u);
  assert.match(document.html, /format\("woff2"\)/u);
  assert.match(document.html, /font-synthesis:none/u);
  assert.match(document.html, /data-svml-alpha-mode="straight"/u);
  assert.match(document.html, /data-svml-color-space="srgb"/u);
  const materialized = materializeHyperframesHtml(document,
    (artifact) => `https://assets.example/${artifact.digest}?token=1&part=2`);
  assert.doesNotMatch(materialized, /svml-artifact:\/\//u);
  assert.match(materialized, new RegExp(font.artifact.digest, "u"));
  assert.match(materialized, new RegExp(surfaceDigest, "u"));
});
