import { fileURLToPath } from "node:url";

import { compileCaptionFine } from "./component.js";

const packageName = "@hypit/caption-fine";
const component = { package: packageName, symbol: "fine" };
const captionDuration = { ticks: "2", timeBase: { numerator: 1, denominator: 1 } };

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function gcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function temporalRational(value, label) {
  const exact = record(value, label);
  const base = record(exact.timeBase, `${label}.timeBase`);
  if (typeof exact.ticks !== "string" || !/^-?\d+$/u.test(exact.ticks)
      || !Number.isSafeInteger(base.numerator) || !Number.isSafeInteger(base.denominator)
      || base.denominator <= 0) {
    throw new Error(`${label} is invalid.`);
  }
  const numerator = BigInt(exact.ticks) * BigInt(base.numerator);
  const denominator = BigInt(base.denominator);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function temporalText(value, label) {
  const exact = temporalRational(value, label);
  return `${exact.numerator}/${exact.denominator}`;
}

function parseTemporalText(value, label) {
  if (typeof value !== "string") throw new Error(`${label} requires exact rational seconds.`);
  const match = /^(-?\d+)\/([1-9]\d*)$/u.exec(value.trim());
  if (match === null) throw new Error(`${label} must use numerator/denominator seconds.`);
  const numerator = BigInt(match[1]);
  const denominator = BigInt(match[2]);
  if (numerator < 0n || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is outside the supported exact range.`);
  }
  const divisor = gcd(numerator, denominator);
  return {
    ticks: String(numerator / divisor),
    timeBase: { numerator: 1, denominator: Number(denominator / divisor) },
  };
}

function compareTemporal(left, right) {
  const a = temporalRational(left, "Caption time");
  const b = temporalRational(right, "Caption time");
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
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
            value: temporalText(unit.start, `Caption ${unit.id} start`),
            unit: "s",
            operation: value => ({ kind: "unit.time.set", unit: unit.id, edge: "start", value }),
          }, {
            id: `unit:${unit.id}:end`,
            label: "End",
            control: "text",
            value: temporalText(unit.end, `Caption ${unit.id} end`),
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
    unit[selected.edge] = parseTemporalText(selected.value, `Caption ${selected.unit} ${selected.edge}`);
    if (compareTemporal(unit.start, unit.end) >= 0) {
      throw new Error(`Caption ${selected.unit} start must precede its end.`);
    }
    if (compareTemporal(unit.end, context.item.duration) > 0) {
      throw new Error(`Caption ${selected.unit} ends outside the occurrence.`);
    }
    return parameters;
  }
  throw new Error(`Caption ${context.item.id} operation is unavailable.`);
}

function styleInspector(context) {
  const style = record(context.value, `Caption ${context.item.id} value ${context.slot}`);
  const fields = [];
  const scalar = (id, label, control, options = {}) => {
    const value = style[id];
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return;
    fields.push({ id, label, control, value, ...options,
      operation: next => ({ kind: "style.set", field: id, value: next }) });
  };
  scalar("fontFamily", "Font", "text");
  scalar("fontSize", "Font size", "number", { minimum: 1, maximum: 500, step: 1 });
  scalar("fontWeight", "Font weight", "number", { minimum: 100, maximum: 900, step: 100 });
  scalar("color", "Color", "color");
  scalar("lineHeight", "Line height", "number", { minimum: 0.5, maximum: 4, step: 0.05 });
  scalar("letterSpacing", "Letter spacing", "number", { minimum: -20, maximum: 100, step: 0.1 });
  scalar("maxWordsPerLine", "Words per line", "number", { minimum: 1, step: 1 });
  if (fields.length === 0) fields.push({ id: "empty", label: "Style", control: "readout", value: "No scalar fields" });
  return [{ id: "typography", label: "Caption style", domain: "how", fields }];
}

function editStyle(operation, context) {
  const style = structuredClone(record(context.value, `Caption ${context.item.id} value ${context.slot}`));
  const selected = record(operation, `Caption ${context.item.id} value ${context.slot} operation`);
  const fields = new Set(["fontFamily", "fontSize", "fontWeight", "color", "lineHeight", "letterSpacing", "maxWordsPerLine"]);
  if (selected.kind !== "style.set" || typeof selected.field !== "string" || !fields.has(selected.field)
      || (typeof selected.value !== "string" && typeof selected.value !== "number"
        && typeof selected.value !== "boolean")) {
    throw new Error(`Caption ${context.item.id} value ${context.slot} operation is invalid.`);
  }
  style[selected.field] = selected.value;
  return style;
}

const montserrat = {
  address: fileURLToPath(import.meta.resolve(
    "@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2",
  )),
  mediaType: "font/woff2",
};

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

function resolveCaption(item, context) {
  const layout = resolveLayout(item, context.project);
  const style = context.values.style;
  if (style === undefined) throw new Error(`Fine Caption ${item.id} requires value slot style.`);
  return {
    source: {
      id: `${item.id}:source`,
      implementation: { package: "@hypit/caption-fine", symbol: "fine" },
      parameters: {
        caption: structuredClone(item.parameters.caption),
        style: structuredClone(style),
        duration: structuredClone(item.duration),
        layout: { width: layout.width, height: layout.height },
      },
      outputs: { picture: {
        signal: "picture",
        kind: "signal",
        domain: { id: `${item.id}:source-time`, duration: structuredClone(item.duration) },
        spatialDomain: {
          id: `${item.id}:source-space`,
          region: { x: 0, y: 0, width: layout.width, height: layout.height },
        },
      } },
    },
    pictureOutput: "picture",
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
        components: [{ component, editParameters: editCaptionParameters }],
        componentValues: [{ component, slot: "style", editValue: editStyle }],
        operators: [],
      },
    },
    {
      kind: "hypit.nle-lowering",
      value: { components: [{ symbol: "fine", resolve: resolveCaption }] },
    },
    {
      kind: "hypit.audiovisual-html",
      value: { sources: [{
        symbol: "fine",
        compile: source => compileCaptionFine(source, montserrat),
      }] },
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
      fontFamily: "system-ui, sans-serif", fontSize: 58, fontWeight: 800, color: "#ffffff",
      lineHeight: 1.05, letterSpacing: 0, maxWordsPerLine: 8, blockAlign: "end",
    } },
  } }],
};
