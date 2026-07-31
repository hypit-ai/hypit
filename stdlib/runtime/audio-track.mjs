import {
  durationSeconds,
  elements,
  material,
  numberAttr,
  resolveAttr,
  stringAttr,
  trackOutput,
} from "./helpers.mjs";

export default {
  abiVersion: "1",
  project(context) {
    const audios = [];
    for (const item of elements(context, "item")) {
      const id = stringAttr(item, "id");
      const source = material(resolveAttr(context, item, "source"), "audio");
      const ranges = item.attributes.at
        ? context.moment(item.attributes.at, "item.at").map((startFrame) => {
            const durationFrames = Math.max(
              1,
              Math.round(durationSeconds(stringAttr(item, "duration")) * context.fps),
            );
            return {
              startFrame,
              endFrameExclusive: Math.min(
                context.program.durationFrames,
                startFrame + durationFrames,
              ),
            };
          })
        : context.selection(item.attributes.during ?? "full", "item.during");
      for (const [index, range] of ranges.entries()) {
        audios.push({
          id: `${context.instance.id}:${id}:${index}`,
          source: source.source,
          startFrame: range.startFrame,
          endFrameExclusive: range.endFrameExclusive,
          volume: numberAttr(item, "volume", 1),
          fadeInSec: numberAttr(item, "fadeIn", 0),
          fadeOutSec: numberAttr(item, "fadeOut", 0),
          bus: stringAttr(item, "bus", "music"),
        });
      }
    }
    return trackOutput([], audios);
  },
};
