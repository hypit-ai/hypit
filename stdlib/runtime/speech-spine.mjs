import { elements, material, resolveAttr, stringAttr } from "./helpers.mjs";

export default {
  abiVersion: "1",
  project(context) {
    const segmentOutputs = {};
    const audios = [];
    for (const segment of elements(context, "segment")) {
      const id = stringAttr(segment, "id");
      const located = resolveAttr(context, segment, "script");
      const visual = material(resolveAttr(context, segment, "visual"), "video");
      const audioValue = segment.attributes.audio
        ? material(resolveAttr(context, segment, "audio"), "audio")
        : { source: visual.source };
      segmentOutputs[id] = {
        range: located,
        visual: {
          type: "Video",
          source: visual.source,
          range: located,
        },
        audio: {
          type: "Audio",
          source: audioValue.source,
          range: located,
        },
      };
      audios.push({
        id: `${context.instance.id}:speech:${id}`,
        source: audioValue.source,
        startFrame: located.startFrame,
        endFrameExclusive: located.endFrameExclusive,
        volume: 1,
        bus: "speech",
      });
    }
    return {
      outputs: {
        segment: segmentOutputs,
        speech: {
          segments: segmentOutputs,
          primaryAudio: audios,
        },
        track: { visuals: [], audios, styles: [] },
      },
      audios,
    };
  },
};
