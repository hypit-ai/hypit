import { assertNleTextTypography, readNleTextFontSource } from "@hypit/nle-delivery";

import { compileCaptionFine } from "./component.js";
import { formatCaptionTime, parseCaptionTime, validateCaptionUnitTime } from "./timing.js";

const packageName = "@hypit/caption-fine";
const component = { package: packageName, symbol: "fine" };
const captionDuration = { ticks: "2", timeBase: { numerator: 1, denominator: 1 } };

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function captionValue(parameters, label) {
  const selected = record(parameters, label);
  return record(selected.caption, `${label}.caption`);
}

function captionTimeline(context) {
  const caption = captionValue(context.item.parameters, `Caption ${context.item.id}`);
  if (!Array.isArray(caption.words)) throw new Error(`Caption ${context.item.id} words are invalid.`);
  const text = caption.words.map((entry) => {
    const word = record(entry, `Caption ${context.item.id} word`);
    return `${typeof word.separatorBefore === "string" ? word.separatorBefore : ""}${String(word.text)}`;
  }).join("");
  return {
    title: text.length === 0 ? "Caption" : text,
    layers: text.length === 0 ? [] : [{ kind: "text", text }],
  };
}

function captionInspector(context) {
  const caption = captionValue(context.item.parameters, `Caption ${context.item.id}`);
  if (!Array.isArray(caption.words) || !Array.isArray(caption.units)) {
    throw new Error(`Caption ${context.item.id} content is invalid.`);
  }
  return [{
    id: "caption",
    label: "Caption",
    domain: "how",
    fields: [
      { id: "cue", label: "Cue", control: "readout", value: String(caption.cueId) },
      { id: "role", label: "Role", control: "readout", value: String(caption.role) },
    ],
    collections: [{
      id: "words",
      label: "Words",
      rows: caption.words.map((entry, index) => {
        const word = record(entry, `Caption ${context.item.id} word ${index + 1}`);
        return {
          id: String(word.id),
          label: String(word.text),
          fields: [{
            id: `word:${word.id}:text`,
            label: "Text",
            control: "text",
            value: String(word.text),
            operation: value => ({ kind: "word.text.set", word: word.id, value }),
          }, {
            id: `word:${word.id}:separator`,
            label: "Separator",
            control: "text",
            value: String(word.separatorBefore),
            operation: value => ({ kind: "word.separator.set", word: word.id, value }),
          }],
        };
      }),
    }, {
      id: "units",
      label: "Timing",
      rows: caption.units.map((entry, index) => {
        const unit = record(entry, `Caption ${context.item.id} unit ${index + 1}`);
        return {
          id: String(unit.id),
          label: `Unit ${index + 1}`,
          fields: [{
            id: `unit:${unit.id}:start`,
            label: "Start",
            control: "text",
            value: formatCaptionTime(unit.start, `Caption ${unit.id} start`),
            unit: "s",
            operation: value => ({ kind: "unit.time.set", unit: unit.id, edge: "start", value }),
          }, {
            id: `unit:${unit.id}:end`,
            label: "End",
            control: "text",
            value: formatCaptionTime(unit.end, `Caption ${unit.id} end`),
            unit: "s",
            operation: value => ({ kind: "unit.time.set", unit: unit.id, edge: "end", value }),
          }, {
            id: `unit:${unit.id}:words`,
            label: "Words",
            control: "readout",
            value: Array.isArray(unit.wordIds) ? unit.wordIds.length : 0,
          }],
        };
      }),
    }],
  }];
}

function editCaptionParameters(operation, context) {
  const parameters = structuredClone(record(context.item.parameters, `Caption ${context.item.id} parameters`));
  const caption = captionValue(parameters, `Caption ${context.item.id}`);
  const selected = record(operation, `Caption ${context.item.id} operation`);
  if (selected.kind === "word.text.set" || selected.kind === "word.separator.set") {
    if (!Array.isArray(caption.words) || typeof selected.word !== "string" || typeof selected.value !== "string") {
      throw new Error(`Caption ${context.item.id} word operation is invalid.`);
    }
    const word = caption.words.find((entry) => record(entry, "Caption word").id === selected.word);
    if (word === undefined) throw new Error(`Caption ${context.item.id} has no word ${selected.word}.`);
    if (selected.kind === "word.text.set") {
      if (selected.value.length === 0) throw new Error("Caption word text must not be empty.");
      word.text = selected.value;
    } else word.separatorBefore = selected.value;
    return parameters;
  }
  if (selected.kind === "unit.time.set") {
    if (!Array.isArray(caption.units) || typeof selected.unit !== "string"
        || (selected.edge !== "start" && selected.edge !== "end")) {
      throw new Error(`Caption ${context.item.id} timing operation is invalid.`);
    }
    const unit = caption.units.find((entry) => record(entry, "Caption unit").id === selected.unit);
    if (unit === undefined) throw new Error(`Caption ${context.item.id} has no unit ${selected.unit}.`);
    unit[selected.edge] = parseCaptionTime(selected.value, `Caption ${selected.unit} ${selected.edge}`);
    validateCaptionUnitTime(unit);
    return parameters;
  }
  throw new Error(`Caption ${context.item.id} operation is unavailable.`);
}

const typographyFields = {
  fontSizePx: { label: "Font size", minimum: 1, unit: "px" },
  fontWeight: { label: "Font weight", minimum: 1, maximum: 1000, step: 1 },
  lineHeight: { label: "Line height", minimum: 0.01, step: 0.01 },
  letterSpacingPx: { label: "Letter spacing", step: 0.1, unit: "px" },
  wordSpacingPx: { label: "Word spacing", step: 0.1, unit: "px" },
};

