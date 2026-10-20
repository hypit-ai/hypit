import { ScriptSyntaxError } from "./error.js";
import {
  captionDocumentValue,
  narrativeCaptionBinding,
  narrativeDialogueTextValue,
  narrativeSegmentExcerptValue,
  narrativeMomentValue,
  narrativeSelectionValue,
  narrativeSpeechTextValue,
  narrativeValue,
} from "./narrative.js";
import {
  captionDocumentType,
  narrativeCaptionBindingType,
  narrativeSegmentRefType,
  narrativeMomentType,
  narrativeSelectionType,
  narrativeType,
} from "./manifest.js";
import { canonicalize } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";
import { parseScript } from "./parser.js";
import type { ScriptSurfaceInput, ScriptSurfaceOutput } from "./types.js";

const RECORD_ID = /^[a-z][a-z0-9_-]{0,63}$/u;

function findClose(input: ScriptSurfaceInput): { readonly start: number; readonly end: number } {
  const close = `</${input.tag}>`;
  let cursor = input.contentStart;
  while (cursor < input.source.length) {
    if (input.source[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (input.source.startsWith("<!--", cursor)) {
      const commentEnd = input.source.indexOf("-->", cursor + 4);
      if (commentEnd < 0) {
        throw new ScriptSyntaxError("SCRIPT_COMMENT", "Unclosed Script comment.", input.sourceName, cursor);
      }
      cursor = commentEnd + 3;
      continue;
    }
    if (input.source.startsWith(close, cursor)) {
      return { start: cursor, end: cursor + close.length };
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
  const narrative = narrativeValue(parsed, rawId);
  const caption = captionDocumentValue(parsed, `${rawId}.caption`, rawId);
  const captionBinding = canonicalize(narrativeCaptionBinding(
    parsed,
    `${rawId}.caption`,
    rawId,
    `${rawId}.caption-binding`,
  ));
  const captionId = `${rawId}.caption`;
  return {
    nextOffset: close.end,
    records: [
      {
        id: rawId,
        type: narrativeType,
        value: (narrative),
        range: { start: input.openingStart, end: close.end },
      },
      ...parsed.segments.map((segment) => ({
        id: `${rawId}.segment.${segment.id}`,
        type: narrativeSegmentRefType,
        value: (narrativeSegmentExcerptValue(parsed, segment, rawId)),
        range: segment.range,
      })),
      ...parsed.segments.flatMap((segment) => [
        {
          id: `${rawId}.segment.${segment.id}.dialogue`,
          type: textTypes.text,
          value: (narrativeDialogueTextValue(segment)),
          range: segment.range,
        },
        {
          id: `${rawId}.segment.${segment.id}.speech`,
          type: textTypes.text,
          value: (narrativeSpeechTextValue(segment)),
          range: segment.range,
        },
      ]),
      {
        id: captionId,
        type: captionDocumentType,
        value: (caption),
        range: { start: input.openingStart, end: close.end },
      },
      {
        id: `${rawId}.caption-binding`,
        type: narrativeCaptionBindingType,
        value: (captionBinding),
        range: { start: input.openingStart, end: close.end },
      },
      ...parsed.selections.map((selection) => ({
        id: `${rawId}.selection.${selection.id}`,
        type: narrativeSelectionType,
        value: (narrativeSelectionValue(selection, rawId)),
        range: {
          start: selection.open.range.start,
          end: selection.close.range.end,
        },
      })),
      ...parsed.moments.map((moment) => ({
        id: `${rawId}.moment.${moment.id}`,
        type: narrativeMomentType,
        value: (narrativeMomentValue(moment, rawId)),
        range: moment.range,
      })),
    ],
    components: [],
    identities: [{ namespace: narrativeType, id: rawId }],
  };
}
