export default {
  abiVersion: "1",
  project(context) {
    const source = context.resolve(context.element.attributes.source);
    return {
      outputs: {
        image: source,
      },
    };
  },
};