function styleInspector(context) {
  const style = record(context.value, `Caption ${context.item.id} value ${context.slot}`);
  const typography = style.typography ?? {};
  assertNleTextTypography(typography);
  const fields = Object.entries(typographyFields).flatMap(([id, options]) => {
    const value = typography[id];
    return value === undefined ? [] : [{ id, control: "number", ...options, value,
      operation: next => ({ kind: "typography.set", field: id, value: next }) }];
  });
  if (typeof style.color === "string") fields.push({
    id: "color", label: "Color", control: "color", value: style.color,
    operation: value => ({ kind: "color.set", value }),
  });
  if (typeof style.maxWordsPerLine === "number") fields.push({
    id: "maxWordsPerLine", label: "Words per line", control: "number", minimum: 1, step: 1, value: style.maxWordsPerLine,
    operation: value => ({ kind: "words-per-line.set", value }),
  });
  return [{ id: "typography", label: "Caption style", domain: "how", fields,
    ...(typography.fonts === undefined ? {} : { collections: [{
      id: "fonts", label: "Font stack", rows: typography.fonts.map((font, index) => ({
        id: `font:${index}`, label: font, fields: [{
          id: `font:${index}:source`, label: "Font", control: "text", value: font,
          operation: value => ({ kind: "font.set", index, value }),
        }],
      })),
    }] }),
  }];
}

function editStyle(operation, context) {
  const style = record(context.value, `Caption ${context.item.id} value ${context.slot}`);
  const typography = style.typography ?? {};
  assertNleTextTypography(typography);
  const edit = record(operation, `Caption ${context.item.id} value ${context.slot} operation`);
  const { value } = edit;
  switch (edit.kind) {
    case "typography.set": {
      const { field } = edit;
      if (typeof field !== "string" || !Object.hasOwn(typographyFields, field)
        || typeof value !== "number" || !Number.isFinite(value)) break;
      const next = { ...typography, [field]: value };
      assertNleTextTypography(next);
      return { ...style, typography: next };
    }
    case "font.set": {
      const { index } = edit;
      if (!Number.isSafeInteger(index) || typography.fonts?.[index] === undefined || typeof value !== "string") break;
      readNleTextFontSource(value);
      return { ...style, typography: { ...typography, fonts: typography.fonts.map((font, i) => i === index ? value : font) } };
    }
    case "color.set":
      if (typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value)) return { ...style, color: value };
      break;
    case "words-per-line.set":
      if (Number.isSafeInteger(value) && value >= 1 && value <= 10_000) return { ...style, maxWordsPerLine: value };
      break;
  }
  throw new Error(`Caption ${context.item.id} value ${context.slot} operation is invalid.`);
}

function resolveLayout(item, project) {
  if (item.picture === undefined) throw new Error(`Fine Caption ${item.id} has no Picture appearance.`);
  const selected = item.picture.layout;
  if (!("ref" in selected)) return structuredClone(selected);
  const shared = project.sharedValues.find(value => value.id === selected.ref);
  if (shared === undefined || shared.declaration.kind !== "nle"
      || shared.declaration.slot !== "picture.layout") {
    throw new Error(`Fine Caption ${item.id} requires Picture layout ${selected.ref}.`);
  }
  return structuredClone(shared.value);
}

function renderCaption(item, context) {
  const { width, height } = resolveLayout(item, context.project);
  const style = context.values.style;
  if (style === undefined) throw new Error(`Fine Caption ${item.id} requires value slot style.`);
  return {
    region: { x: 0, y: 0, width, height },
    duration: context.sourceDuration,
    itemTimeControl: "item",
    visual: compileCaptionFine({
      id: `${item.id}:source`,
      parameters: {
        caption: item.parameters.caption,
        style,
        duration: item.duration,
        layout: { width, height },
      },
    }, context.resolveTextFont),
  };
}

export const hypitPackage = {
  package: packageName,
  contributions: [
    {
      kind: "hypit.nle-timeline-presentation",
      value: {
        kind: "hypit.nle-timeline-presentation",
        package: packageName,
        components: [{
          component,
          displayName: "Fine Caption",
          tone: "magenta",
          chrome: "standard",
          heightPx: 52,
          project: captionTimeline,
        }],
        adjusts: [],
      },
    },
    {
      kind: "hypit.nle-inspector-presentation",
      value: {
        kind: "hypit.nle-inspector-presentation",
        package: packageName,
        components: [{ component, project: captionInspector }],
        componentValues: [{ component, slot: "style", project: styleInspector }],
        operators: [],
      },
    },
    {
      kind: "hypit.nle-authoring",
      value: {
        kind: "hypit.nle-authoring",
        package: packageName,
        components: [{ component, timeWindow: () => true, sourceTime: () => ({ kind: "timed" }),
          editParameters: editCaptionParameters }],
        componentValues: [{ component, slot: "style", editValue: editStyle }],
        operators: [],
      },
    },
    {
      kind: "hypit.nle-render",
      value: { components: [{ symbol: "fine", render: renderCaption }] },
    },
  ],
  catalog: [{ id: "caption", title: "Fine Caption", kind: "hypit.nle-component", value: {
    category: "subtitle", component, duration: captionDuration,
    parameters: { caption: {
      cueId: "caption", documentId: "inline", role: "caption",
      words: [{ id: "word", text: "Subtitle", separatorBefore: "", attributes: [], unitId: "unit" }],
      units: [{ id: "unit", start: { ...captionDuration, ticks: "0" }, end: captionDuration, wordIds: ["word"] }],
    } },
    values: { style: {
      typography: { fonts: ["system-ui", "sans-serif"], fontSizePx: 58, fontWeight: 800, lineHeight: 1.05, letterSpacingPx: 0 },
      color: "#ffffff", maxWordsPerLine: 8, blockAlign: "end",
    } },
  } }],
};
