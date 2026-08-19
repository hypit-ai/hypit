import { ScriptSyntaxError } from "./error.js";
import {
  captionCorrespondence,
  captionCorrespondenceValue,
  captionDisplaySequence,
  captionDisplaySequenceValue,
  captionSelectionWordSubsetValue,
  narrativeDialogueTextValue,
  narrativeSegmentExcerptValue,
  narrativeMomentValue,
  narrativeSelectionValue,
  narrativeSpeechTextValue,
  narrativeValue,
} from "./narrative.js";
import {
  captionCorrespondenceType,
  captionDisplayType,
  captionDisplayWordSubsetType,
  narrativeExcerptType,
  narrativeMomentType,
  narrativeSelectionType,
  narrativeType,
} from "./manifest.js";
import { textTypes } from "@hypit/text";
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
  const displayId = `${rawId}.caption`;
  const display = captionDisplaySequence(parsed, displayId);
  const correspondence = captionCorrespondence(parsed, displayId);
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
      ...parsed.segments.flatMap((segment) => [
        {
          id: `${rawId}.segment.${segment.id}.dialogue`,
          type: textTypes.text,
          value: { kind: "inline" as const, value: narrativeDialogueTextValue(segment) },
          range: segment.range,
        },
        {
          id: `${rawId}.segment.${segment.id}.speech`,
          type: textTypes.text,
          value: { kind: "inline" as const, value: narrativeSpeechTextValue(segment) },
          range: segment.range,
        },
      ]),
      {
        id: displayId,
        type: captionDisplayType,
        value: { kind: "inline" as const, value: captionDisplaySequenceValue(parsed, displayId) },
        range: { start: input.openingStart, end: close.end },
      },
      {
        id: `${displayId}.correspondence`,
        type: captionCorrespondenceType,
        value: { kind: "inline" as const, value: captionCorrespondenceValue(parsed, displayId) },
        range: { start: input.openingStart, end: close.end },
      },
      ...parsed.selections.map((selection) => ({
        id: `${rawId}.caption.selection.${selection.id}`,
        type: captionDisplayWordSubsetType,
        value: { kind: "inline" as const, value: captionSelectionWordSubsetValue(
          parsed,
          display,
          correspondence,
          selection,
        ) },
        range: {
          start: selection.occurrences[0]!.open.range.start,
          end: selection.occurrences.at(-1)!.close.range.end,
        },
      })),
      ...parsed.selections.map((selection) => ({
        id: `${rawId}.selection.${selection.id}`,
        type: narrativeSelectionType,
        value: { kind: "inline" as const, value: narrativeSelectionValue(selection) },
        range: {
          start: selection.occurrences[0]!.open.range.start,
          end: selection.occurrences.at(-1)!.close.range.end,
        },
      })),
      ...parsed.moments.map((moment) => ({
        id: `${rawId}.moment.${moment.id}`,
        type: narrativeMomentType,
        value: { kind: "inline" as const, value: narrativeMomentValue(moment) },
        range: {
          start: moment.occurrences[0]!.range.start,
          end: moment.occurrences.at(-1)!.range.end,
        },
      })),
    ],
    components: [],
    fragments: [],
  };
}
