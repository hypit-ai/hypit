import type { SourceRange } from "@hypit/protocol";

import { canonicalStringify } from "@hypit/protocol";
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
  if (edge === "open") return affinity === "left" ? `~@${id}` : `@${id}`;
  return affinity === "left" ? `@/${id}` : `@/${id}~`;
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

/** One canonical boundary spelling, independent of the order of previous gestures. */
function rewrite(input: AdjustmentInput, markers: readonly NamedAnchor[]): string {
  const ranges = [
    ...input.parsed.moments.map((item) => item.range),
    ...input.parsed.selections.flatMap((item) => [item.open.range, item.close.range]),
  ].map((range) => ({ start: range.start - input.parsed.sourceRange.start, end: range.end - input.parsed.sourceRange.start }))
    .sort((a, b) => a.start - b.start);
  const removals: Edit[] = [];
  for (const range of ranges) {
    let start = range.start;
    let end = range.end;
    while (start > 0 && /[ \t]/u.test(input.source[start - 1]!)) start -= 1;
    while (end < input.source.length && /[ \t]/u.test(input.source[end]!)) end += 1;
    const previous = removals.at(-1);
    if (previous && start <= previous.range.end) {
      removals[removals.length - 1] = { range: { start: previous.range.start, end }, replacement: "" };
    } else removals.push({ range: { start, end }, replacement: "" });
  }
  const edits = removals.map(({ range }): Edit => {
    const original = input.source.slice(range.start, range.end);
    // Keep line indentation; elsewhere all horizontal spellings of this gap are one space.
    const indentation = range.start === 0 || /[\r\n]/u.test(input.source[range.start - 1]!);
    const gap = indentation ? /^[ \t]*/u.exec(original)![0] : /[ \t]/u.test(original) ? " " : "";
    return { range, replacement: gap };
  });
  for (const segment of input.parsed.segments) {
    if (segment.selfClosing) edits.push({ range: { start: segment.range.start - input.parsed.sourceRange.start, end: segment.range.end - input.parsed.sourceRange.start }, replacement: `<${segment.id}></${segment.id}>` });
  }
  const base = applyEdits(input.source, edits);
  const parsed = parseScript(input.sourceName, base);
  const sites = new Map(scriptAnchorEditSites(parsed).map((site, order) => [site.anchorId, { ...site, order }]));
  const groups = new Map<number, Array<NamedAnchor & { affinity: Affinity; order: number }>>();
  for (const value of markers) {
    const site = sites.get(value.anchorId);
    if (!site) throw new Error(`Semantic Anchor ${value.anchorId} does not exist.`);
    let offset = site.offset;
    // Reuse horizontal separators without moving a word marker ahead of line indentation.
    let gapStart = offset;
    while (gapStart > 0 && /[ \t]/u.test(base[gapStart - 1]!)) gapStart -= 1;
    if (gapStart > 0 && !/[\r\n]/u.test(base[gapStart - 1]!)) offset = gapStart;
    const group = groups.get(offset) ?? [];
    group.push({ ...value, affinity: site.affinity, order: site.order });
    groups.set(offset, group);
  }
  const insertions: Edit[] = [...groups].map(([offset, group]) => {
    group.sort((a, b) => a.order - b.order
      || (a.edge === "open" ? 0 : a.edge === "moment" ? 1 : 2) - (b.edge === "open" ? 0 : b.edge === "moment" ? 1 : 2)
      || a.id.localeCompare(b.id));
    let replacement = group.map((item) => item.edge === "moment"
      ? `${item.affinity === "left" ? "~" : ""}@${item.id}!`
      : marker(item.id, item.edge, item.affinity)).join("");
    let end = offset;
    while (end < base.length && /[ \t]/u.test(base[end]!)) end += 1;
    if (end > offset) replacement += " ";
    // Only undelimited names followed by an ASCII name character need a separator.
    if (/[a-z0-9_-]$/u.test(replacement) && /[A-Za-z0-9_-]/u.test(base[offset] ?? "")) replacement += " ";
    return { range: { start: offset, end }, replacement };
  });
  const next = applyEdits(base, insertions);
  const reparsed = parseScript(input.sourceName, next);
  const actual = namedAnchors(reparsed);
  if (canonicalStringify(actual) !== canonicalStringify(markers)) {
    throw new Error("Script marker adjustment did not preserve the requested semantic bindings.");
  }
  // Compare public content, not source offsets or marker-induced parser atom boundaries.
  const content = (value: ParsedNarrative) => ({
    ...narrativeValue(value, "comparison") as Record<string, unknown>, selections: [], moments: [],
    caption: captionDocument(value, "caption", "comparison"),
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
  const order = parsed.semanticIndex.anchors.map((anchor) => anchor.id);
  const start = order.indexOf(adjustment.startAnchorId);
  const end = order.indexOf(adjustment.endAnchorId);
  if (start < 0 || end < start) throw new Error("Selection endpoints must follow Script anchor order.");
  if (selection.startAnchorId === adjustment.startAnchorId && selection.endAnchorId === adjustment.endAnchorId) return input.source;
  return rewrite(input, namedAnchors(parsed).map((item) => item.id !== adjustment.id ? item : {
    ...item, anchorId: item.edge === "open" ? adjustment.startAnchorId : adjustment.endAnchorId,
  }));
}

/** Relocate a Moment by identity, independently of coincident projected Frames. */
export function adjustScriptMoment(input: AdjustmentInput & { readonly adjustment: ScriptMomentAdjustment }): string {
  const moment = input.parsed.moments.find((item) => item.id === input.adjustment.id);
  if (!moment) throw new Error(`Script Moment ${input.adjustment.id} does not exist.`);
  if (moment.anchorId === input.adjustment.anchorId) return input.source;
  return rewrite(input, namedAnchors(input.parsed).map((item) => item.id !== input.adjustment.id ? item : {
    ...item, anchorId: input.adjustment.anchorId,
  }));
}
