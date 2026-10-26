import { preparedVisualSource } from "@hypit/media";
import { composeTemporalMaps } from "@hypit/temporal";
import { preparedSampling } from "./frame-sampling.js";

export function placedVisualMedia(timeline, window, sources) {
  const clips = sources.flatMap((source) => {
    if (source.window.start.timelineId !== timeline.id || source.window.end.timelineId !== timeline.id)
      throw Error(`Visual source ${source.id} belongs to another Timeline.`);
    const placed = source.window.span;
    const startFrame = Math.max(placed.startFrame, window.span.startFrame);
    const endFrameExclusive = Math.min(
      placed.endFrameExclusive,
      window.span.endFrameExclusive,
    );
    if (endFrameExclusive <= startFrame) return [];
    return [{
      source,
      span: { startFrame, endFrameExclusive },
      sourceAtStartFrame: startFrame - placed.startFrame,
    }];
  });
  const children = clips.map((clip, index) => ({
    id: "source-" + index,
    kind: "video",
    muted: true,
    source: preparedVisualSource(clip.source.media),
    style: Object.entries({
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      "object-fit": "cover",
    }).map(([name, value]) => ({ name, value })),
    sampling: composeTemporalMaps(preparedSampling(`source-${index}`, timeline.frameRate,
      window.span.endFrameExclusive - window.span.startFrame,
      clip.source.media.domain, [{
        target: {
          startFrame: clip.span.startFrame - window.span.startFrame,
          endFrameExclusive:
            clip.span.endFrameExclusive - window.span.startFrame,
        },
        sourceAtStartFrame: clip.sourceAtStartFrame,
        rate: { numerator: 1, denominator: 1 },
      }]), clip.source.media.visual.map),
  }));
  return { clips, children };
}
