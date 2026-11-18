import type { PackageSymbol } from "@hypit/nle";
import { readNleTextFontSource, type NleRenderContribution, type NleTextNode, type NleTextTypography } from "@hypit/nle-delivery";
import {
  createNleAuthoringContribution,
  createNleInspectorPresentationContribution,
  createNleTimelinePresentationContribution,
  type NleComponentAuthoringContext,
  type NleInspectorFieldDraft,
  type NleInspectorSectionDraft,
} from "@hypit/nle/view";
import { assertTextFineParameters, textFineHasMotion } from "./parameters.js";
import { renderTextFine } from "./render.js";
import type { TextFineParameters } from "./types.js";

export type * from "./types.js";

const packageName = "@hypit/text-fine";
const component = { package: packageName, symbol: "fine" } satisfies PackageSymbol;

const typographyFields = {
  fontSizePx: { label: "Font size", control: "number", minimum: 1, unit: "px" },
  fontWeight: { label: "Font weight", control: "number", minimum: 1, maximum: 1000, step: 1 },
  lineHeight: { label: "Line height", control: "number", minimum: 0.01, step: 0.01 },
  letterSpacingPx: { label: "Letter spacing", control: "number", step: 0.1, unit: "px" },
  wordSpacingPx: { label: "Word spacing", control: "number", step: 0.1, unit: "px" },
} as const;

function textRuns(nodes: readonly NleTextNode[]): readonly Extract<NleTextNode, { kind: "text" }>[] {
  return nodes.flatMap(node => node.kind === "group" ? textRuns(node.children) : node.kind === "text" ? [node] : []);
}

function solidFillIndex(parameters: TextFineParameters): number {
  return parameters.paints.findLastIndex(paint => paint.kind === "fill" && paint.paint.kind === "solid");
}

function inspector({ item }: NleComponentAuthoringContext): readonly NleInspectorSectionDraft[] {
  const parameters = item.parameters;
  assertTextFineParameters(parameters);
  const typography = parameters.typography;
  const fields: NleInspectorFieldDraft[] = [];
  for (const field of Object.keys(typographyFields) as (keyof typeof typographyFields)[]) {
    const value = typography[field];
    if (value === undefined) continue;
    fields.push({ id: field, value, ...typographyFields[field],
      operation: next => ({ kind: "typography.set", field, value: next }) });
  }
  const fill = parameters.paints[solidFillIndex(parameters)];
  if (fill?.kind === "fill" && fill.paint.kind === "solid") {
    fields.push({ id: "fill", label: "Fill", control: "color", value: fill.paint.color,
      operation: value => ({ kind: "fill.set", value }) });
  }
  return [{
    id: "content", label: "Text", domain: "how", fields: [],
    collections: [{ id: "runs", label: "Text runs", rows: textRuns(parameters.children).map(node => ({
      id: node.id, label: node.text.trim() || "Text",
      fields: [{ id: `text:${node.id}`, label: "Text", control: "text", value: node.text,
        operation: value => ({ kind: "text.set", node: node.id, value }) }],
    })) }],
  }, { id: "typography", label: "Typography", domain: "how", fields,
    ...(typography.fonts === undefined ? {} : { collections: [{
      id: "fonts", label: "Font stack", rows: typography.fonts.map((font, index) => ({
        id: `font:${index}`, label: font, fields: [{
          id: `font:${index}:source`, label: "Font", control: "text" as const, value: font,
          operation: value => ({ kind: "font.set", index, value }),
        }],
      })),
    }] }),
  }];
}

function editTypography(typography: NleTextTypography, field: string, value: unknown): NleTextTypography {
  if (!Object.hasOwn(typographyFields, field)) throw new Error(`Unknown Fine Text typography field ${field}.`);
  if (typeof value !== "number" || !Number.isFinite(value) || field === "fontSizePx" && value <= 0) {
    throw new Error(`Fine Text typography field ${field} has an invalid value.`);
  }
  return { ...typography, [field]: value };
}

