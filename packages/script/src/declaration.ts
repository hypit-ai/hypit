import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationCompiler,
  type AuthorDeclarationOutput,
} from "@hypit/hypit/author";
import { canonicalize } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";

import { ScriptSyntaxError } from "./error.js";
import {
  captionDocumentType,
  narrativeCaptionBindingType,
  narrativeMomentType,
  narrativeSegmentRefType,
  narrativeSelectionType,
  narrativeType,
  scriptModuleRef,
} from "./manifest.js";
import {
  captionDocumentValue,
  narrativeCaptionBinding,
  narrativeDialogueTextValue,
  narrativeMomentValue,
  narrativeSegmentExcerptValue,
  narrativeSelectionValue,
  narrativeSpeechTextValue,
  narrativeValue,
} from "./narrative.js";
import { parseScript } from "./parser.js";
import type { ParsedNarrative } from "./types.js";

const recordId = /^[a-z][a-z0-9_-]{0,63}$/u;

function scriptId(declaration: AuthorDeclaration, sourceName: string): string {
  const field = declarationField(declaration, "id");
  const id = field === undefined ? "script" : field.kind === "literal" ? field.value : undefined;
  if (id === undefined || !recordId.test(id)) {
    throw new ScriptSyntaxError(
      "SCRIPT_SURFACE_ID",
      "<script> id must be a canonical lower-case identifier.",
      sourceName,
      declaration.range.start,
    );
  }
  return id;
}

function parsedScript(declaration: AuthorDeclaration, sourceName: string): ParsedNarrative {
  return parseScript(
    sourceName,
    declaration.text ?? "",
    declaration.textRange?.start ?? declaration.range.start,
  );
}

function bindingsFor(parsed: ParsedNarrative, id: string): AuthorDeclarationBinding[] {
  return [
    { name: id, ref: { kind: "record", id }, type: narrativeType },
    ...parsed.segments.flatMap((segment): AuthorDeclarationBinding[] => [
      { name: `${id}.segment.${segment.id}`, ref: { kind: "record", id: `${id}.segment.${segment.id}` }, type: narrativeSegmentRefType },
      { name: `${id}.segment.${segment.id}.dialogue`, ref: { kind: "record", id: `${id}.segment.${segment.id}.dialogue` }, type: textTypes.text },
      { name: `${id}.segment.${segment.id}.speech`, ref: { kind: "record", id: `${id}.segment.${segment.id}.speech` }, type: textTypes.text },
    ]),
    { name: `${id}.caption`, ref: { kind: "record", id: `${id}.caption` }, type: captionDocumentType },
    { name: `${id}.caption-binding`, ref: { kind: "record", id: `${id}.caption-binding` }, type: narrativeCaptionBindingType },
    ...parsed.selections.map((selection): AuthorDeclarationBinding => ({
      name: `${id}.selection.${selection.id}`,
      ref: { kind: "record", id: `${id}.selection.${selection.id}` },
      type: narrativeSelectionType,
    })),
    ...parsed.moments.map((moment): AuthorDeclarationBinding => ({
      name: `${id}.moment.${moment.id}`,
      ref: { kind: "record", id: `${id}.moment.${moment.id}` },
      type: narrativeMomentType,
    })),
  ];
}

/** Package-owned Script meaning, independent of the syntax that supplied its opaque body. */
export function compileScriptDeclaration(
  declaration: AuthorDeclaration,
  sourceName: string,
): AuthorDeclarationOutput {
  const id = scriptId(declaration, sourceName);
  const parsed = parsedScript(declaration, sourceName);
  const captionId = `${id}.caption`;
  return {
    records: [
      { id, type: narrativeType, value: narrativeValue(parsed, id), range: declaration.range },
      ...parsed.segments.flatMap((segment) => [
        {
          id: `${id}.segment.${segment.id}`,
          type: narrativeSegmentRefType,
          value: narrativeSegmentExcerptValue(segment, id),
          range: segment.range,
        },
        {
          id: `${id}.segment.${segment.id}.dialogue`,
          type: textTypes.text,
          value: narrativeDialogueTextValue(segment),
          range: segment.range,
        },
        {
          id: `${id}.segment.${segment.id}.speech`,
          type: textTypes.text,
          value: narrativeSpeechTextValue(segment),
          range: segment.range,
        },
      ]),
      {
        id: captionId,
        type: captionDocumentType,
        value: captionDocumentValue(parsed, captionId, id),
        range: declaration.range,
      },
      {
        id: `${id}.caption-binding`,
        type: narrativeCaptionBindingType,
        value: canonicalize(narrativeCaptionBinding(parsed, captionId, id, `${id}.caption-binding`)),
        range: declaration.range,
      },
      ...parsed.selections.map((selection) => ({
        id: `${id}.selection.${selection.id}`,
        type: narrativeSelectionType,
        value: narrativeSelectionValue(selection, id),
        range: { start: selection.open.range.start, end: selection.close.range.end },
      })),
      ...parsed.moments.map((moment) => ({
        id: `${id}.moment.${moment.id}`,
        type: narrativeMomentType,
        value: narrativeMomentValue(moment, id),
        range: moment.range,
      })),
    ],
    components: [],
    identities: [{ namespace: narrativeType, id }],
  };
}

export const scriptAuthorDeclaration: AuthorDeclarationCompiler = {
  module: scriptModuleRef,
  declaration: "script",
  outputs: [
    narrativeType,
    narrativeSegmentRefType,
    textTypes.text,
    narrativeSelectionType,
    narrativeMomentType,
    captionDocumentType,
    narrativeCaptionBindingType,
  ],
  shape: {
    summary: "Authors prose-first Narrative, semantic anchors and independent text and Caption views.",
    fields: [{
      name: "id",
      kind: "identifier",
      required: false,
      summary: "Names the Narrative and prefixes every view published from the Script.",
    }],
    text: "Exact Script prose, Segment, Role Cue, Dual Text, marker and token-attribute source.",
  },
  bindings(declaration, { sourceName }) {
    const id = scriptId(declaration, sourceName);
    return bindingsFor(parsedScript(declaration, sourceName), id);
  },
  compile({ declaration, sourceName }) {
    return compileScriptDeclaration(declaration, sourceName);
  },
};

export const scriptMarkupDeclaration = {
  name: "script",
  tag: "script",
  body: "opaque",
} as const;
