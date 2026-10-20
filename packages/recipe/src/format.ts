import type { CanonicalValue } from "@hypit/protocol";

const BARE = /^[^\s;,\[\]{}"']+$/u;
const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;

function canRemainBare(value: string): boolean {
  return BARE.test(value)
    && value !== "null"
    && value !== "true"
    && value !== "false"
    && !NUMBER.test(value)
    && !value.includes("/*")
    && !value.includes("</sheet>");
}

/** Serialize one canonical value without knowing which component consumes it. */
export function formatRecipeValue(value: CanonicalValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return canRemainBare(value) ? value : JSON.stringify(value);
  return JSON.stringify(value);
}