function editParameters(operation: unknown, { item }: NleComponentAuthoringContext): TextFineParameters {
  if (operation === null || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error(`Fine Text ${item.id} edit must be an object.`);
  }
  const edit = operation as Readonly<Record<string, unknown>>;
  const parameters = item.parameters;
  assertTextFineParameters(parameters);
  let next: TextFineParameters;
  switch (edit.kind) {
    case "text.set": {
      const { node, value } = edit;
      if (typeof value !== "string" || !textRuns(parameters.children).some(run => run.id === node)) {
        throw new Error(`Fine Text ${item.id} edit requires an existing text run and text.`);
      }
      const replace = (children: readonly NleTextNode[]): readonly NleTextNode[] => children.map(child =>
        child.kind === "group" ? { ...child, children: replace(child.children) }
          : child.kind === "text" && child.id === node ? { ...child, text: value } : child);
      next = { ...parameters, children: replace(parameters.children) };
      break;
    }
    case "typography.set":
      next = { ...parameters, typography: editTypography(parameters.typography, String(edit.field), edit.value) };
      break;
    case "font.set": {
      const { index, value } = edit;
      const { fonts } = parameters.typography;
      if (typeof index !== "number" || !Number.isSafeInteger(index) || fonts?.[index] === undefined
        || typeof value !== "string") throw new Error(`Fine Text ${item.id} requires an existing font source and a replacement.`);
      readNleTextFontSource(value);
      next = { ...parameters, typography: { ...parameters.typography, fonts: fonts.map((font, i) => i === index ? value : font) } };
      break;
    }
    case "fill.set": {
      const index = solidFillIndex(parameters);
      const { value } = edit;
      if (index < 0 || typeof value !== "string") throw new Error(`Fine Text ${item.id} requires a solid fill to edit.`);
      next = { ...parameters, paints: parameters.paints.map((paint, i) => i === index
        ? { kind: "fill", paint: { kind: "solid", color: value } } : paint) };
      break;
    }
    default:
      throw new Error(`Fine Text ${item.id} edit is unavailable.`);
  }
  assertTextFineParameters(next);
  return next;
}

const authoring = createNleAuthoringContribution({ package: packageName, components: [{
  component, timeWindow: () => true, editParameters,
  sourceTime: ({ item }) => {
    const parameters = item.parameters;
    assertTextFineParameters(parameters);
    return { kind: textFineHasMotion(parameters) ? "timed" : "constant" };
  },
}] });
const presentation = createNleTimelinePresentationContribution({ package: packageName, components: [{
  component, displayName: "Fine Text", tone: "magenta", chrome: "standard",
  project: ({ item }) => {
    const parameters = item.parameters;
    assertTextFineParameters(parameters);
    const text = textRuns(parameters.children).map(run => run.text).join(" ").trim();
    return text.length === 0 ? {} : { title: text, layers: [{ kind: "text", text }] };
  },
}] });
const inspectorContribution = createNleInspectorPresentationContribution({
  package: packageName, components: [{ component, project: inspector }],
});
const render = { components: [{ symbol: component.symbol, render: renderTextFine }] } satisfies NleRenderContribution;

const starter: TextFineParameters = {
  typography: { fonts: ["system-ui", "sans-serif"], fontSizePx: 64, fontWeight: 700, lineHeight: 1.15,
    letterSpacingPx: 0, wordSpacingPx: 0 },
  paints: [{ kind: "fill", paint: { kind: "solid", color: "#ffffff" } }],
  children: [{ kind: "text", id: "text", text: "Title" }],
  placement: { kind: "flow", paddingPx: { top: 0, right: 0, bottom: 0, left: 0 }, inlineAlign: "center",
    blockAlign: "center", wrap: "word", overflow: "visible", columns: 1, columnGapPx: 0 },
};

export const hypitPackage = {
  package: packageName,
  contributions: [
    ...[authoring, presentation, inspectorContribution].map(value => ({ kind: value.kind, value })),
    { kind: "hypit.nle-render", value: render },
  ],
  catalog: [{ id: "text", kind: "hypit.nle-component", title: "Fine Text", value: {
    category: "text", component, parameters: starter, duration: { ticks: "3", timeBase: { numerator: 1, denominator: 1 } },
  } }],
};
