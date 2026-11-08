import { pointwiseOperatorTemporalSupport, type PictureOperator } from "@hypit/audiovisual";
import { htmlVisual } from "@hypit/html-program";

export type PictureFramePathCommand =
  | { readonly kind: "move"; readonly x: number; readonly y: number }
  | { readonly kind: "line"; readonly x: number; readonly y: number }
  | { readonly kind: "quadratic"; readonly controlX: number; readonly controlY: number; readonly x: number; readonly y: number }
  | {
      readonly kind: "cubic";
      readonly control1X: number;
      readonly control1Y: number;
      readonly control2X: number;
      readonly control2Y: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: "close" };

export type PictureFrameClip =
  | { readonly kind: "none" }
  | { readonly kind: "frame" }
  | { readonly kind: "rounded"; readonly radiusPx: number }
  | { readonly kind: "path"; readonly commands: readonly PictureFramePathCommand[] };

export type PictureFrameTreatment = {
  readonly clip: PictureFrameClip;
  readonly padding: {
    readonly topPx: number;
    readonly rightPx: number;
    readonly bottomPx: number;
    readonly leftPx: number;
  };
  readonly border?: {
    readonly widthPx: number;
    readonly style: "solid" | "dashed" | "dotted";
    readonly color: string;
  };
  readonly shadows: readonly {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blurPx: number;
    readonly spreadPx: number;
    readonly color: string;
  }[];
};

export const UNTREATED_PICTURE_FRAME: PictureFrameTreatment = {
  clip: { kind: "frame" },
  padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 },
  shadows: [],
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

function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text.`);
}

function assertPathCommand(value: unknown, label: string): asserts value is PictureFramePathCommand {
  record(value, label);
  switch (value.kind) {
    case "move":
    case "line":
      exactFields(value, ["kind", "x", "y"], label);
      finite(value.x, `${label}.x`);
      finite(value.y, `${label}.y`);
      return;
    case "quadratic":
      exactFields(value, ["controlX", "controlY", "kind", "x", "y"], label);
      finite(value.controlX, `${label}.controlX`);
      finite(value.controlY, `${label}.controlY`);
      finite(value.x, `${label}.x`);
      finite(value.y, `${label}.y`);
      return;
    case "cubic":
      exactFields(value, ["control1X", "control1Y", "control2X", "control2Y", "kind", "x", "y"], label);
      finite(value.control1X, `${label}.control1X`);
      finite(value.control1Y, `${label}.control1Y`);
      finite(value.control2X, `${label}.control2X`);
      finite(value.control2Y, `${label}.control2Y`);
      finite(value.x, `${label}.x`);
      finite(value.y, `${label}.y`);
      return;
    case "close":
      exactFields(value, ["kind"], label);
      return;
    default: throw new Error(`${label}.kind is invalid.`);
  }
}

export function assertPictureFrameTreatment(
  value: PictureFrameTreatment,
  label = "Picture Frame treatment",
): void {
  record(value, label);
  exactFields(value, value.border === undefined
    ? ["clip", "padding", "shadows"]
    : ["border", "clip", "padding", "shadows"], label);
  record(value.clip, `${label}.clip`);
  if (value.clip.kind === "none" || value.clip.kind === "frame") {
    exactFields(value.clip, ["kind"], `${label}.clip`);
  } else if (value.clip.kind === "rounded") {
    exactFields(value.clip, ["kind", "radiusPx"], `${label}.clip`);
    nonNegative(value.clip.radiusPx, `${label}.clip.radiusPx`);
  } else if (value.clip.kind === "path") {
    exactFields(value.clip, ["commands", "kind"], `${label}.clip`);
    if (!Array.isArray(value.clip.commands) || value.clip.commands.length === 0) {
      throw new Error(`${label}.clip.commands must not be empty.`);
    }
    value.clip.commands.forEach((command, index) => assertPathCommand(command, `${label}.clip.commands[${index}]`));
  } else {
    throw new Error(`${label}.clip.kind is invalid.`);
  }
  record(value.padding, `${label}.padding`);
  exactFields(value.padding, ["bottomPx", "leftPx", "rightPx", "topPx"], `${label}.padding`);
  for (const [name, padding] of Object.entries(value.padding)) nonNegative(padding, `${label}.padding.${name}`);
  if (value.border !== undefined) {
    record(value.border, `${label}.border`);
    exactFields(value.border, ["color", "style", "widthPx"], `${label}.border`);
    nonNegative(value.border.widthPx, `${label}.border.widthPx`);
    if (!(["solid", "dashed", "dotted"] as const).includes(value.border.style)) {
      throw new Error(`${label}.border.style is invalid.`);
    }
    text(value.border.color, `${label}.border.color`);
  }
  if (!Array.isArray(value.shadows)) throw new Error(`${label}.shadows must be an array.`);
  for (const [index, shadow] of value.shadows.entries()) {
    const shadowLabel = `${label}.shadows[${index}]`;
    record(shadow, shadowLabel);
    exactFields(shadow, ["blurPx", "color", "offsetX", "offsetY", "spreadPx"], shadowLabel);
    finite(shadow.offsetX, `${shadowLabel}.offsetX`);
    finite(shadow.offsetY, `${shadowLabel}.offsetY`);
    nonNegative(shadow.blurPx, `${shadowLabel}.blurPx`);
    finite(shadow.spreadPx, `${shadowLabel}.spreadPx`);
    text(shadow.color, `${shadowLabel}.color`);
  }
}

export function pictureFrameOperator(treatment: PictureFrameTreatment): PictureOperator {
  assertPictureFrameTreatment(treatment);
  return {
    id: "hypit.picture-frame:frame",
    inputs: ["picture"],
    temporalControls: {},
    temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
    program: htmlVisual({
      html: '<div data-hypit-picture-frame-shadow><div data-hypit-picture-frame><div data-hypit-picture-frame-content>{{picture}}</div></div></div>',
      css: `:scope { position: absolute; inset: 0; overflow: visible; }
