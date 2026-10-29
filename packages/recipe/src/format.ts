import type { CanonicalValue } from "@hypit/protocol";

const BARE = /^[^\s;,\[\]{}"']+$/u;
const NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;

/** Serialize one canonical value without knowing which component consumes it. */
export function formatRecipeValue(value: CanonicalValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") {
    // A bare `/*` opens a comment and a bare `</sheet>` closes the sheet, so neither reads back.
    return BARE.test(value) && value !== "null" && value !== "true" && value !== "false" && !NUMBER.test(value)
      && !value.includes("/*") && !value.includes("</sheet>")
      ? value
      : JSON.stringify(value);
  }
  return JSON.stringify(value);
}
