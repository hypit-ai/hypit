import type { CanonicalValue } from "@narratage/protocol";

import { sealContentFit } from "./geometry.js";
import type { ContentFit } from "./types.js";

export const contentFitPropertyNames = [
  "fit", "frame-x", "frame-y", "content-x", "content-y",
  "fit-offset-x", "fit-offset-y", "fit-constraint",
] as const;

function number(
  properties: Readonly<Record<string, CanonicalValue>>,
  name: string,
  fallback: number,
  owner: string,
): number {
  const value = properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${owner} ${name} must be a finite number.`);
  return value;
}

function oneOf<T extends string>(
  properties: Readonly<Record<string, CanonicalValue>>,
  name: string,
  allowed: readonly T[],
  fallback: T,
  owner: string,
): T {
  const value = properties[name];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${owner} ${name} must be ${allowed.join(" | ")}.`);
  }
  return value as T;
}

/** Decode the shared spatial-fit vocabulary from any author-side property map. */
export function decodeContentFitProperties(
  properties: Readonly<Record<string, CanonicalValue>>,
  owner = "Content-fit properties",
): ContentFit {
  return sealContentFit({
    contract: "svml.content-fit@1",
    sizing: oneOf(properties, "fit", ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"] as const, "contain", owner),
    framePoint: {
      x: number(properties, "frame-x", 0.5, owner),
      y: number(properties, "frame-y", 0.5, owner),
    },
    contentPoint: {
      x: number(properties, "content-x", 0.5, owner),
      y: number(properties, "content-y", 0.5, owner),
    },
    offsetPx: {
      x: number(properties, "fit-offset-x", 0, owner),
      y: number(properties, "fit-offset-y", 0, owner),
    },
    constraint: oneOf(properties, "fit-constraint", ["bounded", "free"] as const, "bounded", owner),
  });
}
