import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlPathTextRuntime, htmlTextFragment, htmlVisual } from "@hypit/html-program";
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
  TextFinePathCommand,
  TextFinePathPlacement,
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

function assertPathCommand(value: unknown, label: string): asserts value is TextFinePathCommand {
  record(value, label);
  if (value.kind === "move" || value.kind === "line") {
    exactFields(value, ["kind", "x", "y"], label);
    finite(value.x, `${label}.x`);
    finite(value.y, `${label}.y`);
    return;
  }
  if (value.kind === "quadratic") {
    exactFields(value, ["controlX", "controlY", "kind", "x", "y"], label);
    finite(value.controlX, `${label}.controlX`);
    finite(value.controlY, `${label}.controlY`);
    finite(value.x, `${label}.x`);
    finite(value.y, `${label}.y`);
    return;
  }
  if (value.kind === "cubic") {
    exactFields(value, ["control1X", "control1Y", "control2X", "control2Y", "kind", "x", "y"], label);
    finite(value.control1X, `${label}.control1X`);
    finite(value.control1Y, `${label}.control1Y`);
    finite(value.control2X, `${label}.control2X`);
    finite(value.control2Y, `${label}.control2Y`);
    finite(value.x, `${label}.x`);
    finite(value.y, `${label}.y`);
    return;
  }
  if (value.kind === "close") {
    exactFields(value, ["kind"], label);
    return;
  }
  throw new Error(`${label}.kind is invalid.`);
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
  if (value.kind === "path") {
    exactFields(value, [
      "align", "commands", "endMarginPx", "kind", "orientation", "overflow", "reverse", "side",
      "startMarginPx", ...(value.marginAnimation === undefined ? [] : ["marginAnimation"]),
    ], label);
    if (!Array.isArray(value.commands) || value.commands.length < 2) {
      throw new Error(`${label}.commands must contain at least two commands.`);
    }
    value.commands.forEach((command, index) => assertPathCommand(command, `${label}.commands[${index}]`));
    if (value.commands[0]?.kind !== "move") throw new Error(`${label}.commands must begin with move.`);
    nonNegative(value.startMarginPx, `${label}.startMarginPx`);
    nonNegative(value.endMarginPx, `${label}.endMarginPx`);
    if (!(value.side === "left" || value.side === "right")
      || !(value.orientation === "follow" || value.orientation === "upright")
      || !(value.align === "start" || value.align === "center" || value.align === "end")
      || typeof value.reverse !== "boolean"
      || !(value.overflow === "visible" || value.overflow === "clip")) {
      throw new Error(`${label} path policy is invalid.`);
    }
    if (value.marginAnimation !== undefined) {
      record(value.marginAnimation, `${label}.marginAnimation`);
      exactFields(value.marginAnimation, ["keyframes"], `${label}.marginAnimation`);
      if (!Array.isArray(value.marginAnimation.keyframes) || value.marginAnimation.keyframes.length === 0) {
        throw new Error(`${label}.marginAnimation.keyframes is empty.`);
      }
      let previous = -1;
      value.marginAnimation.keyframes.forEach((keyframe, index) => {
        record(keyframe, `${label}.marginAnimation.keyframes[${index}]`);
        exactFields(keyframe, ["atFrame", "startMarginPx",
          ...(keyframe.easing === undefined ? [] : ["easing"])], `${label}.marginAnimation.keyframes[${index}]`);
        if (typeof keyframe.atFrame !== "number" || !Number.isSafeInteger(keyframe.atFrame)
          || keyframe.atFrame < 0 || keyframe.atFrame <= previous) {
          throw new Error(`${label}.marginAnimation keyframe times must increase.`);
        }
        previous = keyframe.atFrame;
        nonNegative(keyframe.startMarginPx, `${label}.marginAnimation.keyframes[${index}].startMarginPx`);
        if (keyframe.easing !== undefined && !(keyframe.easing === "linear" || keyframe.easing === "ease-in"
          || keyframe.easing === "ease-out" || keyframe.easing === "ease-in-out")) {
          throw new Error(`${label}.marginAnimation.keyframes[${index}].easing is invalid.`);
        }
      });
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

function pathNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(Number(value.toFixed(8)));
}

function pathData(commands: readonly TextFinePathCommand[]): string {
  return commands.map((command) => {
    if (command.kind === "move") return `M${pathNumber(command.x)} ${pathNumber(command.y)}`;
    if (command.kind === "line") return `L${pathNumber(command.x)} ${pathNumber(command.y)}`;
    if (command.kind === "quadratic") {
      return `Q${pathNumber(command.controlX)} ${pathNumber(command.controlY)} ${pathNumber(command.x)} ${pathNumber(command.y)}`;
    }
    if (command.kind === "cubic") {
      return `C${pathNumber(command.control1X)} ${pathNumber(command.control1Y)} ${pathNumber(command.control2X)} ${pathNumber(command.control2Y)} ${pathNumber(command.x)} ${pathNumber(command.y)}`;
    }
    return "Z";
  }).join(" ");
}

function pathCss(placement: TextFinePathPlacement): string {
  return `:scope>[data-hypit-text-fine-path]{position:absolute;inset:0;overflow:${placement.overflow === "clip" ? "hidden" : "visible"}}:scope [data-hypit-text-fine-path-guide],:scope [data-hypit-text-fine-path-content]{position:absolute;inset:0;width:100%;height:100%;overflow:visible}:scope [data-hypit-text-fine-path-guide]{pointer-events:none}:scope [data-hypit-text-fine-path-content] [data-hypit-text-kind="group"]{position:static!important;display:contents}:scope [data-hypit-text-fine-path-content] [data-hypit-text-kind="text"]{position:absolute!important;left:0;top:0;white-space:pre}`;
}

function pathSetup(): string {
  return `
${htmlPathTextRuntime}
const path = root.querySelector('[data-hypit-text-fine-path-guide] path');
const elements = [...root.querySelectorAll('[data-hypit-text-fine-path-content] [data-hypit-text-kind="text"]')];
if (path === null || elements.length === 0) throw new Error('Fine Text path structure is incomplete.');
const ease = (kind, value) => kind === 'ease-in' ? value * value * value
  : kind === 'ease-out' ? 1 - Math.pow(1 - value, 3)
  : kind === 'ease-in-out' ? value < 0.5 ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2 : value;
const startMarginAt = frame => {
  const keyframes = data.placement.marginAnimation?.keyframes;
  if (keyframes === undefined || keyframes.length === 0) return data.placement.startMarginPx;
  if (frame <= keyframes[0].atFrame) return keyframes[0].startMarginPx;
  const last = keyframes[keyframes.length - 1];
  if (frame >= last.atFrame) return last.startMarginPx;
  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index], left = keyframes[index - 1];
    if (frame > right.atFrame) continue;
    const progress = ease(right.easing || 'linear',
      (frame - left.atFrame) / (right.atFrame - left.atFrame));
    return left.startMarginPx + (right.startMarginPx - left.startMarginPx) * progress;
  }
  return last.startMarginPx;
};
return localFrame => hypitLayoutTextOnPath(path, elements,
  { ...data.placement, startMarginPx: startMarginAt(localFrame) });`;
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
  const placement = parameters.placement;
  const html = placement.kind === "flow"
    ? `<div data-hypit-text-fine-flow><div data-hypit-text-fine-content>${text.html}</div></div>`
    : placement.kind === "point"
      ? `<div data-hypit-text-fine-point>${text.html}</div>`
      : `<div data-hypit-text-fine-path><svg data-hypit-text-fine-path-guide aria-hidden="true"><path d="${pathData(placement.commands)}" fill="none" stroke="none"></path></svg><div data-hypit-text-fine-path-content>${text.html}</div></div>`;
  const css = placement.kind === "flow" ? flowCss(placement)
    : placement.kind === "point" ? pointCss(placement) : pathCss(placement);
  const setup = placement.kind === "flow" && placement.overflow === "shrink" ? `
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
return () => fit();` : placement.kind === "path" ? pathSetup() : "return () => {};";
  return {
    source,
    pictureOutput: "picture",
    html: visualProgramHtmlSource(sourceId, "picture", htmlVisual({
      dependencies: text.dependencies,
      data: { placement },
      html,
      css,
      setup,
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
