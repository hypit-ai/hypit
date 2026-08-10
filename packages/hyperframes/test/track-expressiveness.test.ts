import { mediaDependency, mediaTypes } from "@narratage/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@narratage/media";
import { programSpaceDependency, programSpaceTypes, sealProgramSpace } from "@narratage/program-space";
import { compositionDependency, compositionTypes, sealComposition, sealVisualTrack } from "@narratage/composition";
import type { Track, VisualElement, VisualPresent, VisualTrack } from "@narratage/composition";
import { createResolvedClosure } from "@narratage/core";
import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHyperframesDocument,
  compileHyperframesDocument,
} from "@narratage/hyperframes";
import { digestOf } from "@narratage/protocol";
import type { BlobRef, ModuleManifest } from "@narratage/protocol";
import * as rankingTrack from "@narratage/ranking";
import { videoContractManifests } from "../../test-support/video-domain.js";

const programSpace = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 10,
  frameRate: { numerator: 30, denominator: 1 },
});

const witnessFont: FontArtifactRef = {
  contract: "svml.font-artifact@1",
  sources: [{ artifact: { kind: "blob", digest: digestOf("visual-ir:witness-font"), size: 32, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};

function composition(id: string, tracks: readonly VisualTrack[]) {
  return sealComposition({
    contract: "svml.composition@1",
    id,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks,
  });
}

function textPresent(
  id: string,
  order: number,
  paintTarget: "frame" | "content" | "line" | "word",
): VisualPresent {
  const painted = [{ name: "background-color", value: "#f8ff66" }] as const;
  const elements: VisualElement[] = [
    {
      id: "placement",
      order: 0,
      kind: "box",
      style: [
        { name: "position", value: "absolute" },
        { name: "left", value: "10%" },
        { name: "top", value: `${10 + order * 8}%` },
        { name: "width", value: "80%" },
        { name: "height", value: "16%" },
        { name: "display", value: "flex" },
        ...(paintTarget === "frame" ? painted : []),
      ],
    },
    {
      id: "layout",
      parent: "placement",
      order: 1,
      kind: "box",
      style: [
        { name: "max-width", value: "100%" },
        { name: "display", value: "flex" },
        { name: "flex-wrap", value: "wrap" },
        { name: "align-content", value: "center" },
        { name: "direction", value: "ltr" },
        { name: "writing-mode", value: "horizontal-tb" },
        { name: "overflow", value: "visible" },
      ],
    },
    {
      id: "content",
      parent: "layout",
      order: 2,
      kind: "box",
      style: [
        { name: "display", value: "inline-flex" },
        { name: "flex-direction", value: "column" },
        { name: "width", value: "fit-content" },
        ...(paintTarget === "content" ? painted : []),
      ],
    },
    {
      id: "line-1",
      parent: "content",
      order: 3,
      kind: "box",
      style: [
        { name: "display", value: "flex" },
        ...(paintTarget === "line" ? painted : []),
      ],
    },
    {
      id: "word-intent",
      parent: "line-1",
      order: 4,
      kind: "text",
      text: "Intent",
      fonts: [witnessFont],
      style: [
        { name: "font-size", value: "64px" },
        { name: "box-shadow", value: "0 12px 32px rgba(0,0,0,0.4)" },
        ...(paintTarget === "word" ? painted : []),
      ],
    },
    {
      id: "word-first",
      parent: "line-1",
      order: 5,
      kind: "text",
      text: " first",
      fonts: [witnessFont],
      style: [
        { name: "font-size", value: "64px" },
      ],
    },
  ];
  return {
    id,
    span: { startFrame: 0, endFrameExclusive: 90 },
    stacking: { order: 60 + order, tieBreak: id },
    elements,
  };
}

test("Text three-box and frame/content/line/word paint semantics lower without public Text fields", () => {
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: "text-three-box-witness",
    presents: [
      textPresent("frame-paint", 0, "frame"),
      textPresent("content-paint", 1, "content"),
      textPresent("line-paint", 2, "line"),
      textPresent("word-paint", 3, "word"),
    ],
  });
  const document = compileHyperframesDocument(composition("text-three-box", [track]), programSpace);
  assert.doesNotThrow(() => assertHyperframesDocument(document));
  assert.deepEqual(track.presents[0]!.elements.map((element) => element.id), [
    "placement",
    "layout",
    "content",
    "line-1",
    "word-intent",
    "word-first",
  ]);
  assert.equal("textLayout" in track, false);
  assert.equal("backgroundTarget" in track, false);
  assert.deepEqual(
    track.presents.map((present) => present.elements.find((element) =>
      element.style.some((declaration) => declaration.name === "background-color"),
    )?.id),
    ["placement", "content", "line-1", "word-intent"],
  );
  assert.match(document.html, /data-svml-element-id="placement"/u);
  assert.match(document.html, /data-svml-element-id="layout"/u);
  assert.match(document.html, /data-svml-element-id="content"/u);
  assert.match(document.html, /writing-mode:horizontal-tb/u);
  assert.match(document.html, /box-shadow:0 12px 32px rgba\(0,0,0,0\.4\)/u);
  assert.equal((document.html.match(/background-color:#f8ff66/gu) ?? []).length, 4);
});

test("Caption range/cue/content boxes and word-local timing remain an ordinary VisualTrack", () => {
  const durationFrames = 60;
  const wordAnimation = (start: number, end: number) => ({
    keyframes: [
      { atFrame: 0, style: [{ name: "opacity", value: 0 }] },
      { atFrame: start, style: [{ name: "opacity", value: 0 }] },
      { atFrame: start + 1, easing: "ease-out" as const, style: [{ name: "opacity", value: 1 }] },
      { atFrame: end, style: [{ name: "opacity", value: 1 }] },
      { atFrame: Math.min(end + 1, durationFrames - 1), style: [{ name: "opacity", value: 0.65 }] },
      { atFrame: durationFrames, style: [{ name: "opacity", value: 0.65 }] },
    ],
  });
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: "caption-three-box-witness",
    presents: [{
      id: "cue-1",
      span: { startFrame: 30, endFrameExclusive: 90 },
      stacking: { order: 100, tieBreak: "cue-1" },
      elements: [
        {
          id: "range",
          order: 0,
          kind: "box",
          style: [
            { name: "position", value: "absolute" },
            { name: "left", value: "8%" },
            { name: "width", value: "84%" },
            { name: "overflow", value: "visible" },
          ],
        },
        {
          id: "cue",
          parent: "range",
          order: 1,
          kind: "box",
          style: [{ name: "display", value: "flex" }, { name: "justify-content", value: "center" }],
          animation: {
            keyframes: [
              { atFrame: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(20px)" }] },
              { atFrame: 8, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
              { atFrame: durationFrames, style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
            ],
          },
        },
        {
          id: "content",
          parent: "cue",
          order: 2,
          kind: "box",
          style: [
            { name: "display", value: "inline-flex" },
            { name: "filter", value: "drop-shadow(0 0 18px #00ffff)" },
          ],
        },
        {
          id: "soft-word",
          parent: "content",
          order: 3,
          kind: "text",
          text: "semantic ",
          fonts: [witnessFont],
          style: [],
          animation: wordAnimation(1, 20),
        },
        {
          id: "punch-word",
          parent: "content",
          order: 4,
          kind: "text",
          text: "video",
          fonts: [witnessFont],
          style: [{ name: "background-color", value: "#00ff66" }],
          animation: wordAnimation(21, 50),
        },
      ],
    }],
  });
  const document = compileHyperframesDocument(composition("caption-three-box", [track]), programSpace);
  assert.doesNotThrow(() => assertHyperframesDocument(document));
  assert.equal("captionMode" in track, false);
  assert.match(document.html, /data-svml-element-id="range"/u);
  assert.match(document.html, /data-svml-element-id="cue"/u);
  assert.match(document.html, /data-svml-element-id="content"/u);
  assert.match(document.html, /@font-face\{font-family:svml-/u);
  assert.match(document.html, new RegExp(witnessFont.sources[0]!.artifact.digest.slice("sha256:".length), "u"));
  assert.match(document.html, /drop-shadow\(0 0 18px #00ffff\)/u);
});

test("one content box lowers independent backdrop and foreground samples of one media Artifact", () => {
  const media: BlobRef = {
    kind: "blob",
    digest: digestOf("two-box-source"),
    size: 1_024,
    mediaType: "video/mp4",
  };
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: "media-two-box-witness",
    presents: [{
      id: "media-card",
      span: { startFrame: 60, endFrameExclusive: 180 },
      stacking: { order: 40, tieBreak: "media-card" },
      elements: [
        {
          id: "content-box",
          order: 0,
          kind: "box",
          style: [
            { name: "position", value: "absolute" },
            { name: "left", value: "8%" },
            { name: "top", value: "24%" },
            { name: "width", value: "84%" },
            { name: "height", value: "42%" },
            { name: "overflow", value: "hidden" },
            { name: "border-radius", value: "28px" },
          ],
        },
        {
          id: "backdrop-sample",
          parent: "content-box",
          order: 1,
          kind: "video",
          artifact: media,
          mediaStartSec: 0.5,
          muted: true,
          style: [
            { name: "position", value: "absolute" },
            { name: "width", value: "100%" },
            { name: "height", value: "100%" },
            { name: "object-fit", value: "cover" },
            { name: "object-position", value: "80% 50%" },
            { name: "filter", value: "blur(24px) brightness(0.7) saturate(1.2)" },
            { name: "transform", value: "scale(1.12)" },
          ],
        },
        {
          id: "foreground-sample",
          parent: "content-box",
          order: 2,
          kind: "video",
          artifact: media,
          mediaStartSec: 0.5,
          muted: true,
          style: [
            { name: "position", value: "absolute" },
            { name: "width", value: "100%" },
            { name: "height", value: "100%" },
            { name: "object-fit", value: "contain" },
            { name: "object-position", value: "80% 50%" },
          ],
        },
      ],
    }],
  });
  const document = compileHyperframesDocument(composition("media-two-box", [track]), programSpace);
  assert.doesNotThrow(() => assertHyperframesDocument(document));
  assert.deepEqual(document.artifacts.map((artifact) => artifact.digest), [media.digest],
    "two samples must retain one content dependency");
  assert.equal((document.html.match(new RegExp(media.digest.slice("sha256:".length), "gu")) ?? []).length, 2);
  assert.match(document.html, /object-fit:cover/u);
  assert.match(document.html, /object-fit:contain/u);
  assert.match(document.html, /object-position:80% 50%/u);
  assert.equal("fit" in track, false);
  assert.equal("focalPoint" in track, false);
});

test("Presents from one authoring Track interleave with a peer Track by absolute stacking", () => {
  const header = rankingTrack.sealRankingHeader({ contract: "svml.ranking-header@1", id: "ranking-witness", variant: "column" });
  const first = { contract: "svml.column-item-spec@1", variant: "column", id: "icon-1", label: "One", stackingOrder: 80 } as const;
  const second = { contract: "svml.column-item-spec@1", variant: "column", id: "icon-2", label: "Two", stackingOrder: 90 } as const;
  let items = rankingTrack.createColumnItemSet();
  items = rankingTrack.appendColumnItem(items, first);
  items = rankingTrack.appendColumnItem(items, second);
  const font: FontArtifactRef = {
    contract: "svml.font-artifact@1",
    sources: [{ artifact: { kind: "blob", digest: digestOf("ranking-interleave-font"), size: 32, mediaType: "font/woff2" } }],
    weight: 700, style: "normal",
  };
  const style = rankingTrack.decodeColumnStyle({
    contract: "svml.svs-recipe@1", path: "ranking.interleave",
    properties: { "board-stack": 30, "stage-stack": 40, "item-stack": 80 },
  }, font).style;
  const ranking = rankingTrack.renderColumn(programSpace, rankingTrack.buildColumnProgram(
    header,
    { contract: "svml.spatial-frame@1", xPx: 80, yPx: 180, widthPx: 920, heightPx: 900 },
    {
      contract: "svml.ranking-schedule@1", id: "ranking-witness.schedule", variant: "column",
      outer: { startFrame: 0, endFrameExclusive: 300 }, terminalFrame: 240,
      entries: [
        { itemId: "icon-1", triggerOccurrenceId: "next#0", triggerFrame: 30,
          stage: { startFrame: 30, endFrameExclusive: 90 }, cumulative: { startFrame: 30, endFrameExclusive: 300 }, settled: { startFrame: 90, endFrameExclusive: 300 } },
        { itemId: "icon-2", triggerOccurrenceId: "next#1", triggerFrame: 90,
          stage: { startFrame: 90, endFrameExclusive: 240 }, cumulative: { startFrame: 90, endFrameExclusive: 300 }, settled: { startFrame: 240, endFrameExclusive: 300 } },
      ],
    },
    style,
    items,
  ));
  const peer = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: "peer-text",
    presents: [{
      id: "peer",
      span: { startFrame: 0, endFrameExclusive: 300 },
      stacking: { order: 50, tieBreak: "peer" },
      elements: [{ id: "peer", order: 0, kind: "text", text: "between", fonts: [font], style: [] }],
    }],
  });
  const document = compileHyperframesDocument(composition("interleaved-ranking", [ranking, peer]), programSpace);
  const boardAt = document.html.indexOf('data-svml-present-id="ranking-witness:board"');
  const peerAt = document.html.indexOf('data-svml-present-id="peer"');
  const icon1At = document.html.indexOf('data-svml-present-id="ranking-witness:item:icon-1:stage"');
  const icon2At = document.html.indexOf('data-svml-present-id="ranking-witness:item:icon-2:stage"');
  assert.ok(boardAt < peerAt && peerAt < icon1At && icon1At < icon2At);
  assert.doesNotMatch(document.html, /svml-visual-track|isolation:isolate/u);
});

test("an independently installed non-native Text package crosses only the typed Surface waist", () => {
  const externalModule = { name: "example.volumetric-text", version: "1" } as const;
  const externalManifest: ModuleManifest = {
    format: "svml.module@1",
    name: externalModule.name,
    version: externalModule.version,
    dependencies: [programSpaceDependency, mediaDependency, compositionDependency],
    types: [],
    capabilities: [],
    surfaces: [],
    producers: [{
      name: "place-materialized-text",
      inputs: [
        { name: "space", type: programSpaceTypes.programSpace },
        { name: "surface", type: mediaTypes.compositableSurface },
      ],
      outputs: [{ name: "track", type: compositionTypes.visualTrack }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.volumetric-text/place-materialized-text",
        digest: digestOf("example.volumetric-text/place-materialized-text@1"),
      },
    }],
  };
  const closure = createResolvedClosure([...videoContractManifests, externalManifest]);
  assert.ok(closure.modules.some((module) => module.ref.name === externalModule.name));
  const materialized: CompositableSurfaceRef = {
    contract: "svml.compositable-surface@1",
    artifact: {
      kind: "blob",
      digest: digestOf("materialized-complex-visual"),
      size: 2_048,
      mediaType: "video/webm",
    },
    width: 1080,
    height: 1920,
    colorSpace: "srgb",
    alphaMode: "straight",
    timing: {
      kind: "frames",
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 60,
    },
  };
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: "materialized-visual-witness",
    presents: [{
      id: "surface",
      span: { startFrame: 120, endFrameExclusive: 180 },
      stacking: { order: 70, tieBreak: "surface" },
      elements: [{
        id: "surface-media",
        order: 0,
        kind: "surface",
        surface: materialized,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      }],
    }],
  });
  const document = compileHyperframesDocument(composition("materialized-visual", [track]), programSpace);
  assert.doesNotThrow(() => assertHyperframesDocument(document));
  assert.deepEqual(document.artifacts.map((artifact) => artifact.digest), [materialized.artifact.digest]);
  assert.match(document.html, /<video/u);
  assert.match(document.html, /data-svml-alpha-mode="straight"/u);
  assert.equal("renderer" in track, false);
  assert.equal("component" in track, false);
  assert.deepEqual(externalManifest.producers[0]?.inputs.map((input) => input.type), [
    programSpaceTypes.programSpace,
    mediaTypes.compositableSurface,
  ]);
  // The separately installed package owns extrusion/material/light/camera
  // semantics before this boundary. Public Track and HyperFrames see only the
  // declared Surface, never an advanced-Text discriminator.
});
