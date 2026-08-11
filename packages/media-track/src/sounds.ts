import { synchronizedMediaSampleFrames, verifySynchronizedMedia } from "@narratage/media";
import type { SynchronizedMedia } from "@narratage/media";
import { canonicalize } from "@narratage/protocol";

import { assertMediaIdentity } from "./layers.js";
import type { MediaSoundSet, MediaSoundSpec } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertMediaSoundSpec(value: MediaSoundSpec): void {
  assert(value.contract === "svml.media-sound-spec@1", "Unsupported MediaSoundSpec contract.");
  assertMediaIdentity(value.id, "MediaSoundSpec.id");
  assert(value.trigger.kind === "enter" || value.trigger.kind === "exit" || value.trigger.kind === "handoff",
    "MediaSoundSpec.trigger is invalid.");
  if (value.trigger.kind === "handoff") {
    assertMediaIdentity(value.trigger.handoffId, "MediaSoundSpec.trigger.handoffId");
  }
  assert(Number.isFinite(value.gain) && value.gain >= 0 && value.gain <= 64,
    "MediaSoundSpec.gain must be inside [0, 64].");
}

export function sealMediaSoundSpec(value: MediaSoundSpec): MediaSoundSpec {
  assertMediaSoundSpec(value);
  return canonicalize(value) as unknown as MediaSoundSpec;
}

export function createMediaSoundSet(): MediaSoundSet {
  return { contract: "svml.media-sound-set@1", sounds: [] };
}

export function assertMediaSoundSet(value: MediaSoundSet): void {
  assert(value.contract === "svml.media-sound-set@1" && Array.isArray(value.sounds),
    "MediaSoundSet is invalid.");
  const ids = new Set<string>();
  for (const sound of value.sounds) {
    assertMediaSoundSpec({ contract: "svml.media-sound-spec@1", id: sound.id, trigger: sound.trigger, gain: sound.gain });
    assert(!ids.has(sound.id), `MediaSoundSet repeats ${sound.id}.`);
    ids.add(sound.id);
    assert(sound.source.artifact.kind === "blob" && sound.source.artifact.mediaType.startsWith("audio/")
      && Number.isSafeInteger(sound.source.sampleFrames) && sound.source.sampleFrames > 0,
    `MediaSoundSet ${sound.id} source is invalid.`);
  }
}

/** Bind one normalized audio source through an ordinary graph input edge. */
export function appendMediaSound(
  set: MediaSoundSet,
  media: SynchronizedMedia,
  spec: MediaSoundSpec,
): MediaSoundSet {
  assertMediaSoundSet(set);
  verifySynchronizedMedia(media);
  assertMediaSoundSpec(spec);
  assert(media.audio !== undefined, `Media sound ${spec.id} requires normalized audio.`);
  assert(!set.sounds.some((sound) => sound.id === spec.id), `MediaSoundSet already contains ${spec.id}.`);
  const result = {
    contract: "svml.media-sound-set@1" as const,
    sounds: [...set.sounds, {
      id: spec.id,
      trigger: structuredClone(spec.trigger),
      source: {
        artifact: structuredClone(media.audio.artifact),
        sampleFrames: synchronizedMediaSampleFrames(media),
      },
      gain: spec.gain,
    }],
  };
  assertMediaSoundSet(result);
  return canonicalize(result) as unknown as MediaSoundSet;
}
