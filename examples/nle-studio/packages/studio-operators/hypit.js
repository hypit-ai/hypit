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

function renderColour(process, { parameters }) {
  const contrast = Math.max(0, numberParameter(parameters, "contrast", 1));
  const saturation = Math.max(0, numberParameter(parameters, "saturation", 1));
  const warmth = Math.max(-100, Math.min(100, numberParameter(parameters, "temperature", 0))) / 100;
  const id = "studio-colour-" + Array.from(process.id, character => character.codePointAt(0).toString(16)).join("-");
  return {
    visual: {
      html: `<svg width="0" height="0" aria-hidden="true"><filter id="${id}" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="${1 + warmth * .2} 0 0 0 0  0 1 0 0 0  0 0 ${1 - warmth * .2} 0 0  0 0 0 1 0"/>
        </filter></svg><div data-colour>{{input:signal}}</div>`,
      css: `:scope > [data-colour] { position: absolute; inset: 0; filter: contrast(${contrast}) saturate(${saturation}) url(#${id}); }`,
    },
  };
}

function renderDissolve(transition, { domain }) {
  return {
    controls: ["progress"],
    visual: {
      html: '<div data-dissolve><div data-outgoing>{{input:outgoing}}</div><div data-incoming>{{input:incoming}}</div></div>',
      css: `:scope > [data-dissolve] { position: absolute; inset: 0; isolation: isolate; }
      :scope [data-outgoing], :scope [data-incoming] { position: absolute; inset: 0; }
      :scope [data-incoming] { mix-blend-mode: plus-lighter; }`,
      data: { duration: domain.duration, smooth: transition.parameters.curve === "smooth" },
      setup: `
        const outgoing = root.querySelector('[data-outgoing]');
        const incoming = root.querySelector('[data-incoming]');
        const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
        const duration = seconds(data.duration);
        return frame => {
          const position = context.controlPosition('progress', frame);
          const progress = position === undefined ? 0 : Math.max(0, Math.min(1, seconds(position) / duration));
          const opacity = data.smooth ? progress * progress * (3 - 2 * progress) : progress;
          outgoing.style.opacity = String(1 - opacity);
          incoming.style.opacity = String(opacity);
        };
      `,
    },
  };
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
  }, {
    kind: "hypit.nle-render",
    value: {
      pictureProcesses: [{ symbol: colour.symbol, render: renderColour }],
      transitions: [{ symbol: crossDissolve.symbol, render: renderDissolve }],
    },
  }],
  catalog: [{
    id: "colour-look",
    kind: "hypit.nle-adjust",
    title: "Colour look",
    value: {
      medium: "picture",
      role: "filter",
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
