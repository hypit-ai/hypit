import type { ComponentPackage } from "@hypit/component-kit";
import type { MediaRational } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue, StoredValue } from "@hypit/protocol";

import { standInTypes } from "./manifest.js";

export {
  standInCapabilities,
  standInDependency,
  standInManifest,
  standInModuleRef,
  standInTypes,
} from "./manifest.js";

/**
 * What a stand-in card says about the output it stands in for. Every field is derived from the
 * declaration the card replaces — the model's own request — never restated by hand, so the card
 * follows the Source when the Source changes.
 */
export type StandInCardRequest = {
  readonly kind: "image" | "video";
  /** Even, positive pixel dimensions of the card, the frame the real output would have. */
  readonly width: number;
  readonly height: number;
  /** The exact model that would have generated the output. */
  readonly model: string;
  /** The prompt the model would have received; the card prints an excerpt. */
  readonly prompt: string;
  /** A video card runs for exactly this many frames at this clock and carries a running timecode. */
  readonly video?: {
    readonly frameRate: MediaRational;
    readonly frameCount: number;
    /** The model would have generated sound, so the card carries a silent 48 kHz stereo track. */
    readonly audio?: "silence";
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function evenPositive(value: unknown, subject: string): number {
  assert(typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value % 2 === 0,
    `${subject} must be a positive even integer`);
  return value;
}

export function verifyStandInCardRequest(value: unknown): asserts value is StandInCardRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "StandInCardRequest must be an object");
  const item = value as Record<string, unknown>;
  assert(item.kind === "image" || item.kind === "video", "StandInCardRequest kind must be image or video");
  evenPositive(item.width, "StandInCardRequest width");
  evenPositive(item.height, "StandInCardRequest height");
  assert(typeof item.model === "string" && item.model.trim().length > 0, "StandInCardRequest model must name the model");
  assert(typeof item.prompt === "string", "StandInCardRequest prompt must be a string");
  if (item.kind === "video") {
    const video = item.video as Record<string, unknown> | undefined;
    assert(video !== undefined && typeof video === "object", "a video StandInCardRequest needs its frame domain");
    const rate = video.frameRate as Record<string, unknown> | undefined;
    assert(rate !== undefined && Number.isSafeInteger(rate.numerator) && (rate.numerator as number) > 0
      && Number.isSafeInteger(rate.denominator) && (rate.denominator as number) > 0,
    "StandInCardRequest frameRate must be a positive rational");
    assert(Number.isSafeInteger(video.frameCount) && (video.frameCount as number) > 0,
      "StandInCardRequest frameCount must be a positive integer");
    assert(video.audio === undefined || video.audio === "silence", "StandInCardRequest audio can only be silence");
  } else {
    assert(item.video === undefined, "an image StandInCardRequest has no frame domain");
  }
}

export function sealStandInCardRequest(value: StandInCardRequest): StandInCardRequest {
  verifyStandInCardRequest(value);
  return canonicalize(value as unknown as CanonicalValue) as unknown as StandInCardRequest;
}

function inline(value: StoredValue, subject: string): unknown {
  assert(value.kind === "inline", `${subject} must be inline`);
  return value.value;
}

export const standInComponent = {
  validators: [{
    type: standInTypes.cardRequest,
    handler: ({ value }) => { verifyStandInCardRequest(inline(value, "StandInCardRequest")); },
  }],
} satisfies ComponentPackage;
