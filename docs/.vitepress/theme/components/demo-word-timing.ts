export type TimedWordCue = {
  start: number;
  end: number;
};

export const MAX_WORD_GAP_FILL = .5;

export function wordAtTime<T extends TimedWordCue>(words: readonly T[], time: number): T | null {
  for (const [index, cue] of words.entries()) {
    const nextStart = words[index + 1]?.start;
    const effectiveEnd = nextStart !== undefined && nextStart > cue.end
      ? Math.min(nextStart, cue.end + MAX_WORD_GAP_FILL)
      : cue.end;

    if (time >= cue.start && time < effectiveEnd) return cue;
  }

  return null;
}
