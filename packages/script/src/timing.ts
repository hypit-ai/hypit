import {
  assertExactTemporalValue, compareExactTemporalValues as compare, exactTemporalRational, exactTemporalValue,
  exactTemporalZero, type ExactTemporalValue, type TemporalRange,
} from "@hypit/temporal/algebra";
import { assertTimedTranscript, type TimedTranscript } from "@hypit/timed-transcript";
import type { ScriptBoundary, ScriptCue, ScriptSegment, ScriptUnit, SpokenRange } from "./types.js";

export type TimedScriptWord = TemporalRange & { readonly word: string };
export type TimedScriptUnit = ScriptUnit & { readonly window: TemporalRange };
export type TimedScriptCue = Omit<ScriptCue, "units"> & {
  readonly units: readonly TimedScriptUnit[];
  readonly window: TemporalRange;
};

export type ScriptTiming = {
  readonly words: readonly TimedScriptWord[];
  readonly cues: readonly TimedScriptCue[];
  moment(name: string): ExactTemporalValue;
  selection(name: string): TemporalRange;
};

const ticksPerSecond = 10_000_000n;

function windowTick(time: ExactTemporalValue): bigint {
  const { numerator, denominator } = exactTemporalRational(time);
  return (numerator * ticksPerSecond * 2n + denominator) / (denominator * 2n);
}

function envelope(ranges: readonly TemporalRange[]): TemporalRange {
  let { start, end } = ranges[0]!;
  for (const range of ranges.slice(1)) {
    if (compare(range.start, start) < 0) start = range.start;
    if (compare(range.end, end) > 0) end = range.end;
  }
  return { start, end };
}

/** Bind an authored Segment to complete word timing on the supplied source clock. */
export function bindScriptTiming(segment: ScriptSegment, transcript: TimedTranscript,
  { window }: { readonly window: TemporalRange }): ScriptTiming {
  const label = `Script Segment ${segment.id}`;
  assertTimedTranscript(transcript);
  assertExactTemporalValue(window.start, `${label} window start`);
  assertExactTemporalValue(window.end, `${label} window end`);
  if (compare(window.start, exactTemporalZero()) < 0 || compare(window.start, window.end) > 0) {
    throw new Error(`${label} requires an ordered nonnegative source window.`);
  }
  if (segment.spokenWords.length !== transcript.words.length) {
    throw new Error(`${label} has ${segment.spokenWords.length} spoken words and ${transcript.words.length} transcript words. Align the transcript to this Segment.`);
  }

  const firstTick = windowTick(window.start), lastTick = windowTick(window.end);
  function sourceTime(seconds: number, word: number): ExactTemporalValue {
    const ticks = Math.round(seconds * Number(ticksPerSecond));
    if (!Number.isSafeInteger(ticks)) throw new Error(`${label} word ${word} exceeds transcript time precision.`);
    const numerator = BigInt(ticks);
    if (numerator < firstTick || numerator > lastTick) throw new Error(`${label} word ${word} is outside the selected source window.`);
    const time = exactTemporalValue({ numerator, denominator: ticksPerSecond });
    if (compare(time, window.start) < 0) return window.start;
    if (compare(time, window.end) > 0) return window.end;
    return time;
  }

  const words = segment.spokenWords.map((word, index) => {
    const timed = transcript.words[index]!;
    if (timed.word !== word || timed.start === undefined || timed.end === undefined) {
      throw new Error(`${label} word ${index + 1} must be timed and match ${JSON.stringify(word)}. Align the transcript to this Segment.`);
    }
    return { word, start: sourceTime(timed.start, index + 1), end: sourceTime(timed.end, index + 1) };
  });

  const spokenWindow = ({ startWord, endWordExclusive }: SpokenRange) => envelope(words.slice(startWord, endWordExclusive));
  const cues = segment.cues.map(cue => {
    const units = cue.units.map(unit => ({ ...unit, window: spokenWindow(unit.spoken) }));
    return { ...cue, units, window: envelope(units.map(unit => unit.window)) };
  });

  function boundary(edge: ScriptBoundary): ExactTemporalValue {
    if ("word" in edge) return words[edge.word]![edge.edge];
    return edge.edge === "segment-start" ? window.start : window.end;
  }

  return {
    words, cues,
    moment(name) {
      const marker = segment.moments.get(name);
      if (!marker) throw new Error(`${label} has no moment named ${name}.`);
      return boundary(marker);
    },
    selection(name) {
      const selection = segment.selections.get(name);
      if (!selection) throw new Error(`${label} has no selection named ${name}.`);
      const start = boundary(selection.start), end = boundary(selection.end);
      if (compare(start, end) > 0) throw new Error(`${label} selection ${name} has reversed boundaries on the selected source clock.`);
      return { start, end };
    },
  };
}
