import {
  assertCompleteSemanticMapIdentity,
  assertNarrativeSelectionIdentity,
  selectionFrameSpans,
  verifySynchronizedMedia,
} from "@svml/contracts";
import type {
  CompleteSemanticMap,
  NarrativeSelectionRef,
  SynchronizedMedia,
} from "@svml/contracts";
import { canonicalize, digestOf, isDigest } from "@svml/protocol";

import { sealBrollProgram } from "./program.js";
import type {
  BrollItemSpec,
  BrollProgram,
  BrollSet,
  BrollTrackSpec,
} from "./types.js";

export const createBrollSetImplementationDigest = digestOf("@svml/broll/create-set@1");
export const appendBrollItemImplementationDigest = digestOf("@svml/broll/append-item@1");
export const finalizeBrollProgramImplementationDigest = digestOf("@svml/broll/finalize-program@1");
export const projectBrollProgramSpaceImplementationDigest = digestOf("@svml/broll/project-program-space@1");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function projectBrollProgramSpace(map: CompleteSemanticMap) {
  assertCompleteSemanticMapIdentity(map);
  return map.programSpace;
}

export function sealBrollItemSpec(value: Omit<BrollItemSpec, "digest">): BrollItemSpec {
  const content = canonicalize(value) as unknown as Omit<BrollItemSpec, "digest">;
  return { ...content, digest: digestOf(content) };
}

export function assertBrollItemSpec(value: BrollItemSpec): void {
  assert(value.contract === "svml.broll-item-spec@1" && value.id.length > 0, "BrollItemSpec identity is invalid");
  const { digest: _digest, ...content } = value;
  assert(isDigest(value.digest) && value.digest === digestOf(canonicalize(content)), "BrollItemSpec digest differs");
  assert(Number.isSafeInteger(value.z), "BrollItemSpec z must be an integer");
  assert(value.fit === "contain" || value.fit === "cover", "BrollItemSpec fit is invalid");
}

export function sealBrollTrackSpec(value: Omit<BrollTrackSpec, "digest">): BrollTrackSpec {
  const content = canonicalize(value) as unknown as Omit<BrollTrackSpec, "digest">;
  return { ...content, digest: digestOf(content) };
}

function assertBrollTrackSpec(value: BrollTrackSpec): void {
  const { digest: _digest, ...content } = value;
  assert(value.contract === "svml.broll-track-spec@1" && value.id.length > 0
    && isDigest(value.digest) && value.digest === digestOf(canonicalize(content)), "BrollTrackSpec is invalid");
}

function setContent(value: Omit<BrollSet, "digest">): Omit<BrollSet, "digest"> {
  return canonicalize(value) as unknown as Omit<BrollSet, "digest">;
}

function sealSet(value: Omit<BrollSet, "digest">): BrollSet {
  const content = setContent(value);
  return { ...content, digest: digestOf(content) };
}

export function assertBrollSet(value: BrollSet): void {
  assert(value.contract === "svml.broll-set@1" && value.id.length > 0, "BrollSet identity is invalid");
  assertCompleteSemanticMapIdentity(value.map);
  const { digest: _digest, ...content } = value;
  assert(isDigest(value.digest) && value.digest === digestOf(setContent(content)), "BrollSet digest differs");
  assert(value.items.length === 0 ? value.lastAddition === undefined : value.lastAddition !== undefined,
    "BrollSet last addition is inconsistent");
}

export function createBrollSet(map: CompleteSemanticMap, spec: BrollTrackSpec): BrollSet {
  assertCompleteSemanticMapIdentity(map);
  assertBrollTrackSpec(spec);
  return sealSet({ contract: "svml.broll-set@1", id: spec.id, map, items: [] });
}

export function appendBrollItem(
  set: BrollSet,
  media: SynchronizedMedia,
  selection: NarrativeSelectionRef,
  spec: BrollItemSpec,
): BrollSet {
  assertBrollSet(set);
  verifySynchronizedMedia(media);
  assertNarrativeSelectionIdentity(selection);
  assertBrollItemSpec(spec);
  assert(media.visual !== undefined, `B-roll ${spec.id} source has no visual stream`);
  assert(media.timeline.frameRate.numerator === set.map.programSpace.frameRate.numerator
    && media.timeline.frameRate.denominator === set.map.programSpace.frameRate.denominator,
  `B-roll ${spec.id} media uses another frame rate`);
  const durationSec = media.timeline.frameCount * media.timeline.frameRate.denominator / media.timeline.frameRate.numerator;
  const additions = selectionFrameSpans(set.map, selection).map((span, index) => {
    return {
      id: selection.occurrences.length === 1 ? spec.id : `${spec.id}:${index + 1}`,
      artifact: {
        digest: media.visual!.artifact.digest,
        size: media.visual!.artifact.size,
        mediaType: media.visual!.artifact.mediaType,
        durationSec,
      },
      span,
      z: spec.z,
      tieBreak: `${set.id}:${spec.id}:${index + 1}`,
      box: spec.box,
      fit: spec.fit,
      playback: "stretch" as const,
      ...(spec.backgroundColor === undefined ? {} : { backgroundColor: spec.backgroundColor }),
      ...(spec.borderRadiusPx === undefined ? {} : { borderRadiusPx: spec.borderRadiusPx }),
      ...(spec.enter === undefined ? {} : { enter: spec.enter }),
      ...(spec.exit === undefined ? {} : { exit: spec.exit }),
    };
  });
  return sealSet({
    contract: "svml.broll-set@1",
    id: set.id,
    map: set.map,
    items: [...set.items, ...additions],
    lastAddition: {
      previousSetDigest: set.digest,
      mediaDigest: media.synchronizedMediaDigest,
      selectionDigest: selection.selectionDigest,
      specDigest: spec.digest,
    },
  });
}

export function finalizeBrollProgram(set: BrollSet): BrollProgram {
  assertBrollSet(set);
  assert(set.items.length > 0, "B-roll Track requires at least one Item");
  return sealBrollProgram({
    contract: "svml.broll-program@1",
    id: set.id,
    programSpaceDigest: set.map.programSpace.digest,
    items: set.items,
    transitions: [],
  });
}