:scope > [data-hypit-picture-frame-shadow],
:scope [data-hypit-picture-frame] { position: absolute; inset: 0; box-sizing: border-box; }
:scope [data-hypit-picture-frame-content] { position: relative; width: 100%; height: 100%; box-sizing: border-box; }
:scope [data-hypit-picture-frame-content] > * { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }`,
      data: structuredClone(treatment),
      setup: `const shadow = root.querySelector('[data-hypit-picture-frame-shadow]');
const frame = root.querySelector('[data-hypit-picture-frame]');
if (shadow === null || frame === null) throw new Error('Picture Frame requires its wrappers.');
const px = value => \`${'${value}'}px\`;
const path = commands => commands.map(command => {
  switch (command.kind) {
    case 'move': return \`M ${'${command.x}'} ${'${command.y}'}\`;
    case 'line': return \`L ${'${command.x}'} ${'${command.y}'}\`;
    case 'quadratic': return \`Q ${'${command.controlX}'} ${'${command.controlY}'} ${'${command.x}'} ${'${command.y}'}\`;
    case 'cubic': return \`C ${'${command.control1X}'} ${'${command.control1Y}'} ${'${command.control2X}'} ${'${command.control2Y}'} ${'${command.x}'} ${'${command.y}'}\`;
    case 'close': return 'Z';
  }
}).join(' ');
frame.style.padding = [data.padding.topPx, data.padding.rightPx, data.padding.bottomPx, data.padding.leftPx]
  .map(px).join(' ');
if (data.border !== undefined) frame.style.border = \`${'${data.border.widthPx}'}px ${'${data.border.style}'} ${'${data.border.color}'}\`;
if (data.shadows.length > 0) shadow.style.boxShadow = data.shadows.map(value =>
  \`${'${value.offsetX}'}px ${'${value.offsetY}'}px ${'${value.blurPx}'}px ${'${value.spreadPx}'}px ${'${value.color}'}\`).join(',');
if (data.clip.kind === 'none') frame.style.overflow = 'visible';
else {
  frame.style.overflow = 'hidden';
  if (data.clip.kind === 'rounded') frame.style.borderRadius = px(data.clip.radiusPx);
  if (data.clip.kind === 'path') frame.style.clipPath = \`path("${'${path(data.clip.commands)}'}")\`;
}
return () => {};`,
    }),
  };
}
