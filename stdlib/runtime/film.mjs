import { elements, numberAttr, resolveAttr, stringAttr } from "./helpers.mjs";

export default {
  abiVersion: "1",
  project(context) {
    const visuals = [];
    const audios = [];
    const styles = [];
    const production = resolveAttr(context, context.element, "basis");
    const semantic = resolveAttr(context, context.element, "semantic");
    if (production?.contract !== "svml.temporal-basis-production.v1") {
      throw new Error("film requires TemporalBasisProduction");
    }
    if (semantic?.contract !== "svml.exact-semantic-map.v1") {
      throw new Error("film requires ExactSemanticMap");
    }
    if (semantic.basisDigest !== production.basis.basisDigest) {
      throw new Error("film basis and SemanticMap do not share a basisDigest");
    }
    const basisFps = production.basis.frameRate.numerator
      / production.basis.frameRate.denominator;
    for (const contribution of production.audio ?? []) {
      audios.push({
        id: contribution.id,
        source: contribution.source,
        startFrame: contribution.programStartFrame,
        endFrameExclusive: contribution.programEndFrameExclusive,
        mediaStartSec: contribution.sourceStartFrame / basisFps,
        playbackRate: (contribution.sourceEndFrameExclusive - contribution.sourceStartFrame)
          / Math.max(1, contribution.programEndFrameExclusive - contribution.programStartFrame),
        volume: contribution.gain,
        ...(contribution.fadeInFrames ? { fadeInSec: contribution.fadeInFrames / basisFps } : {}),
        ...(contribution.fadeOutFrames ? { fadeOutSec: contribution.fadeOutFrames / basisFps } : {}),
        bus: "speech",
      });
    }
    for (const trackElement of elements(context, "track")) {
      const track = resolveAttr(context, trackElement, "ref");
      visuals.push(...(track.visuals ?? []));
      audios.push(...(track.audios ?? []));
      styles.push(...(track.styles ?? []));
    }
    const fps = numberAttr(context.element, "fps", basisFps);
    if (fps !== basisFps) {
      throw new Error(`film frame-rate ${fps} does not match ProgramBasis ${basisFps}`);
    }
    return {
      outputs: {
        document: {
          contract: "svml.hyperframes-document.v1",
          id: context.instance.id,
          width: numberAttr(context.element, "width", context.width),
          height: numberAttr(context.element, "height", context.height),
          fps,
          durationFrames: production.basis.durationFrames,
          background: stringAttr(context.element, "background", "#000000"),
          visuals,
          audios,
          styles,
        },
      },
    };
  },
};
