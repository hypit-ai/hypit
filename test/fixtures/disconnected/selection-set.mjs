export default {
  abiVersion: "1",
  project(context) {
    const item = context.element.children.find(
      (child) => child.kind === "element" && child.name === "item",
    );
    const ranges = context.selection(item.attributes.during, "item.during");
    const track = { visuals: [], audios: [], styles: [] };
    return {
      outputs: { track },
      diagnostics: [{
        code: "selection_set_count",
        message: String(ranges.length),
      }],
    };
  },
};
