import {
  elements,
  html,
  numberAttr,
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
      const ranges = context.selection(item.attributes.during ?? "full", "item.during");
      for (const [index, range] of ranges.entries()) {
        const text = stringAttr(item, "text");
        visuals.push({
          id: `${context.instance.id}:${id}:${index}`,
          kind: "html",
          startFrame: range.startFrame,
          endFrameExclusive: range.endFrameExclusive,
          z,
          html: `<div class="svml-text-inner">${html(item.attributes.uppercase === true ? text.toUpperCase() : text)}</div>`,
          style: {
            left: `${numberAttr(item, "x", 0) * 100}%`,
            top: `${numberAttr(item, "y", 0) * 100}%`,
            width: `${numberAttr(item, "width", 1) * 100}%`,
            height: `${numberAttr(item, "height", 0.1) * 100}%`,
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            color: stringAttr(item, "color", "#050505"),
            background: "transparent",
            "font-family": stringAttr(item, "font", "Inter, Arial, sans-serif"),
            "font-size": `${numberAttr(item, "size", 54)}px`,
            "font-weight": numberAttr(item, "weight", 900),
            "line-height": numberAttr(item, "lineHeight", 0.92),
            "text-align": "center",
            "letter-spacing": `${numberAttr(item, "letterSpacing", 0)}px`,
          },
          css: `.svml-text-inner {
  display: inline;
  padding: 0.08em 0;
  background: ${stringAttr(item, "background", "transparent")};
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  text-shadow: 0 2px 0 rgba(255,255,255,.9), 0 4px 7px rgba(0,0,0,.32);
}`,
        });
      }
    }
    return trackOutput(visuals);
  },
};
