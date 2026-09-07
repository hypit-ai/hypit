import type { ComponentPackage } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue, StoredValue } from "@hypit/protocol";
import { assertCanvasSpace } from "@hypit/spatial";
import type { CanvasSpace } from "@hypit/spatial";

import { standInProducers, standInTypes } from "./manifest.js";

export {
  standInCapabilities,
  standInDependency,
  standInManifest,
  standInModuleRef,
  standInProducers,
  standInTypes,
} from "./manifest.js";
export { standInCardFragment, standInTimedCardFragment } from "./fragment.js";

/**
 * The minimum visible shape of a generic stand-in. It says nothing about the
 * Producer or model whose output a Run may choose to replace with it.
 */
export type StandInCardRequest = {
  /** Positive pixel dimensions of the Card. */
  readonly width: number;
  readonly height: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: unknown, subject: string): number {
  assert(typeof value === "number" && Number.isSafeInteger(value) && value > 0,
    `${subject} must be a positive integer`);
  return value;
}

export function verifyStandInCardRequest(value: unknown): asserts value is StandInCardRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "StandInCardRequest must be an object");
  const item = value as Record<string, unknown>;
  positiveInteger(item.width, "StandInCardRequest width");
  positiveInteger(item.height, "StandInCardRequest height");
}

export function sealStandInCardRequest(value: StandInCardRequest): StandInCardRequest {
  verifyStandInCardRequest(value);
  return canonicalize(value as unknown as CanonicalValue) as unknown as StandInCardRequest;
}

function inline(value: StoredValue, subject: string): unknown {
  assert(value.kind === "inline", `${subject} must be inline`);
  return value.value;
}

function typedInline<T>(value: StoredValue, subject: string): T {
  return inline(value, subject) as T;
}

export const standInComponent = {
  validators: [
    {
      type: standInTypes.cardRequest,
      handler: ({ value }) => { verifyStandInCardRequest(inline(value, "StandInCardRequest")); },
    },
  ],
  producers: [
    {
      producer: standInProducers.card,
      handler: ({ inputs }) => {
        const canvas = typedInline<CanvasSpace>(inputs.canvas!.value, "stand-in Canvas");
        assertCanvasSpace(canvas);
        return { outputs: {}, needs: { image: canonicalize(sealStandInCardRequest({
          width: canvas.widthPx, height: canvas.heightPx,
        })) } };
      },
    },
  ],
} satisfies ComponentPackage;
