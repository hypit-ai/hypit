import { canonicalize } from "@svml/core";

import { ScriptSyntaxError } from "./error.js";
import {
  narrativeSegmentExcerptValue,
  narrativeSourceMap,
  narrativeValue,
} from "./narrative.js";
import { narrativeExcerptType, narrativeType } from "./manifest.js";
import { parseScript } from "./parser.js";
import type { ScriptSurfaceInput, ScriptSurfaceOutput } from "./types.js";

const RECORD_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

function findClose(input: ScriptSurfaceInput): { readonly start: number; readonly end: number } {
  const close = `</${input.tag}>`;
  let cursor = input.contentStart;
  while (cursor < input.source.length) {
    if (input.source.startsWith("<!--", cursor)) {
      const commentEnd = input.source.indexOf("-->", cursor + 4);
      if (commentEnd < 0) {
        throw new ScriptSyntaxError("SCRIPT_COMMENT", "Unclosed Script comment.", input.sourceName, cursor);
      }
      cursor = commentEnd + 3;
      continue;
    }
    if (input.source.startsWith(close, cursor)) {
      let slashes = 0;
      for (let before = cursor - 1; before >= 0 && input.source[before] === "\\"; before -= 1) slashes += 1;
      if (slashes % 2 === 0) return { start: cursor, end: cursor + close.length };
    }
    cursor += 1;
  }
  throw new ScriptSyntaxError(
    "SCRIPT_SURFACE_UNCLOSED",
    `Raw Surface <${input.tag}> is not closed.`,
    input.sourceName,
    input.openingStart,
  );
}

export function decodeScriptSurface(input: ScriptSurfaceInput): ScriptSurfaceOutput {
  const unknown = Object.keys(input.attributes).filter((name) => name !== "id");
  if (unknown.length) {
    throw new ScriptSyntaxError(
      "SCRIPT_SURFACE_ATTRIBUTE",
      `<${input.tag}> does not declare attribute "${unknown[0]}".`,
      input.sourceName,
      input.openingStart,
    );
  }
  const rawId = input.attributes.id ?? "script";
  if (typeof rawId !== "string" || !RECORD_ID.test(rawId)) {
    throw new ScriptSyntaxError(
      "SCRIPT_SURFACE_ID",
      `<${input.tag}> id must be a canonical lower-case identifier.`,
      input.sourceName,
      input.openingStart,
    );
  }
  const close = findClose(input);
  const parsed = parseScript(
    input.sourceName,
    input.source.slice(input.contentStart, close.start),
    input.contentStart,
  );
  return {
    nextOffset: close.end,
    records: [
      {
        id: rawId,
        type: narrativeType,
        value: { kind: "inline", value: narrativeValue(parsed) },
        range: { start: input.openingStart, end: close.end },
      },
      ...parsed.segments.map((segment) => ({
        id: `${rawId}.segment.${segment.id}`,
        type: narrativeExcerptType,
        value: { kind: "inline" as const, value: narrativeSegmentExcerptValue(parsed, segment) },
        range: segment.range,
      })),
    ],
    components: [],
    fragments: [],
    sourceMaps: [canonicalize(narrativeSourceMap(rawId, parsed))],
  };
}
