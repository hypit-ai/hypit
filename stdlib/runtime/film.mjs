import { elements, numberAttr, resolveAttr, stringAttr } from "./helpers.mjs";

export default {
  abiVersion: "1",
  project(context) {
    const visuals = [];
    const audios = [];
    const styles = [];
    const speech = resolveAttr(context, context.element, "speech");
    const speechTrack = speech.track ?? speech.speech?.track;
    if (speechTrack) {
      visuals.push(...(speechTrack.visuals ?? []));
      audios.push(...(speechTrack.audios ?? []));
      styles.push(...(speechTrack.styles ?? []));
    } else if (speech.speech?.primaryAudio) {
      audios.push(...speech.speech.primaryAudio);
    } else if (speech.primaryAudio) {
      audios.push(...speech.primaryAudio);
    }
    for (const trackElement of elements(context, "track")) {
      const track = resolveAttr(context, trackElement, "ref");
      visuals.push(...(track.visuals ?? []));
      audios.push(...(track.audios ?? []));
      styles.push(...(track.styles ?? []));
    }
    const fps = numberAttr(context.element, "fps", context.fps);
    if (fps !== context.fps) {
      throw new Error(`film frame-rate ${fps} does not match Located clock ${context.fps}`);
    }
    return {
      outputs: {
        document: {
          contract: "svml.hyperframes-document.v1",
          id: context.instance.id,
          width: numberAttr(context.element, "width", context.width),
          height: numberAttr(context.element, "height", context.height),
          fps,
          durationFrames: context.located.durationFrames,
          background: stringAttr(context.element, "background", "#000000"),
          visuals,
          audios,
          styles,
        },
      },
    };
  },
};
