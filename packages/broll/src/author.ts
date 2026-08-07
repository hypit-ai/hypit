import {
  assertCompleteSemanticMapIdentity,
  assertNarrativeSelectionIdentity,
  selectionFrameSpans,
  verifySynchronizedMedia,
} from "@svml/contracts";
import type {
  CompleteSemanticMap,
  NarrativeSelectionRef,
  ProgramSpace,
  SynchronizedMedia,
} from "@svml/contracts";
import { canonicalize, digestOf } from "@svml/protocol";

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function sealBrollItemSpec(value: BrollItemSpec): BrollItemSpec {
  return canonicalize(value) as unknown as BrollItemSpec;
}

export function assertBrollItemSpec(value: BrollItemSpec): void {
  assert(value.contract === "svml.broll-item-spec@1" && value.id.length > 0, "BrollItemSpec identity is invalid");
  assert(Number.isSafeInteger(value.z), "BrollItemSpec z must be an integer");
  assert(value.fit === "contain" || value.fit === "cover", "BrollItemSpec fit is invalid");
}

export function sealBrollTrackSpec(value: BrollTrackSpec): BrollTrackSpec {
  return canonicalize(value) as unknown as BrollTrackSpec;
}

function assertBrollTrackSpec(value: BrollTrackSpec): void {
  assert(value.contract === "svml.broll-track-spec@1" && value.id.length > 0, "BrollTrackSpec is invalid");
}

export function assertBrollSet(value: BrollSet): void {
  assert(value.contract === "svml.broll-set@1", "BrollSet is invalid");
}

export function createBrollSet(): BrollSet {
  return { contract: "svml.broll-set@1", items: [] };
}

export function appendBrollItem(
  set: BrollSet,
  track: BrollTrackSpec,
  map: CompleteSemanticMap,
  programSpace: ProgramSpace,
  media: SynchronizedMedia,
  selection: NarrativeSelectionRef,
  spec: BrollItemSpec,
): BrollSet {
  assertBrollSet(set);
  assertBrollTrackSpec(track);
  assertCompleteSemanticMapIdentity(map);
  verifySynchronizedMedia(media);
  assertNarrativeSelectionIdentity(selection);
  assertBrollItemSpec(spec);
  assert(media.visual !== undefined, `B-roll ${spec.id} source has no visual stream`);
  assert(media.timeline.frameRate.numerator === programSpace.frameRate.numerator
    && media.timeline.frameRate.denominator === programSpace.frameRate.denominator,
  `B-roll ${spec.id} media uses another frame rate`);
  const durationSec = media.timeline.frameCount * media.timeline.frameRate.denominator / media.timeline.frameRate.numerator;
  const additions = selectionFrameSpans(map, selection, programSpace).map((span, index) => {
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
      tieBreak: `${track.id}:${spec.id}:${index + 1}`,
      box: spec.box,
      fit: spec.fit,
      playback: "stretch" as const,
      ...(spec.backgroundColor === undefined ? {} : { backgroundColor: spec.backgroundColor }),
      ...(spec.borderRadiusPx === undefined ? {} : { borderRadiusPx: spec.borderRadiusPx }),
      ...(spec.enter === undefined ? {} : { enter: spec.enter }),
      ...(spec.exit === undefined ? {} : { exit: spec.exit }),
    };
  });
  return {
    contract: "svml.broll-set@1",
    items: [...set.items, ...additions],
  };
}

export function finalizeBrollProgram(set: BrollSet, track: BrollTrackSpec): BrollProgram {
  assertBrollSet(set);
  assertBrollTrackSpec(track);
  assert(set.items.length > 0, "B-roll Track requires at least one Item");
  return sealBrollProgram({
    contract: "svml.broll-program@1",
    id: track.id,
    items: set.items,
    transitions: [],
  });
}
