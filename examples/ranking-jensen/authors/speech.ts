import { seconds } from "@hypit/nle/authoring";
import {
  addExactTemporalValues as add, compareExactTemporalValues as compare, subtractExactTemporalValues as subtract,
  type ExactTemporalValue as Time, type TemporalRange,
} from "@hypit/temporal/algebra";
import type { TimedScriptCue } from "@hypit/script/timing";

export type Cue = TimedScriptCue & TemporalRange;

const lead = seconds("1/12"), tail = seconds("1/12");
const earlier = (left: Time, right: Time) => compare(left, right) <= 0 ? left : right;
const later = (left: Time, right: Time) => compare(left, right) >= 0 ? left : right;

/** Jensen gives each cue a short lead and tail for its fades. */
export function captionVisibility(timed: readonly TimedScriptCue[], window: TemporalRange): readonly Cue[] {
  const cues = timed.map(cue => ({ ...cue, start: later(window.start, subtract(cue.window.start, lead)),
    end: earlier(window.end, add(cue.window.end, tail)) }));

  // Cut same-role cue padding at the spoken handoff and keep measured word windows intact.
  const previousByRole = new Map<string | undefined, typeof cues[number]>();
  for (const current of cues) {
    const previous = previousByRole.get(current.role);
    previousByRole.set(current.role, current);
    const nextWordStart = current.window.start;
    if (previous === undefined || compare(previous.window.end, nextWordStart) > 0) continue;
    previous.end = earlier(previous.end, nextWordStart);
    current.start = later(current.start, previous.end);
  }
  return cues;
}
