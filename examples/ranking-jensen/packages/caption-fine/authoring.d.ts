import type { NleComponentItem, NleMediaItem, NlePictureAppearance, NleValueBinding } from "@hypit/nle";
import type { TimedScriptCue } from "@hypit/script/timing";
import type { TemporalRange } from "@hypit/temporal/algebra";

/** Create a Fine Caption subtitle Item from a bound source-clock cue and its chosen Media placement. */
export function captionItemFromScriptCue(cue: TimedScriptCue, placement: NleMediaItem, options: {
  readonly id: string;
  readonly documentId: string;
  readonly picture: NlePictureAppearance;
  readonly style: NleValueBinding<Readonly<Record<string, unknown>>>;
  readonly window?: TemporalRange;
}): NleComponentItem;
