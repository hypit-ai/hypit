const packageName = "@hypit/studio-components";
const title = { package: packageName, symbol: "Title" };

function stringParameter(parameters, name, fallback) {
  const value = parameters[name];
  return typeof value === "string" ? value : fallback;
}

function parameterEdit(operation, context) {
  if (operation === null || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error("Title parameter operation must be an object.");
  }
  const { field, value } = operation;
  if ((field !== "eyebrow" && field !== "title" && field !== "accent") || typeof value !== "string") {
    throw new Error("Title parameter operation is invalid.");
  }
  return { ...context.item.parameters, [field]: value };
}

function renderTitle(item, { project }) {
  const layout = item.picture.layout;
  const { width, height } = "ref" in layout
    ? project.sharedValues.find(value => value.id === layout.ref).value : layout;
  const subtitle = item.role === "subtitle";
  return {
    region: { x: 0, y: 0, width, height },
    visual: {
      html: '<div data-title><div data-eyebrow></div><div data-heading></div></div>',
      css: `:scope > [data-title] {
        position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center;
        align-items: ${subtitle ? "center" : "flex-start"}; gap: ${height * .06}px;
        color: white; font: 700 ${height * .34}px/1.05 system-ui, sans-serif;
        text-shadow: 0 2px 10px #0d191e;
      }
      :scope [data-eyebrow] { font-size: ${height * .13}px; letter-spacing: .12em; }
      :scope [data-eyebrow]:empty { display: none; }`,
      data: {
        eyebrow: stringParameter(item.parameters, "eyebrow", "TITLE"),
        heading: stringParameter(item.parameters, "title", "Editorial title"),
        accent: stringParameter(item.parameters, "accent", "#73e6b5"),
      },
      setup: `
        const eyebrow = root.querySelector('[data-eyebrow]');
        const heading = root.querySelector('[data-heading]');
        eyebrow.textContent = data.eyebrow;
        heading.textContent = data.heading;
        eyebrow.style.color = data.accent;
        if (data.eyebrow === '') heading.style.color = data.accent;
        return () => {};
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
      components: [{ component: title, timeWindow: () => true, sourceTime: () => ({ kind: "constant" }),
        editParameters: parameterEdit }],
      componentValues: [],
      operators: [],
    },
  }, {
    kind: "hypit.nle-timeline-presentation",
    value: {
      kind: "hypit.nle-timeline-presentation",
      package: packageName,
      components: [{
        component: title,
        displayName: "Editorial title",
        tone: "magenta",
        chrome: "standard",
        project: ({ item }) => ({
          title: stringParameter(item.parameters, "title", "Editorial title"),
          layers: [{ kind: "text", text: stringParameter(item.parameters, "eyebrow", "TITLE") }],
        }),
      }],
      adjusts: [],
    },
  }, {
    kind: "hypit.nle-inspector-presentation",
    value: {
      kind: "hypit.nle-inspector-presentation",
      package: packageName,
      components: [{
        component: title,
        project: ({ item }) => [{
          id: "content",
          label: "Title content",
          domain: "how",
          fields: [{
            id: "eyebrow",
            label: "Eyebrow",
            control: "text",
            value: stringParameter(item.parameters, "eyebrow", "TITLE"),
            operation: (value) => ({ field: "eyebrow", value }),
          }, {
            id: "title",
            label: "Title",
            control: "text",
            value: stringParameter(item.parameters, "title", "Editorial title"),
            operation: (value) => ({ field: "title", value }),
          }, {
            id: "accent",
            label: "Accent",
            control: "color",
            value: stringParameter(item.parameters, "accent", "#73e6b5"),
            operation: (value) => ({ field: "accent", value }),
          }],
        }],
      }],
      componentValues: [],
      operators: [],
    },
  }, {
    kind: "hypit.nle-render",
    value: { components: [{ symbol: title.symbol, render: renderTitle }] },
  }],
  catalog: [{
    id: "editorial-title",
    kind: "hypit.nle-component",
    title: "Editorial title",
    value: {
      category: "text",
      component: title,
      parameters: {
        eyebrow: "HYPIT",
        title: "A new way to edit",
        accent: "#73e6b5"
      },
      duration: { ticks: "4", timeBase: { numerator: 1, denominator: 1 } },
      layout: { x: 120, y: 124, width: 1680, height: 300, fit: "contain" }
    }
  }, {
    id: "subtitle",
    kind: "hypit.nle-component",
    title: "Subtitle",
    value: {
      category: "subtitle",
      component: title,
      parameters: { eyebrow: "", title: "Subtitle", accent: "#ffffff" },
      duration: { ticks: "3", timeBase: { numerator: 1, denominator: 1 } },
      layout: { x: 120, y: 860, width: 1680, height: 140, fit: "contain" }
    }
  }]
};
