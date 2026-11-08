import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlTextFragment, htmlVisual } from "@hypit/html-program";
import type { NleHtmlVideoComponentResolver } from "@hypit/html-video";
import type {
  NleComponentItem,
  NleComponentParameterAuthoring,
  NleComponentResolver,
  NlePackageSymbol,
} from "@hypit/nle";
import { canonicalize, type ModuleManifest } from "@hypit/protocol";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import type {
  TextFineFlowPlacement,
  TextFineNleEdit,
  TextFineNleParameters,
  TextFinePlacement,
} from "./types.js";

export const textFineNleComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit/text-fine", version: "1" },
  name: "fine",
};

export const textFineNleManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: textFineNleComponentSymbol.module.name,
  version: textFineNleComponentSymbol.module.version,
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a record.`);
  }
}

function exactFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  if (Object.keys(value).sort().join("\u0000") !== [...fields].sort().join("\u0000")) {
    throw new Error(`${label} has invalid fields.`);
  }
}

function finite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function nonNegative(value: unknown, label: string): asserts value is number {
  finite(value, label);
  if (value < 0) throw new Error(`${label} must not be negative.`);
}

function assertPlacement(value: unknown): asserts value is TextFinePlacement {
  const label = "NLE Fine Text placement";
  record(value, label);
  if (value.kind === "point") {
    exactFields(value, ["anchorBlock", "anchorInline", "kind", "x", "y"], label);
    finite(value.x, `${label}.x`);
    finite(value.y, `${label}.y`);
    if (!(value.anchorInline === "start" || value.anchorInline === "center" || value.anchorInline === "end")
      || !(value.anchorBlock === "start" || value.anchorBlock === "center" || value.anchorBlock === "end")) {
      throw new Error(`${label} anchor is invalid.`);
    }
    return;
  }
  if (value.kind !== "flow") throw new Error(`${label}.kind is invalid.`);
  exactFields(value, [
    "blockAlign", "columnGapPx", "columns", "inlineAlign", "kind", "overflow", "paddingPx", "wrap",
    ...(value.maxLines === undefined ? [] : ["maxLines"]),
    ...(value.minimumScale === undefined ? [] : ["minimumScale"]),
  ], label);
  record(value.paddingPx, `${label}.paddingPx`);
  exactFields(value.paddingPx, ["bottom", "left", "right", "top"], `${label}.paddingPx`);
  for (const [name, amount] of Object.entries(value.paddingPx)) nonNegative(amount, `${label}.paddingPx.${name}`);
  if (!(value.inlineAlign === "left" || value.inlineAlign === "center"
    || value.inlineAlign === "right" || value.inlineAlign === "justify")) {
    throw new Error(`${label}.inlineAlign is invalid.`);
  }
  if (!(value.blockAlign === "start" || value.blockAlign === "center" || value.blockAlign === "end")) {
    throw new Error(`${label}.blockAlign is invalid.`);
  }
  if (!(value.wrap === "none" || value.wrap === "word" || value.wrap === "grapheme")) {
    throw new Error(`${label}.wrap is invalid.`);
  }
  if (!(value.overflow === "visible" || value.overflow === "clip"
    || value.overflow === "ellipsis" || value.overflow === "shrink")) {
    throw new Error(`${label}.overflow is invalid.`);
  }
  if (typeof value.columns !== "number" || !Number.isSafeInteger(value.columns) || value.columns < 1) {
    throw new Error(`${label}.columns is invalid.`);
  }
  nonNegative(value.columnGapPx, `${label}.columnGapPx`);
  if (value.maxLines !== undefined && (typeof value.maxLines !== "number"
    || !Number.isSafeInteger(value.maxLines) || value.maxLines < 1
    || (value.overflow !== "ellipsis" && value.overflow !== "shrink"))) {
    throw new Error(`${label}.maxLines belongs only to ellipsis or shrink overflow.`);
  }
  if (value.minimumScale !== undefined && (typeof value.minimumScale !== "number"
    || !(value.minimumScale > 0 && value.minimumScale <= 1)
    || value.overflow !== "shrink")) {
    throw new Error(`${label}.minimumScale belongs only to shrink overflow.`);
  }
  if (value.overflow === "shrink" && value.minimumScale === undefined) {
    throw new Error(`${label} shrink overflow requires minimumScale.`);
  }
}

export function assertTextFineNleParameters(value: unknown): asserts value is TextFineNleParameters {
  const label = "NLE Fine Text parameters";
  record(value, label);
  exactFields(value, ["children", "paints", "placement", "typography"], label);
  if (!Array.isArray(value.children) || value.children.length === 0) throw new Error(`${label}.children is empty.`);
  if (!Array.isArray(value.paints)) throw new Error(`${label}.paints must be an array.`);
  assertPlacement(value.placement);
  htmlTextFragment({
    id: "text-fine-validation",
    typography: value.typography as TextFineNleParameters["typography"],
    paints: value.paints as TextFineNleParameters["paints"],
    children: value.children as TextFineNleParameters["children"],
  });
}

function flowCss(placement: TextFineFlowPlacement): string {
  const vertical = placement.blockAlign === "start" ? "flex-start"
    : placement.blockAlign === "center" ? "center" : "flex-end";
  const whiteSpace = placement.wrap === "none" ? "nowrap" : "normal";
  const wordBreak = placement.wrap === "grapheme" ? "break-all" : "normal";
  const overflow = placement.overflow === "visible" ? "visible" : "hidden";
  const clamp = placement.overflow === "ellipsis" && placement.maxLines !== undefined
    ? `;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${placement.maxLines}` : "";
  return `:scope>[data-hypit-text-fine-flow]{position:absolute;inset:0;display:flex;align-items:${vertical};padding:${placement.paddingPx.top}px ${placement.paddingPx.right}px ${placement.paddingPx.bottom}px ${placement.paddingPx.left}px;text-align:${placement.inlineAlign};overflow:${overflow}}:scope [data-hypit-text-fine-content]{width:100%;white-space:${whiteSpace};overflow-wrap:${placement.wrap === "word" ? "anywhere" : "normal"};word-break:${wordBreak};column-count:${placement.columns};column-gap:${placement.columnGapPx}px${clamp}}`;
}

function pointCss(placement: Extract<TextFinePlacement, { readonly kind: "point" }>): string {
  const x = placement.anchorInline === "start" ? 0 : placement.anchorInline === "center" ? -50 : -100;
  const y = placement.anchorBlock === "start" ? 0 : placement.anchorBlock === "center" ? -50 : -100;
  return `:scope>[data-hypit-text-fine-point]{position:absolute;left:${placement.x}px;top:${placement.y}px;width:max-content;height:max-content;transform:translate(${x}%,${y}%);white-space:pre}`;
}

function resolveTextFine(item: NleComponentItem) {
  if (item.picture === undefined) throw new Error(`NLE Fine Text ${item.id} has no Picture appearance.`);
  assertTextFineNleParameters(item.parameters);
  const parameters = item.parameters;
  const text = htmlTextFragment({
    id: `${item.id}-text`,
    typography: parameters.typography,
    paints: parameters.paints,
    children: parameters.children,
  });
  const sourceId = `${item.id}:text-source`;
  const source: ProgramSource = {
    id: sourceId,
    outputs: { picture: {
      kind: "signal",
      type: pictureType,
      domain: sealLocalTemporalDomain({ id: `${sourceId}:time`, duration: structuredClone(item.duration) }),
      spatialDomain: sealLocalSpatialDomain({
        id: `${sourceId}:picture`,
        region: { x: 0, y: 0, width: item.picture.layout.width, height: item.picture.layout.height },
      }),
    } },
  };
  const flow = parameters.placement.kind === "flow";
  return {
    source,
    pictureOutput: "picture",
    html: visualProgramHtmlSource(sourceId, "picture", htmlVisual({
      dependencies: text.dependencies,
      data: { placement: parameters.placement },
      html: flow
        ? `<div data-hypit-text-fine-flow><div data-hypit-text-fine-content>${text.html}</div></div>`
        : `<div data-hypit-text-fine-point>${text.html}</div>`,
      css: flow ? flowCss(parameters.placement as TextFineFlowPlacement) : pointCss(parameters.placement),
      setup: flow && parameters.placement.overflow === "shrink" ? `
