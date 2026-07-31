export default {
  abiVersion: "1",
  project(context) {
    const image = context.resolve(context.element.attributes.image);
    const production = context.resolve(context.element.attributes.basis);
    return {
      outputs: {
        document: {
          contract: "svml.hyperframes-document.v1",
          id: context.instance.id,
          width: 64,
          height: 64,
          fps: production.basis.frameRate.numerator / production.basis.frameRate.denominator,
          durationFrames: production.basis.durationFrames,
          background: "#000000",
          visuals: [{
            id: "bound-image",
            kind: "image",
            source: image.absoluteSource ?? image.source,
            startFrame: 0,
            endFrameExclusive: production.basis.durationFrames,
            z: 0,
          }],
          audios: [],
        },
      },
    };
  },
};
