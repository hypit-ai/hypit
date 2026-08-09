import { assertProgramSpaceIdentity, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { sealVisualTrack } from "@narratage/composition";
import type { VisualElement, VisualStyleDeclaration, VisualTrack } from "@narratage/composition";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { BlobRef } from "@narratage/protocol";
import {
  assertContentFit,
  assertIntrinsicExtent,
  assertSpatialFrame,
  fitContent,
} from "@narratage/spatial";
import type { ContentFit, IntrinsicExtent, SpatialFrame } from "@narratage/spatial";
import { projectProgramWindow } from "@narratage/temporal";

import type {
  MediaItemProgram,
  MediaStillItemSpec,
  MediaTrackHeader,
  MediaTrackProgram,
  MediaTrackSet,
} from "./types.js";

export const mediaTrackImplementationDigests = {
  createSet: digestOf("@narratage/media-track/create-set@1"),
  appendFullStill: digestOf("@narratage/media-track/append-full-still@1"),
  finalize: digestOf("@narratage/media-track/finalize@1"),
  render: digestOf("@narratage/media-track/render@1"),
} as const;

export const mediaTrackValidatorDigests = {
  program: digestOf("@narratage/media-track/validate-program@1"),
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertPresentation(value: MediaStillItemSpec["presentation"], label: string): void {
  assert(value.clip === "frame" && value.fill.kind === "transparent", `${label} is unsupported.`);
}

function assertArtifact(value: MediaItemProgram["layers"][number]["artifact"], label: string): void {
  assert(isDigest(value.digest) && Number.isSafeInteger(value.size) && value.size >= 0
    && value.mediaType.startsWith("image/") && value.durationSec === 0, `${label} is not a still-image Artifact.`);
}

export function sealMediaTrackHeader(value: MediaTrackHeader): MediaTrackHeader {
  assertMediaTrackHeader(value);
  return canonicalize(value) as unknown as MediaTrackHeader;
}

export function assertMediaTrackHeader(value: MediaTrackHeader): void {
  assert(value.contract === "svml.media-track-header@1", "Unsupported MediaTrackHeader contract.");
  assertIdentity(value.id, "MediaTrackHeader.id");
}

export function sealMediaStillItemSpec(value: MediaStillItemSpec): MediaStillItemSpec {
  assertMediaStillItemSpec(value);
  return canonicalize(value) as unknown as MediaStillItemSpec;
}

export function assertMediaStillItemSpec(value: MediaStillItemSpec): void {
  assert(value.contract === "svml.media-still-item-spec@1", "Unsupported MediaStillItemSpec contract.");
  assertIdentity(value.id, "MediaStillItemSpec.id");
  assert(Number.isSafeInteger(value.stackingOrder), "MediaStillItemSpec.stackingOrder must be an integer.");
  assertPresentation(value.presentation, "MediaStillItemSpec.presentation");
}

export function createMediaTrackSet(): MediaTrackSet {
  return { contract: "svml.media-track-set@1", items: [] };
}

export function assertMediaTrackSet(value: MediaTrackSet): void {
  assert(value.contract === "svml.media-track-set@1" && Array.isArray(value.items), "MediaTrackSet is invalid.");
}

export function appendFullStillMediaItem(
  set: MediaTrackSet,
  header: MediaTrackHeader,
  space: ProgramSpace,
  source: BlobRef,
  extent: IntrinsicExtent,
  frame: SpatialFrame,
  fit: ContentFit,
  spec: MediaStillItemSpec,
): MediaTrackSet {
  assertMediaTrackSet(set);
  assertMediaTrackHeader(header);
  assertProgramSpaceIdentity(space);
  assert(source.kind === "blob" && source.mediaType.startsWith("image/"), "Media still source must be an image BlobArtifact.");
  assertIntrinsicExtent(extent);
  assertSpatialFrame(frame);
  assertContentFit(fit);
  assertMediaStillItemSpec(spec);
  assert(!set.items.some((item) => item.id === spec.id), `Media Track already contains Item ${spec.id}.`);
  const projected = projectProgramWindow({
    itemId: spec.id,
    space,
    projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
  });
  const item: MediaItemProgram = {
    id: spec.id,
    span: projected.span,
    frame: { ...frame },
    presentation: structuredClone(spec.presentation),
    layers: [{
      id: `${spec.id}:content`,
      kind: "still",
      artifact: {
        digest: source.digest,
        size: source.size,
        mediaType: source.mediaType,
        durationSec: 0,
      },
      extent: { ...extent },
      fit: structuredClone(fit),
    }],
    stacking: { order: spec.stackingOrder, tieBreak: `${header.id}:${spec.id}` },
  };
  return { contract: "svml.media-track-set@1", items: [...set.items, item] };
}

function normalizeProgram(value: MediaTrackProgram): MediaTrackProgram {
  return {
    contract: "svml.media-track-program@1",
    id: value.id,
    items: [...value.items]
      .map((item) => structuredClone(item))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function sealMediaTrackProgram(value: MediaTrackProgram): MediaTrackProgram {
  const normalized = normalizeProgram(value);
  assertMediaTrackProgram(normalized);
  return canonicalize(normalized) as unknown as MediaTrackProgram;
}

export function finalizeMediaTrack(set: MediaTrackSet, header: MediaTrackHeader): MediaTrackProgram {
  assertMediaTrackSet(set);
  assertMediaTrackHeader(header);
  assert(set.items.length > 0, "Media Track requires at least one Item.");
  return sealMediaTrackProgram({ contract: "svml.media-track-program@1", id: header.id, items: set.items });
}

export function assertMediaTrackProgram(value: MediaTrackProgram): void {
  assert(value.contract === "svml.media-track-program@1", "Unsupported MediaTrackProgram contract.");
  assertIdentity(value.id, "MediaTrackProgram.id");
  assert(value.items.length > 0, "MediaTrackProgram requires at least one Item.");
  const ids = new Set<string>();
  for (const item of value.items) {
    assertIdentity(item.id, "MediaItemProgram.id");
    assert(!ids.has(item.id), `MediaTrackProgram contains duplicate Item ${item.id}.`);
    ids.add(item.id);
    assert(Number.isSafeInteger(item.span.startFrame) && Number.isSafeInteger(item.span.endFrameExclusive)
      && item.span.startFrame >= 0 && item.span.endFrameExclusive > item.span.startFrame,
    `Media Item ${item.id} span is invalid.`);
    assertSpatialFrame(item.frame);
    assertPresentation(item.presentation, `Media Item ${item.id} presentation`);
    assert(Number.isSafeInteger(item.stacking.order) && item.stacking.tieBreak.length > 0,
      `Media Item ${item.id} stacking is invalid.`);
    assert(item.layers.length > 0, `Media Item ${item.id} requires at least one layer.`);
    const layerIds = new Set<string>();
    for (const layer of item.layers) {
      assertIdentity(layer.id, `Media Item ${item.id} layer id`);
      assert(!layerIds.has(layer.id), `Media Item ${item.id} contains duplicate layer ${layer.id}.`);
      layerIds.add(layer.id);
      assert(layer.kind === "still", `Media Item ${item.id} contains an unsupported layer.`);
      assertArtifact(layer.artifact, `Media Item ${item.id} layer ${layer.id}`);
      assertIntrinsicExtent(layer.extent);
      assertContentFit(layer.fit);
    }
  }
}

export function assertMediaTrackProgramIdentity(value: MediaTrackProgram, space: ProgramSpace): void {
  assertMediaTrackProgram(value);
  assertProgramSpaceIdentity(space);
  const totalFrames = programSpaceFrameCount(space);
  for (const item of value.items) {
    assert(item.span.endFrameExclusive <= totalFrames, `Media Item ${item.id} is outside ProgramSpace.`);
  }
}

function px(value: number): string { return `${value}px`; }

function itemElements(item: MediaItemProgram): readonly VisualElement[] {
  const rootStyle: VisualStyleDeclaration[] = [
    { name: "height", value: px(item.frame.heightPx) },
    { name: "left", value: px(item.frame.xPx) },
    { name: "overflow", value: "hidden" },
    { name: "position", value: "absolute" },
    { name: "top", value: px(item.frame.yPx) },
    { name: "width", value: px(item.frame.widthPx) },
  ];
  const media = item.layers.map((layer, index) => {
    const fitted = fitContent(item.frame, layer.extent, layer.fit).contentFrame;
    return {
      id: layer.id,
      parent: "root",
      order: index + 1,
      kind: "image" as const,
      artifact: layer.artifact,
      style: [
        { name: "height", value: px(fitted.heightPx) },
        { name: "left", value: px(fitted.xPx - item.frame.xPx) },
        { name: "position", value: "absolute" },
        { name: "top", value: px(fitted.yPx - item.frame.yPx) },
        { name: "width", value: px(fitted.widthPx) },
      ],
    } satisfies VisualElement;
  });
  return [{ id: "root", order: 0, kind: "box", style: rootStyle }, ...media];
}

export function renderMediaTrack(space: ProgramSpace, program: MediaTrackProgram): VisualTrack {
  assertMediaTrackProgramIdentity(program, space);
  return sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: program.id,
    presents: program.items.map((item) => ({
      id: item.id,
      span: { ...item.span },
      stacking: { ...item.stacking },
      elements: itemElements(item),
    })),
  });
}
