export default {
  abiVersion: "1",
  project(context) {
    const image = context.resolve(context.element.attributes.image);
    return {
      outputs: {
        document: {
          contract: "svml.hyperframes-document.v1",
          id: context.instance.id,
          width: 64,
          height: 64,
          fps: context.fps,
          durationFrames: context.located.durationFrames,
          background: "#000000",
          visuals: [{
            id: "bound-image",
            kind: "image",
            source: image.absoluteSource ?? image.source,
            startFrame: 0,
            endFrameExclusive: context.located.durationFrames,
            z: 0,
          }],
          audios: [],
        },
      },
    };
  },
};
