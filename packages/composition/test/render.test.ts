import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import {
  assertCompositableSurfaceRef,
  assertFontArtifactRef,
} from "@narratage/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@narratage/media";
import { sealProgramSpace } from "@narratage/program-space";
import {
  assertCompositionIdentity,
  sealComposition,
  sealVisualTrack,
} from "../src/index.js";
import type { VisualTrack } from "../src/index.js";

const space = sealProgramSpace({
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});

const font: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    digest: fixtureDigest("font:inter-bold"),
    size: 1_024,
    mediaType: "font/woff2",
  } }],
  weight: 700,
  style: "normal",
};

const animatedSurface: CompositableSurfaceRef = {
  artifact: {
    kind: "blob",
    digest: fixtureDigest("surface:alpha-webm"),
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
    () => assertFontArtifactRef({
      ...font,
      sources: [{ artifact: { ...font.sources[0]!.artifact, mediaType: "application/octet-stream" } }],
    }),
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
    visualIr: "narratage.visual-ir@1",
    id: "invalid-font-track",
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
      id: "invalid-font-composition",
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      tracks: [invalid],
    }), space),
    /exact fonts conflict with a raw font style/u,
  );
});

test("animated materialized Surfaces must exactly share the Present frame domain", () => {
  const valid = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
    id: "surface-track",
    presents: [{
      id: "surface",
      span: { startFrame: 0, endFrameExclusive: 60 },
      stacking: { order: 1, tieBreak: "surface" },
      elements: [{ id: "surface", order: 0, kind: "surface", surface: animatedSurface, style: [] }],
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "surface-composition",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [valid],
  }), space));

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
    id: "invalid-surface-composition",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [invalid],
  }), space), /must exactly match its Present frame domain/u);
});

test("a local mask owns exactly one mask root and one content root inside its Present", () => {
  const track = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
    id: "masked-text",
    presents: [{
      id: "mask",
      span: { startFrame: 0, endFrameExclusive: 60 },
      stacking: { order: 4, tieBreak: "mask" },
      elements: [
        {
          id: "local-mask", kind: "mask", order: 0, mode: "alpha",
          maskElement: "letters", contentElement: "material",
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
        },
        {
          id: "letters", parent: "local-mask", kind: "text", order: 1, text: "MASK", fonts: [font],
          style: [{ name: "font-size", value: "180px" }, { name: "color", value: "#ffffff" }],
        },
        {
          id: "material", parent: "local-mask", kind: "box", order: 2,
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }, { name: "background", value: "linear-gradient(90deg,#ff0000,#0000ff)" }],
        },
      ],
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "mask-composition",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [track],
  }), space));

  const invalid = structuredClone(track) as VisualTrack;
  const root = invalid.presents[0]!.elements[0]!;
  assert(root.kind === "mask");
  const broken = sealVisualTrack({
    ...invalid,
    presents: [{
      ...invalid.presents[0]!,
      elements: [{ ...root, contentElement: "foreign" }, ...invalid.presents[0]!.elements.slice(1)],
    }],
  });
  assert.throws(() => assertCompositionIdentity(sealComposition({
    id: "broken-mask",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" }, tracks: [broken],
  }), space), /declared mask and content roots/u);

  const nested = sealVisualTrack({
    ...track,
    presents: [{
      ...track.presents[0]!,
      elements: [
        ...track.presents[0]!.elements,
        { id: "hidden-child", parent: "letters", kind: "box", order: 3, style: [] },
      ],
    }],
  });
  assert.throws(() => assertCompositionIdentity(sealComposition({
    id: "nested-mask-source",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" }, tracks: [nested],
  }), space), /must have a box or mask parent/u);
});
