import { compositionTypes } from "@hypit/composition";
import {
  createStudioCompanionFacet,
  textLayer,
  temporalLineageFor,
} from "@hypit/studio-companion";
import { module, defaults } from "./definition.js";

const section = (id, label) => ({ id, label });
const field = (binding, label, domain, group, control, more = {}) => ({
  binding,
  label,
  domain,
  section: section(group, group),
  control,
  ...more,
});
const number = (binding, label, domain = "how", more = {}) =>
  field(
    binding,
    label,
    domain,
    domain === "where" ? "Placement" : "Appearance",
    "number",
    more,
  );
const percent = (binding, label, domain = "where") =>
  number(binding, label, domain, {
    unit: "%",
    number: { scale: 100, step: 1 },
  });
const text = (binding, label) => field(binding, label, "how", "Text", "text");
const layouts = {
  Title: [
    text("title", "Title"),
    text("subtitle", "Subtitle"),
    number("seconds", "Promised duration", "how", {
      unit: "s",
      number: { minimum: 0, step: 1 },
    }),
    percent("timer-y", "Clock Y"),
    percent("title-y", "Title Y"),
    percent("title-size", "Title size", "how"),
    field("color", "Title color", "how", "Appearance", "color"),
  ],
  Timer: [
    text("title", "Title"),
    text("subtitle", "Subtitle"),
    number("seconds", "Countdown", "how", {
      unit: "s",
      number: { minimum: 0, step: 1 },
    }),
    percent("x", "X"),
    percent("y", "Y"),
    percent("width", "Width"),
    field("flag-color", "Flag color", "how", "Flag", "color"),
    field("flag-amplitude", "Wave amplitude", "how", "Flag", "number", {
      unit: "%",
      number: { scale: 100, minimum: 0, step: 0.5 },
    }),
    field("flag-speed", "Wave speed", "how", "Flag", "number", {
      unit: "cycles/s",
      number: { minimum: 0, step: 0.05 },
    }),
  ],
  Flag: [percent("x", "X"), percent("y", "Y"), percent("width", "Width"), percent("height", "Height"), field("flag-color", "Cloth color", "how", "Flag", "color")],
  Stage: [
    percent("x", "X"),
    percent("y", "Y"),
    percent("width", "Width"),
    percent("height", "Height"),
    field("fit", "Image fit", "how", "Appearance", "select", {
      options: ["contain", "cover"],
    }),
    percent("push-rate", "Slow push per second", "how"),
    number("blur", "Background blur", "how", {
      unit: "px",
      number: { minimum: 0, step: 1 },
    }),
    percent("brightness", "Background brightness", "how"),
    number("zoom", "Background scale", "how", {
      unit: "×",
      number: { minimum: 0, step: 0.05 },
    }),
    number("radius", "Corner radius", "how", {
      unit: "px",
      number: { minimum: 0, step: 1 },
    }),
  ],
  Veil: [
    field("pattern", "Pattern", "how", "Appearance", "select", {
      options: ["mesh", "dots", "hatch"],
    }),
    number("cell", "Pattern size", "how", {
      unit: "px",
      number: { minimum: 1, step: 1 },
    }),
    percent("amount", "Pattern opacity", "how"),
    percent("shade", "Wash opacity", "how"),
    field("tint", "Wash color", "how", "Appearance", "color"),
  ],
};
const names = {
  Flag: ["Floor flag", "Foreshortened cloth"],
  Title: ["Opening title", "Clock and headline"],
  Timer: ["Countdown", "Cloth flag and countdown"],
  Stage: ["Material stage", "Foreground media with enlarged backdrop"],
  Veil: ["Texture veil", "Patterned overlay"],
};
const tracks = Object.entries(layouts).map(([kind, inspector]) => ({
  id: kind.toLowerCase(),
  role: "track",
  output: {
    type: compositionTypes.visualTrack,
    surface: kind.toLowerCase(),
    modules: [module],
  },
  family: "opening-system",
  label: names[kind][0],
  icon: kind === "Stage" ? "video" : "component",
  tone: kind === "Stage" ? "blue" : "magenta",
  lane: { heightPx: 48 },
  bindings: inspector.map((f) => ({
    name: f.binding,
    writable: true,
    fallback: defaults[kind][f.binding],
  })),
  inspector,
  ...(kind === "Stage"
    ? {
        attachments: [
          {
            id: "items",
            family: "stage-items",
            label: "Media",
            tone: "blue-muted",
            icon: "video",
            facet: "visual",
            lane: { heightPx: 40 },
          },
        ],
        project(context) {
          const children = context
            .generic()
            .map((e) => ({
              ...e,
              lane: "items",
              temporal: temporalLineageFor(context, e.authoredId, "window"),
            }));
          if (!context.placement || !children.length) return children;
          const temporal = temporalLineageFor(
            context,
            context.placement.id,
            "window",
          );
          const span = temporal?.projection;
          return [
            {
              id: "stage",
              authoredId: context.placement.id,
              elementLocation: {
                path: context.placement.sourcePath,
                range: context.placement.range,
              },
              display: {
                title: names[kind][0],
                layers: [textLayer(names[kind][1])],
              },
              startFrame:
                span?.startFrame ??
                Math.min(...children.map((e) => e.startFrame)),
              endFrameExclusive:
                span?.endFrameExclusive ??
                Math.max(...children.map((e) => e.endFrameExclusive)),
              stackOrder: 0,
              ...(temporal ? { temporal } : {}),
              presentation: { kind: "material-stage", chrome: "standard" },
            },
            ...children,
          ];
        },
      }
    : {
        project(context) {
          return context
            .generic()
            .map((e) => ({
              ...e,
              temporal: temporalLineageFor(
                context,
                context.placement.id,
                "window",
              ),
              display: {
                title: names[kind][0],
                layers: [textLayer(names[kind][1])],
              },
            }));
        },
      }),
}));
const frameNames = [
  "left",
  "top",
  "right",
  "bottom",
  "x",
  "y",
  "width",
  "height",
];
function frames(names) {
  return {
    bindings: names.map((name) => ({
      name,
      referenced: frameNames.map((name) => ({ name, writable: true })),
    })),
    inspector: names.flatMap((name) =>
      frameNames.map((f) => ({
        binding: name + "." + f,
        label: f,
        domain: "where",
        page: { id: name, label: name },
        section: { id: "frame", label: "Frame" },
        control: "number",
        number: { suffixes: ["%", "px"], step: 1 },
      })),
    ),
  };
}
const parameters = [
  {
    id: "pullback",
    match: { module, surface: "pullback" },
    bindings: [{ name: "scale", writable: true, fallback: 1.5 }],
    inspector: [
      number("scale", "Initial magnification", "how", {
        unit: "×",
        number: { minimum: 1, step: 0.05 },
      }),
    ],
  },
  {
    id: "portrait-inset",
    match: { module, surface: "portrait-inset" },
    ...frames(["frame"]),
  },
  {
    id: "reframe",
    match: { module, surface: "reframe" },
    ...frames(["from", "to"]),
  },
];
export const studioFacet = createStudioCompanionFacet({
  tracks,
  parameters,
});
