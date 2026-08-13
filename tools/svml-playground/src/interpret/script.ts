import type { MarkupAttributeValue } from "@narratage/markup";
import { decodeScriptSurface, parseScript } from "@narratage/script";
import type { ParsedNarrative } from "@narratage/script";

import type { Range, ScriptMap } from "../shared.js";
import { Scope } from "./scope.js";

export type ScriptResult = {
  readonly nextOffset: number;
  readonly parsed: ParsedNarrative;
  readonly map: ScriptMap;
};

/**
 * Script is the one Raw Surface in the language: its body is prose with markers,
 * not markup, so the structured element parser must never see it. Decode it with
 * the real handler, then re-parse the same slice for the token text the
 * estimator needs.
 */
export function interpretScript(
  sourceName: string,
  source: string,
  tag: string,
  openingStart: number,
  contentStart: number,
  attributes: Readonly<Record<string, MarkupAttributeValue>>,
  scope: Scope,
): ScriptResult {
  const output = decodeScriptSurface({
    sourceName,
    source,
    tag,
    openingStart,
    contentStart,
    // A reference attribute on <script> is rejected by the handler itself.
    attributes: attributes as Readonly<Record<string, string>>,
    });
  for (const record of output.records) {
    if (record.value.kind !== "inline") continue;
    scope.define(record.id, record.type, record.value.value, record.range);
  }

  // nextOffset lands past "</tag>", so the body ends exactly that much earlier.
  const contentEnd = output.nextOffset - (tag.length + 3);
  // parseScript takes an absolute base offset, so every range it reports already
  // indexes the .svml file rather than the extracted body.
  const parsed = parseScript(sourceName, source.slice(contentStart, contentEnd), contentStart);

  const recordId = typeof attributes.id === "string" ? attributes.id : "script";
  const range: Range = { start: openingStart, end: output.nextOffset };
  const map: ScriptMap = {
    recordId,
    range,
    // A Segment is the outermost range the Script declares. Nothing encloses
    // it, so it is the depth every Selection is measured against.
    segments: parsed.segments.map((segment) => ({ id: segment.id, depth: 0, range: segment.range })),
    selections: parsed.selections.map((selection) => ({
      id: selection.id,
      // Plus the Segment that necessarily encloses it.
      depth: enclosing(parsed.selections, selection) + 1,
      occurrences: selection.occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        open: occurrence.open.range,
        close: occurrence.close.range,
      })),
    })),
    moments: parsed.moments.map((moment) => ({
      id: moment.id,
      occurrences: moment.occurrences.map((occurrence) => ({
        occurrence: occurrence.occurrence,
        range: occurrence.range,
      })),
    })),
    // Filled once the timeline exists; the parser knows where each token is
    // written but not yet when it is spoken.
    tokens: parsed.tokens.map((token) => ({
      id: token.id, range: token.range, startFrame: 0, endFrame: 0,
    })),
  };
  return { nextOffset: output.nextOffset, parsed, map };
}

/**
 * How many other Selections enclose this one.
 *
 * Depth is the only thing that distinguishes two ranges visually, because it is
 * the only difference that means anything: each level in is a narrower claim
 * about the same speech. A Segment is level 0, a Selection written inside one
 * is level 1, and a Selection inside that is level 2. Two ranges at the same
 * level are the same kind of thing and read the same.
 */
function enclosing(all: ParsedNarrative["selections"], selection: ParsedNarrative["selections"][number]): number {
  const span = {
    start: selection.occurrences[0]!.open.range.start,
    end: selection.occurrences.at(-1)!.close.range.end,
  };
  return all.filter((other) => {
    if (other.id === selection.id) return false;
    const outer = {
      start: other.occurrences[0]!.open.range.start,
      end: other.occurrences.at(-1)!.close.range.end,
    };
    return outer.start <= span.start && outer.end >= span.end
      && (outer.start < span.start || outer.end > span.end);
  }).length;
}

/**
 * Marker spans as an author sees them: a Selection covers its opening marker
 * through its closing marker, so highlighting one highlights the whole phrase.
 */
export function markerRanges(map: ScriptMap | undefined) {
  return {
    selection(id: string, occurrence: number): Range | undefined {
      const found = map?.selections.find((item) => item.id === id)
        ?.occurrences.find((item) => item.occurrence === occurrence);
      return found === undefined ? undefined : { start: found.open.start, end: found.close.end };
    },
    segment(id: string): Range | undefined {
      return map?.segments.find((item) => item.id === id)?.range;
    },
    moment(id: string, occurrence: number): Range | undefined {
      return map?.moments.find((item) => item.id === id)
        ?.occurrences.find((item) => item.occurrence === occurrence)?.range;
    },
  };
}
