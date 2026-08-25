import type { SourceRange } from "@hypit/protocol";

import { narrativeValue } from "./narrative.js";
import { parseScript } from "./parser.js";
import type { Affinity, ParsedNarrative, SemanticAnchor } from "./types.js";

export type ScriptAnchorEditSite = {
  readonly anchorId: string;
  readonly kind: SemanticAnchor["kind"];
  readonly segmentId?: string;
  readonly offset: number;
  readonly affinity: Affinity;
  readonly placement: "before" | "after";
};

export type ScriptSelectionAdjustment = {
  readonly id: string;
  readonly startAnchorId: string;
  readonly endAnchorId: string;
};

export type ScriptMomentAdjustment = {
  readonly id: string;
  readonly anchorId: string;
};

type Edit = { readonly range: SourceRange; readonly replacement: string };

/** Script owns the exact source inverse of every one of its 2M + 2N + 2 anchors. */
export function scriptAnchorEditSites(parsed: ParsedNarrative): readonly ScriptAnchorEditSite[] {
  const segments = new Map(parsed.segments.map((segment) => [segment.id, segment] as const));
  const tokens = new Map(parsed.tokens.map((token) => [token.id, token] as const));
  return parsed.semanticIndex.anchors.map((anchor): ScriptAnchorEditSite => {
    if (anchor.kind === "program-start") {
      return {
        anchorId: anchor.id, kind: anchor.kind, offset: parsed.sourceRange.start,
        affinity: "left", placement: "before",
      };
    }
    if (anchor.kind === "program-end") {
      return {
        anchorId: anchor.id, kind: anchor.kind, offset: parsed.sourceRange.end,
        affinity: "right", placement: "after",
      };
    }
    const segmentId = anchor.segmentId;
    const segment = segments.get(segmentId);
    if (segment === undefined) throw new Error(`Semantic Anchor ${anchor.id} names unknown Segment ${segmentId}.`);
    if (anchor.kind === "segment-start") {
      const first = parsed.tokens[segment.tokenStart];
      return {
        anchorId: anchor.id, kind: anchor.kind, segmentId,
        offset: first?.range.start ?? segment.contentRange.start,
        affinity: "left", placement: "before",
      };
    }
    if (anchor.kind === "segment-end") {
      const last = parsed.tokens[segment.tokenEndExclusive - 1];
      return {
        anchorId: anchor.id, kind: anchor.kind, segmentId,
        offset: last?.range.end ?? segment.contentRange.end,
        affinity: "right", placement: "after",
      };
    }
    const token = anchor.tokenId === undefined ? undefined : tokens.get(anchor.tokenId);
    if (token === undefined) throw new Error(`Semantic Anchor ${anchor.id} names no Script Token.`);
    return anchor.kind === "token-start" ? {
      anchorId: anchor.id, kind: anchor.kind, segmentId,
      offset: token.range.start, affinity: "right", placement: "before",
    } : {
      anchorId: anchor.id, kind: anchor.kind, segmentId,
      offset: token.range.end, affinity: "left", placement: "after",
    };
  });
}

function marker(id: string, edge: "open" | "close", affinity: Affinity): string {
  if (edge === "open") return affinity === "left" ? `~@${id}` : `@${id}`;
  return affinity === "left" ? `@/${id}` : `@/${id}~`;
}

function insertion(id: string, edge: "open" | "close", site: ScriptAnchorEditSite): string {
  const value = marker(id, edge, site.affinity);
  return site.placement === "before" ? `${value} ` : ` ${value}`;
}

function momentInsertion(id: string, site: ScriptAnchorEditSite): string {
  const value = site.affinity === "left" ? `~@${id}!` : `@${id}!`;
  return site.placement === "before" ? `${value} ` : ` ${value}`;
}

function applyEdits(source: string, edits: readonly Edit[]): string {
  let next = source;
  const ordered = [...edits].sort((left, right) =>
    right.range.start - left.range.start || right.range.end - left.range.end);
  for (const edit of ordered) {
    if (edit.range.start < 0 || edit.range.end < edit.range.start || edit.range.end > source.length) {
      throw new Error("Script marker edit lies outside its Source.");
    }
    next = `${next.slice(0, edit.range.start)}${edit.replacement}${next.slice(edit.range.end)}`;
  }
  return next;
}

