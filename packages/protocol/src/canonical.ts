import { SvmlError } from "./error.js";
import type { ResourceId } from "./identity.js";
import type { CanonicalValue } from "./value.js";

function normalize(value: unknown, path: string): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SvmlError("NON_CANONICAL_NUMBER", `${path} must be finite`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalize(item, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    const result: Record<string, CanonicalValue> = {};
    for (const [key, item] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
      if (item === undefined) {
        throw new SvmlError("NON_CANONICAL_UNDEFINED", `${path}.${key} is undefined`);
      }
      result[key] = normalize(item, `${path}.${key}`);
    }
    return result;
  }
  throw new SvmlError("NON_CANONICAL_VALUE", `${path} contains ${typeof value}`);
}

export function canonicalize(value: unknown): CanonicalValue {
  return normalize(value, "$input");
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function isResourceId(value: string): value is ResourceId {
  return /^res_[a-zA-Z0-9._:-]+$/u.test(value);
}