const content = root.querySelector('[data-hypit-text-fine-content]');
const frame = root.querySelector('[data-hypit-text-fine-flow]');
if (content === null || frame === null) throw new Error('Fine Text shrink structure is incomplete.');
const fit = () => {
  content.style.transform = '';
  content.style.transformOrigin = 'center';
  const availableWidth = frame.clientWidth;
  const availableHeight = frame.clientHeight;
  const scale = Math.max(data.placement.minimumScale,
    Math.min(1, availableWidth / Math.max(1, content.scrollWidth), availableHeight / Math.max(1, content.scrollHeight)));
  content.style.transform = 'scale(' + scale + ')';
};
return () => fit();` : "return () => {};",
    })),
  };
}

export function editTextFineNleParameters(
  parameters: TextFineNleParameters,
  operation: TextFineNleEdit,
): TextFineNleParameters {
  assertTextFineNleParameters(parameters);
  record(operation, "NLE Fine Text edit");
  let next: TextFineNleParameters;
  if (operation.kind === "set-document") {
    exactFields(operation, ["children", "kind"], "NLE Fine Text edit");
    next = { ...structuredClone(parameters), children: structuredClone(operation.children) };
  } else if (operation.kind === "set-style") {
    exactFields(operation, ["kind", "paints", "typography"], "NLE Fine Text edit");
    next = {
      ...structuredClone(parameters),
      typography: structuredClone(operation.typography),
      paints: structuredClone(operation.paints),
    };
  } else if (operation.kind === "set-placement") {
    exactFields(operation, ["kind", "placement"], "NLE Fine Text edit");
    next = { ...structuredClone(parameters), placement: structuredClone(operation.placement) };
  } else {
    throw new Error("NLE Fine Text edit.kind is invalid.");
  }
  assertTextFineNleParameters(next);
  return next;
}

export const textFineNleResolver: NleComponentResolver = {
  component: textFineNleComponentSymbol,
  resolve: (item) => {
    const { source, pictureOutput } = resolveTextFine(item);
    return { source, pictureOutput };
  },
};

export const textFineNleHtmlVideoResolver: NleHtmlVideoComponentResolver = {
  component: textFineNleComponentSymbol,
  resolve: (item) => ({ html: resolveTextFine(item).html }),
};

export const textFineNleAuthoring: NleComponentParameterAuthoring = {
  component: textFineNleComponentSymbol,
  inspect: ({ item }) => {
    resolveTextFine(item);
    return canonicalize(item.parameters);
  },
  edit: (operation, { item }) => {
    assertTextFineNleParameters(item.parameters);
    const parameters = editTextFineNleParameters(item.parameters, operation as unknown as TextFineNleEdit);
    return canonicalize(parameters);
  },
};
