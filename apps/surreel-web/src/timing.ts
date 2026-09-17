export const CLIP_MAX_SECONDS = 15;
export const CLIP_MIN_SECONDS = 5;

export function clipDurations(duration: number): number[] {
  const total = Math.min(60, Math.max(CLIP_MIN_SECONDS, Math.round(duration)));
  if (total <= CLIP_MAX_SECONDS) return [total];
  const count = Math.ceil(total / CLIP_MAX_SECONDS);
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

export function clipSeconds(duration: number): number {
  return Math.min(CLIP_MAX_SECONDS, Math.max(CLIP_MIN_SECONDS, Math.round(duration)));
}

export const WORDS_PER_SEC = 2;

export function wordBudget(seconds: number): number {
  return Math.max(8, Math.floor(clipSeconds(seconds) * WORDS_PER_SEC));
}

export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function fitVoice(text: string, seconds: number): string {
  return wordsOf(text).slice(0, wordBudget(seconds)).join(" ");
}

export function uniqueJoin(pieces: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of pieces) {
    const next = piece.trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out.join(" ");
}

export function splitByWordBudget(text: string | undefined, durations: number[]): string[] {
  const tokens = wordsOf(text ?? "");
  if (durations.length === 0) return [];
  if (tokens.length === 0) return durations.map(() => "");
  let offset = 0;
  return durations.map((seconds) => {
    const budget = wordBudget(seconds);
    const chunk = tokens.slice(offset, offset + budget).join(" ");
    offset += budget;
    return chunk;
  });
}

export function paceVoices(pieces: string[], fallback: string | undefined, durations: number[]): string[] {
  const trimmed = pieces.map((piece) => piece.trim());
  const fits =
    trimmed.length === durations.length &&
    trimmed.every((piece, index) => piece.length >= 4 && wordsOf(piece).length <= wordBudget(durations[index]) * 1.15);
  if (fits) return trimmed.map((piece, index) => fitVoice(piece, durations[index]));
  return splitByWordBudget(uniqueJoin(trimmed) || fallback, durations);
}

export function splitLines(text: string | undefined, count: number): string[] {
  const lines = (text ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);
  if (count <= 1) return [lines.join("\n")];
  if (lines.length === 0) return Array.from({ length: count }, () => "");
  const size = Math.max(1, Math.ceil(lines.length / count));
  return Array.from({ length: count }, (_, index) => lines.slice(index * size, (index + 1) * size).join("\n"));
}
