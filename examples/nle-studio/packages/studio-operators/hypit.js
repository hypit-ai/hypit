const packageName = "@hypit/studio-operators";
const colour = { package: packageName, symbol: "Colour" };
const crossDissolve = { package: packageName, symbol: "CrossDissolve" };

function numberParameter(parameters, name, fallback) {
  const value = parameters[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function editColour(operation, context) {
  if (operation === null || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error("Colour parameter operation must be an object.");
  }
  const { field, value } = operation;
  if ((field !== "contrast" && field !== "saturation" && field !== "temperature")
    || typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Colour parameter operation is invalid.");
  }
  return { ...context.parameters, [field]: value };
}

export const hypitPackage = {
  package: packageName,
  contributions: [{
    kind: "hypit.nle-authoring",
    value: {
      kind: "hypit.nle-authoring",
      package: packageName,
      components: [],
      componentValues: [],
      operators: [{ operator: colour, timeWindow: () => true, editParameters: editColour }],
    },
  }, {
    kind: "hypit.nle-timeline-presentation",
    value: {
      kind: "hypit.nle-timeline-presentation",
      package: packageName,
      components: [],
      adjusts: [{
        operator: colour,
        displayName: "Colour look",
        tone: "violet",
        chrome: "compact",
        heightPx: 44,
      }],
    },
  }, {
    kind: "hypit.nle-inspector-presentation",
    value: {
      kind: "hypit.nle-inspector-presentation",
      package: packageName,
      components: [],
      componentValues: [],
      operators: [{
        operator: colour,
        project: ({ parameters }) => [{
          id: "colour",
          label: "Colour",
          domain: "how",
          fields: [{
            id: "contrast",
            label: "Contrast",
            control: "number",
            value: numberParameter(parameters, "contrast", 1),
            minimum: 0,
            maximum: 2,
            step: 0.01,
            operation: (value) => ({ field: "contrast", value }),
          }, {
            id: "saturation",
            label: "Saturation",
            control: "number",
            value: numberParameter(parameters, "saturation", 1),
            minimum: 0,
            maximum: 2,
            step: 0.01,
            operation: (value) => ({ field: "saturation", value }),
          }, {
            id: "temperature",
            label: "Temperature",
            control: "number",
            value: numberParameter(parameters, "temperature", 0),
            minimum: -100,
            maximum: 100,
            step: 1,
            operation: (value) => ({ field: "temperature", value }),
          }],
        }],
      }],
    },
  }],
  catalog: [{
    id: "colour-look",
    kind: "hypit.nle-adjust",
    title: "Colour look",
    value: {
      medium: "picture",
      operator: colour,
      parameters: { contrast: 1.08, saturation: 0.94, temperature: -2 },
      duration: { ticks: "5", timeBase: { numerator: 1, denominator: 1 } }
    }
  }, {
    id: "cross-dissolve",
    kind: "hypit.nle-transition",
    title: "Cross dissolve",
    value: {
      operator: crossDissolve,
      parameters: { curve: "smooth" },
      duration: { ticks: "1", timeBase: { numerator: 1, denominator: 1 } }
    }
  }]
};
