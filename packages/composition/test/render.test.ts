import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  assertCompositableSurfaceRef,
  assertFontArtifactRef,
} from "@hypit/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";
import { sealTimeline } from "@hypit/timeline";
import {
  assertCompositionIdentity,
  sealComposition,
  sealPresentVisualTrack,
} from "../src/index.js";
import type { PresentVisualTrack, VisualTrack } from "../src/index.js";

const space = sealTimeline({ id: "test-space", frameCount: 60, frameRate: { numerator: 30, denominator: 1 },
});

const font: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    resource: fixtureResource("font:inter-bold"),
    size: 1_024,
    mediaType: "font/woff2",
  } }],
  weight: 700,
  style: "normal",
};

const animatedSurface: CompositableSurfaceRef = {
  artifact: {
    kind: "blob",
    resource: fixtureResource("surface:alpha-webm"),
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

test("FontArtifactRef binds one exact font face to a Resource Blob", () => {
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
  const invalid = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "invalid-font-track",
    presents: [{
      id: "title",
      span: { startFrame: 0, endFrameExclusive: 60 },
      root: {
        id: "title",
        kind: "text",
        text: "SVML",
        fonts: [font],
        style: [{ name: "font-family", value: "Inter" }],
      },
    }],
  });
  assert.throws(
    () => assertCompositionIdentity(sealComposition({
      id: "invalid-font-composition",
      canvas: { width: 1080, height: 1920, clearColor: "#000000" },
      visual: { members: [invalid].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [],
    }), space),
    /exact fonts conflict with a raw font style/u,
  );
});

test("animated materialized Surfaces carry an explicit partial source-time function", () => {
  const sourceTime = {
    sourceFrameRate: { numerator: 30, denominator: 1 },
    sourceFrameCount: 60,
    pieces: [{
      target: { startFrame: 0, endFrameExclusive: 60 },
      sourceAtStart: { numerator: 0, denominator: 1 },
      rate: { numerator: 1, denominator: 1 },
    }],
  } as const;
  const valid = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "surface-track",
    presents: [{
      id: "surface",
      span: { startFrame: 0, endFrameExclusive: 60 },
      root: { id: "surface", kind: "surface", surface: animatedSurface, sourceTime, style: [] },
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "surface-composition",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: { members: [valid].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [],
  }), space));

  const content = structuredClone(valid) as PresentVisualTrack;
  const surface = content.items[0]!.root;
  assert(surface.kind === "surface");
  const invalid = sealPresentVisualTrack({...content,
    presents: [{
      ...content.items[0]!,
      span: { startFrame: 0, endFrameExclusive: 30 },
      root: {
        ...surface,
        surface: {
          ...surface.surface,
          timing: { kind: "frames", frameRate: { numerator: 30, denominator: 1 }, frameCount: 60 },
        },
      },
    }],
  });
  assert.throws(() => assertCompositionIdentity(sealComposition({
    id: "invalid-surface-composition",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: { members: [invalid].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [],
  }), space), /target interval is invalid/u);
});

test("a local mask owns exactly one mask root and one content root inside its Present", () => {
  const track = sealPresentVisualTrack({ timelineId: "test-space",
    visualIr: "hypit.visual-ir@1",
    id: "masked-text",
    presents: [{
      id: "mask",
      span: { startFrame: 0, endFrameExclusive: 60 },
      root: {
          id: "local-mask", kind: "mask", mode: "alpha",
          mask: {
            id: "letters", kind: "text", text: "MASK", fonts: [font],
            style: [{ name: "font-size", value: "180px" }, { name: "color", value: "#ffffff" }],
          },
          content: {
            id: "material", kind: "box", children: [],
            style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }, { name: "background", value: "linear-gradient(90deg,#ff0000,#0000ff)" }],
          },
          style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      },
    }],
  });
  assert.doesNotThrow(() => assertCompositionIdentity(sealComposition({
    id: "mask-composition",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    visual: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [],
  }), space));

  const invalid = structuredClone(track) as PresentVisualTrack;
  const root = invalid.items[0]!.root;
  assert(root.kind === "mask");
  const broken = sealPresentVisualTrack({...invalid,
    presents: [{
      ...invalid.items[0]!,
      root: { ...root, mask: { id: "invalid-mask-box", kind: "box", children: [], style: [] } },
    }],
  });
  assert.throws(() => assertCompositionIdentity(sealComposition({
    id: "broken-mask",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" }, visual: { members: [broken].map(track => ({ kind: "track" as const, id: track.id, track })) }, audio: [],
  }), space), /terminal owned text, image or still Surface/u);
});
