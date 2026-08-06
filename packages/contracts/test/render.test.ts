import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCompositableSurfaceRef,
  assertCompositionIdentity,
  assertFontArtifactRef,
  sealComposition,
  sealProgramSpace,
  sealVisualTrack,
} from "../src/index.js";
import type {
  CompositableSurfaceRef,
  FontArtifactRef,
  VisualTrack,
} from "../src/index.js";
import { digestOf } from "@svml/protocol";

const space = sealProgramSpace({
  contract: "svml.program-space@0",
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});

const font: FontArtifactRef = {
  contract: "svml.font-artifact@1",
  artifact: {
    kind: "blob",
    digest: digestOf("font:inter-bold"),
    size: 1_024,
    mediaType: "font/woff2",
  },
  weight: 700,
  style: "normal",
};

const animatedSurface: CompositableSurfaceRef = {
  contract: "svml.compositable-surface@1",
  artifact: {
    kind: "blob",
    digest: digestOf("surface:alpha-webm"),
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

test("FontArtifactRef binds one exact font face to a content-addressed Blob", () => {
  assert.doesNotThrow(() => assertFontArtifactRef(font));
  assert.throws(
    () => assertFontArtifactRef({ ...font, artifact: { ...font.artifact, mediaType: "application/octet-stream" } }),
    /supported font media type/u,
  );
  assert.throws(() => assertFontArtifactRef({ ...font, weight: 0 }), /weight/u);
});

test("CompositableSurfaceRef distinguishes a typed alpha surface from an ordinary media guess", () => {
  assert.doesNotThrow(() => assertCompositableSurfaceRef(animatedSurface));
  assert.throws(
    () => assertCompositableSurfaceRef({
      ...animatedSurface,
      artifact: { ...animatedSurface.artifact, mediaType: "video/mp4" },
    }),
    /straight alpha requires/u,
  );
  assert.throws(
    () => assertCompositableSurfaceRef({
      ...animatedSurface,
      artifact: { ...animatedSurface.artifact, mediaType: "image/png" },
    }),
    /frame timing requires a video/u,
  );
});

test("exact fonts own font selection and cannot conflict with raw CSS font facts", () => {
  const invalid = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: "invalid-font-track",
    programSpaceDigest: space.digest,
    sources: [{ name: "fixture", digest: digestOf("invalid-font-track") }],
    presents: [{
      id: "title",
      span: { startFrame: 0, endFrameExclusive: 60 },
      stacking: { order: 1, tieBreak: "title" },
      elements: [{
        id: "title",
        order: 0,
        kind: "text",
        text: "SVML",
        fonts: [font],
        style: [{ name: "font-family", value: "Inter" }],
      }],
    }],
  });
  assert.throws(
    () => assertCompositionIdentity(sealComposition({
      contract: "svml.composition@1",
      id: "invalid-font-composition",
      programSpace: space,
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      tracks: [invalid],
    })),
    /exact fonts conflict with a raw font style/u,
  );
});

test("animated materialized Surfaces must exactly share the Present frame domain", () => {
  const valid = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: "surface-track",
    programSpaceDigest: space.digest,
    sources: [{ name: "receipt", digest: digestOf("surface-receipt") }],
    presents: [{
      id: "surface",
      span: { startFrame: 0, endFrameExclusive: 60 },
      stacking: { order: 1, tieBreak: "surface" },
      elements: [{ id: "surface", order: 0, kind: "surface", surface: animatedSurface, style: [] }],
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    contract: "svml.composition@1",
    id: "surface-composition",
    programSpace: space,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [valid],
  })));

  const content = structuredClone(valid) as VisualTrack;
  const surface = content.presents[0]!.elements[0]!;
  assert(surface.kind === "surface");
  const invalid = sealVisualTrack({
    ...content,
    presents: [{
      ...content.presents[0]!,
      span: { startFrame: 0, endFrameExclusive: 30 },
      elements: [{
        ...surface,
        surface: {
          ...surface.surface,
          timing: { kind: "frames", frameRate: { numerator: 30, denominator: 1 }, frameCount: 60 },
        },
      }],
    }],
  });
  assert.throws(() => assertCompositionIdentity(sealComposition({
    contract: "svml.composition@1",
    id: "invalid-surface-composition",
    programSpace: space,
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [invalid],
  })), /must exactly match its Present frame domain/u);
});
