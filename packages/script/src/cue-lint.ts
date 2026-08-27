import type { ParsedNarrative } from "./types.js";
import { captionDocument } from "./narrative.js";

export type CaptionCueLengthViolation = {
  readonly segment: string;
  readonly cue: number;
  readonly wordCount: number;
  readonly maxWords: number;
  readonly sourceRange: { readonly start: number; readonly end: number };
  readonly message: string;
};

/**
 * Mechanical layout guard for authored caption Cues.  The count is based on visible display words,
 * not punctuation or renderer line wrapping, and therefore also covers Dual Text aliases.
 */
export function validateCaptionCueLengths(
  parsed: ParsedNarrative,
  options: { readonly maxWords?: number } = {},
): readonly CaptionCueLengthViolation[] {
  const maxWords = options.maxWords ?? 4;
  if (!Number.isSafeInteger(maxWords) || maxWords < 1) throw new Error("maxWords must be a positive integer");
  const document = captionDocument(parsed, "__cue_lint__", parsed.segments[0]?.id ?? "__cue_lint__");
  const breaks = new Set(document.cueBreaks.map((item) => item.afterUnitId));
  const violations: CaptionCueLengthViolation[] = [];
  let cueWords = 0;
  let cueStart = 0;
  let cueOrdinal = 1;
  let cueSegment = document.units[0]?.segmentId;
  const flush = (endExclusive: number): void => {
    if (cueWords <= maxWords || document.units.length === 0) return;
    const first = document.units[cueStart];
    const last = document.units[Math.max(cueStart, endExclusive - 1)];
    const tokenIds = [...(first?.sourceTokenIds ?? []), ...(last?.sourceTokenIds ?? [])];
    const tokenById = new Map(parsed.tokens.map((token) => [token.id, token]));
    const ranges = tokenIds.map((id) => tokenById.get(id)?.range).filter((range): range is { start: number; end: number } => range !== undefined);
    const sourceRange = ranges.length === 0
      ? { start: parsed.sourceRange.start, end: parsed.sourceRange.end }
      : { start: Math.min(...ranges.map((range) => range.start)), end: Math.max(...ranges.map((range) => range.end)) };
    violations.push({
      segment: first?.segmentId ?? "unknown",
      cue: cueOrdinal,
      wordCount: cueWords,
      maxWords,
      sourceRange,
      message: "Split this Cue with ||; captions normally contain no more than four spoken words.",
    });
  };
  for (let index = 0; index < document.units.length; index += 1) {
    const unit = document.units[index]!;
    if (cueSegment !== undefined && unit.segmentId !== cueSegment) {
      // Segment close is an implicit hard boundary.  Diagnostics are numbered within the
      // Segment that owns the Cue, rather than carrying an ordinal across independent takes.
      cueWords = 0;
      cueStart = index;
      cueOrdinal = 1;
      cueSegment = unit.segmentId;
    }
    cueWords += unit.wordIds.length;
    if (breaks.has(unit.id)) {
      flush(index + 1);
      cueWords = 0;
      cueStart = index + 1;
      cueOrdinal += 1;
    }
  }
  flush(document.units.length);
  return violations;
}
