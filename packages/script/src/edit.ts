import { canonicalStringify } from "@hypit/hypit/protocol";
import type { SourceRange } from "@hypit/hypit/source";
import { captionDocument, narrativeValue } from "./narrative.js";
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

/** Script owns the exact source inverse of every one of its 2M + 2N anchors. */
export function scriptAnchorEditSites(parsed: ParsedNarrative): readonly ScriptAnchorEditSite[] {
  const segments = new Map(parsed.segments.map((segment) => [segment.id, segment] as const));
  const tokens = new Map(parsed.tokens.map((token) => [token.id, token] as const));
  return parsed.anchors.map((anchor): ScriptAnchorEditSite => {
    const segmentId = anchor.segmentId;
    const segment = segments.get(segmentId);
    if (segment === undefined) throw new Error(`Semantic Anchor ${anchor.id} names unknown Segment ${segmentId}.`);
    if (anchor.kind === "segment-start") {
      return {
        anchorId: anchor.id, kind: anchor.kind, segmentId,
        offset: segment.contentRange.start,
        affinity: "left", placement: "before",
      };
    }
    if (anchor.kind === "segment-end") {
      return {
        anchorId: anchor.id, kind: anchor.kind, segmentId,
        offset: segment.contentRange.end,
        affinity: "right", placement: "after",
      };
    }
    const token = anchor.tokenId === undefined ? undefined : tokens.get(anchor.tokenId);
    if (token === undefined) throw new Error(`Semantic Anchor ${anchor.id} names no Script Token.`);
    return anchor.kind === "token-start" ? {
      anchorId: anchor.id, kind: anchor.kind, segmentId,
      offset: token.editRange.start, affinity: "right", placement: "before",
    } : {
      anchorId: anchor.id, kind: anchor.kind, segmentId,
      offset: token.editRange.end, affinity: "left", placement: "after",
    };
  });
}

function marker(id: string, edge: "open" | "close", affinity: Affinity): string {
  if (edge === "open") return `@{${affinity === "left" ? "~" : ""}${id}}`;
  return `@{/${id}${affinity === "right" ? "~" : ""}}`;
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

type AdjustmentInput = {
  readonly sourceName: string;
  readonly source: string;
  readonly parsed: ParsedNarrative;
};

type NamedAnchor = { readonly id: string; readonly edge: "open" | "close" | "moment"; readonly anchorId: string };

/** Move only the requested markers. Delimited names never require editing prose separators. */
function rewrite(input: AdjustmentInput, markers: readonly NamedAnchor[]): string {
  const original = namedAnchors(input.parsed);
  const changedNames = new Set(markers.filter(value => original.find(item => item.id === value.id && item.edge === value.edge)?.anchorId !== value.anchorId).map(value => value.id));
  const moved = markers.filter(value => changedNames.has(value.id));
  if (moved.length === 0) return input.source;
  const origin = input.parsed.sourceRange.start;
  const edits: Edit[] = moved.map(value => {
    const range = value.edge === "moment"
      ? input.parsed.moments.find(item => item.id === value.id)!.range
      : input.parsed.selections.find(item => item.id === value.id)![value.edge].range;
    return { range: { start: range.start - origin, end: range.end - origin }, replacement: "" };
  });
  for (const segment of input.parsed.segments) {
    if (segment.selfClosing && moved.some(value => value.anchorId === segment.startAnchorId || value.anchorId === segment.endAnchorId)) {
      edits.push({ range: { start: segment.range.start - origin, end: segment.range.end - origin }, replacement: `<${segment.id}></${segment.id}>` });
    }
  }
  const base = applyEdits(input.source, edits);
  const parsed = parseScript(input.sourceName, base, origin);
  const sites = new Map(scriptAnchorEditSites(parsed).map((site, order) => [site.anchorId, { ...site, order }]));
  const groups = new Map<number, Array<NamedAnchor & { affinity: Affinity; order: number }>>();
  for (const value of moved) {
    const site = sites.get(value.anchorId);
    if (!site) throw new Error(`Semantic Anchor ${value.anchorId} does not exist.`);
    const offset = site.offset - origin;
    const group = groups.get(offset) ?? [];
    group.push({ ...value, affinity: site.affinity, order: site.order });
    groups.set(offset, group);
  }
  const insertions: Edit[] = [...groups].map(([offset, group]) => {
    group.sort((a, b) => a.order - b.order
      || (a.edge === "open" ? 0 : a.edge === "moment" ? 1 : 2) - (b.edge === "open" ? 0 : b.edge === "moment" ? 1 : 2)
      || a.id.localeCompare(b.id));
    const replacement = group.map(item => item.edge === "moment"
      ? `@{${item.affinity === "left" ? "~" : ""}${item.id}!}`
      : marker(item.id, item.edge, item.affinity)).join("");
    return { range: { start: offset, end: offset }, replacement };
  });
  const next = applyEdits(base, insertions);
  const reparsed = parseScript(input.sourceName, next, origin);
  const actual = namedAnchors(reparsed);
  if (canonicalStringify(actual) !== canonicalStringify(markers)) {
    throw new Error("Script marker adjustment did not preserve the requested semantic bindings.");
  }
  // Compare public content, not source offsets or marker-induced parser atom boundaries.
  const content = (value: ParsedNarrative) => ({
    ...narrativeValue(value, "comparison") as Record<string, unknown>, selections: [], moments: [],
    caption: captionDocument(value, "caption", "comparison"),
    speech: value.serializations.speech,
    dialogue: value.serializations.dialogue,
    display: value.captionProjection.text,
  });
  if (canonicalStringify(content(input.parsed)) !== canonicalStringify(content(reparsed))) {
    throw new Error("Script marker adjustment changed authored content.");
  }
  return next;
}

function namedAnchors(parsed: ParsedNarrative): NamedAnchor[] {
  return [
    ...parsed.selections.flatMap((item): NamedAnchor[] => [
      { id: item.id, edge: "open", anchorId: item.startAnchorId },
      { id: item.id, edge: "close", anchorId: item.endAnchorId },
    ]),
    ...parsed.moments.map((item): NamedAnchor => ({ id: item.id, edge: "moment", anchorId: item.anchorId })),
  ];
}

/** Rewrite a Selection's two endpoints together; Script owns order, not projected time. */
export function adjustScriptSelection(input: AdjustmentInput & { readonly adjustment: ScriptSelectionAdjustment }): string {
  const { adjustment, parsed } = input;
  const selection = parsed.selections.find((item) => item.id === adjustment.id);
  if (!selection) throw new Error(`Script Selection ${adjustment.id} does not exist.`);
  const order = parsed.anchors.map((anchor) => anchor.id);
  const start = order.indexOf(adjustment.startAnchorId);
  const end = order.indexOf(adjustment.endAnchorId);
  if (start < 0 || end < start) throw new Error("Selection endpoints must follow Script anchor order.");
  return rewrite(input, namedAnchors(parsed).map((item) => item.id !== adjustment.id ? item : {
    ...item, anchorId: item.edge === "open" ? adjustment.startAnchorId : adjustment.endAnchorId,
  }));
}

/** Relocate a Moment by identity, independently of coincident projected Frames. */
export function adjustScriptMoment(input: AdjustmentInput & { readonly adjustment: ScriptMomentAdjustment }): string {
  const moment = input.parsed.moments.find((item) => item.id === input.adjustment.id);
  if (!moment) throw new Error(`Script Moment ${input.adjustment.id} does not exist.`);
  return rewrite(input, namedAnchors(input.parsed).map((item) => item.id !== input.adjustment.id ? item : {
    ...item, anchorId: input.adjustment.anchorId,
  }));
}
