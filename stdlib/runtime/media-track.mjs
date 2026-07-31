import {
  elements,
  mediaMaterials,
  mediaTiming,
  numberAttr,
  presentationAnimation,
  programBoundAnimation,
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
      const sources = mediaMaterials(resolveAttr(context, item, "source"));
      const itemVisuals = [];
      const resolvedPresentIds = new Set();
      for (const [sourceIndex, source] of sources.entries()) {
      const presentations = resolveItemPresentations(context, item, source, z, { allowEmptyPresent: true });
      for (const [index, presentation] of presentations.entries()) {
        if (presentation.explicit) resolvedPresentIds.add(presentation.id);
        const range = presentation.range;
        const animation = presentationAnimation(
          presentation.element,
          range,
          context.fps,
          `${context.instance.id}-${id}-${presentation.id}-${index}`,
        );
        const sourceAnimation = programBoundAnimation(
          source,
          range,
          context.fps,
          `${context.instance.id}-${id}-${sourceIndex}-${presentation.id}-${index}`,
        );
        const timing = source.type === "Video"
          ? mediaTiming(item, presentation, source, context.fps)
          : {};
        itemVisuals.push({
          id: `${context.instance.id}:${id}:${sourceIndex}:${index}`,
          kind: source.type === "Image" ? "image" : "video",
          source: source.source,
          startFrame: range.startFrame,
          endFrameExclusive: range.endFrameExclusive,
          z: presentation.z,
          muted: true,
          ...timing,
          style: {
            ...presentationStyle(presentation.element, item),
            ...((animation.animation || sourceAnimation.animation) ? {
              animation: [animation.animation, sourceAnimation.animation].filter(Boolean).join(", "),
            } : {}),
          },
          ...((animation.css || sourceAnimation.css) ? {
            css: [animation.css, sourceAnimation.css].filter(Boolean).join("\n"),
          } : {}),
        });
      }
      }
      if (!itemVisuals.length) {
        throw new Error(`item_empty: Item "${id}" has no intersection with its source`);
      }
      for (const present of elements({ element: item }, "present")) {
        const presentId = stringAttr(present, "id");
        if (!resolvedPresentIds.has(presentId)) {
          throw new Error(`presentation_empty: Present "${presentId}" has no intersection with its Item`);
        }
      }
      visuals.push(...itemVisuals);
    }
    return trackOutput(visuals);
  },
};
