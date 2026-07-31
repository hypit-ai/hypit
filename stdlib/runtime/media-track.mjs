import {
  elements,
  material,
  mediaTiming,
  numberAttr,
  presentationAnimation,
  presentationStyle,
  resolveItemPresentations,
  resolveAttr,
  stringAttr,
  trackOutput,
} from "./helpers.mjs";

export default {
  abiVersion: "1",
  project(context) {
    const z = numberAttr(context.element, "z");
    const visuals = [];
    for (const item of elements(context, "item")) {
      const id = stringAttr(item, "id");
      const source = material(resolveAttr(context, item, "source"));
      const presentations = resolveItemPresentations(context, item, source);
      for (const [index, presentation] of presentations.entries()) {
        const range = presentation.range;
        const animation = presentationAnimation(
          presentation.element,
          range,
          context.fps,
          `${context.instance.id}-${id}-${presentation.id}-${index}`,
        );
        const timing = source.type === "Video"
          ? mediaTiming(item, presentation, source, context.fps)
          : {};
        visuals.push({
          id: `${context.instance.id}:${id}:${index}`,
          kind: source.type === "Image" ? "image" : "video",
          source: source.source,
          startFrame: range.startFrame,
          endFrameExclusive: range.endFrameExclusive,
          z,
          layer: presentation.layer,
          muted: true,
          ...timing,
          style: {
            ...presentationStyle(presentation.element, item),
            ...(animation.animation ? { animation: animation.animation } : {}),
          },
          ...(animation.css ? { css: animation.css } : {}),
        });
      }
    }
    return trackOutput(visuals);
  },
};