/**
 * Relocate one shared Selection by anchor identity. The returned Source is accepted only when
 * reparsing proves the requested public Narrative, so Studio never edits prose by frame guess.
 */
export function adjustScriptSelection(input: {
  readonly sourceName: string;
  readonly source: string;
  readonly parsed: ParsedNarrative;
  readonly adjustment: ScriptSelectionAdjustment;
}): string {
  const selection = input.parsed.selections.find((candidate) => candidate.id === input.adjustment.id);
  if (selection === undefined) throw new Error(`Script Selection ${input.adjustment.id} does not exist.`);
  const sites = new Map(scriptAnchorEditSites(input.parsed).map((site) => [site.anchorId, site] as const));
  const start = sites.get(input.adjustment.startAnchorId);
  const end = sites.get(input.adjustment.endAnchorId);
  if (start === undefined) throw new Error(`Selection start Anchor ${input.adjustment.startAnchorId} does not exist.`);
  if (end === undefined) throw new Error(`Selection end Anchor ${input.adjustment.endAnchorId} does not exist.`);

  const edits: Edit[] = [];
  if (selection.startAnchorId !== start.anchorId) {
    edits.push({ range: selection.open.range, replacement: "" });
    edits.push({ range: { start: start.offset, end: start.offset }, replacement: insertion(selection.id, "open", start) });
  }
  if (selection.endAnchorId !== end.anchorId) {
    edits.push({ range: selection.close.range, replacement: "" });
    edits.push({ range: { start: end.offset, end: end.offset }, replacement: insertion(selection.id, "close", end) });
  }
  if (edits.length === 0) return input.source;
  const next = applyEdits(input.source, edits);
  const reparsed = parseScript(input.sourceName, next);
  const rewritten = reparsed.selections.find((candidate) => candidate.id === selection.id);
  if (rewritten?.startAnchorId !== start.anchorId || rewritten.endAnchorId !== end.anchorId) {
    throw new Error(`Script refused to move Selection ${selection.id} to the requested Anchors.`);
  }
  const before = narrativeValue(input.parsed, "comparison") as unknown as { readonly selections: readonly { readonly id: string }[] };
  const after = narrativeValue(reparsed, "comparison") as unknown as { readonly selections: readonly { readonly id: string }[] };
  if (before.selections.length !== after.selections.length
    || before.selections.some((item) => !after.selections.some((candidate) => candidate.id === item.id))) {
    throw new Error("Script Selection adjustment changed authored identities.");
  }
  return next;
}

/** Relocate one Moment to an exact semantic Anchor without changing its identity. */
export function adjustScriptMoment(input: {
  readonly sourceName: string;
  readonly source: string;
  readonly parsed: ParsedNarrative;
  readonly adjustment: ScriptMomentAdjustment;
}): string {
  const moment = input.parsed.moments.find((candidate) => candidate.id === input.adjustment.id);
  if (moment === undefined) throw new Error(`Script Moment ${input.adjustment.id} does not exist.`);
  const site = scriptAnchorEditSites(input.parsed).find((candidate) => candidate.anchorId === input.adjustment.anchorId);
  if (site === undefined) throw new Error(`Moment Anchor ${input.adjustment.anchorId} does not exist.`);
  if (moment.anchorId === site.anchorId) return input.source;
  const next = applyEdits(input.source, [
    { range: moment.range, replacement: "" },
    { range: { start: site.offset, end: site.offset }, replacement: momentInsertion(moment.id, site) },
  ]);
  const reparsed = parseScript(input.sourceName, next);
  const rewritten = reparsed.moments.find((candidate) => candidate.id === moment.id);
  if (rewritten?.anchorId !== site.anchorId) {
    throw new Error(`Script refused to move Moment ${moment.id} to the requested Anchor.`);
  }
  if (reparsed.moments.length !== input.parsed.moments.length
    || input.parsed.moments.some((item) => !reparsed.moments.some((candidate) => candidate.id === item.id))) {
    throw new Error("Script Moment adjustment changed authored identities.");
  }
  return next;
}
