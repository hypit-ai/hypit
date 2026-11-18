import { assertNleTextFragment } from "@hypit/nle-delivery";
import type { TextFineParameters, TextFinePathCommand, TextFinePlacement, TextFineSequence, TextFineSequenceState } from "./types.js";

export function textFineHasMotion(parameters: Pick<TextFineParameters, "placement" | "sequences">): boolean {
  return (parameters.sequences?.length ?? 0) > 0
    || parameters.placement.kind === "path" && parameters.placement.marginAnimation !== undefined;
}

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

function identity(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertSequenceState(value: unknown, label: string): asserts value is TextFineSequenceState {
  record(value, label);
  exactFields(value, [
    ...(value.blurPx === undefined ? [] : ["blurPx"]),
    ...(value.clipInsetPercent === undefined ? [] : ["clipInsetPercent"]),
    ...(value.opacity === undefined ? [] : ["opacity"]),
    ...(value.rotateDeg === undefined ? [] : ["rotateDeg"]),
    ...(value.scale === undefined ? [] : ["scale"]),
    ...(value.skewXDeg === undefined ? [] : ["skewXDeg"]),
    ...(value.skewYDeg === undefined ? [] : ["skewYDeg"]),
    ...(value.translateXPx === undefined ? [] : ["translateXPx"]),
    ...(value.translateYPx === undefined ? [] : ["translateYPx"]),
  ], label);
  for (const name of ["opacity", "translateXPx", "translateYPx", "scale", "rotateDeg",
    "skewXDeg", "skewYDeg", "blurPx"] as const) {
    if (value[name] !== undefined) finite(value[name], `${label}.${name}`);
  }
  const opacity = value.opacity;
  if (opacity !== undefined) {
    finite(opacity, `${label}.opacity`);
    if (opacity < 0 || opacity > 1) throw new Error(`${label}.opacity is invalid.`);
  }
  const scale = value.scale;
  if (scale !== undefined) {
    finite(scale, `${label}.scale`);
    if (scale < 0) throw new Error(`${label}.scale is invalid.`);
  }
  const blurPx = value.blurPx;
  if (blurPx !== undefined) {
    finite(blurPx, `${label}.blurPx`);
    if (blurPx < 0) throw new Error(`${label}.blurPx is invalid.`);
  }
  if (value.clipInsetPercent !== undefined) {
    record(value.clipInsetPercent, `${label}.clipInsetPercent`);
    exactFields(value.clipInsetPercent, ["bottom", "left", "right", "top"], `${label}.clipInsetPercent`);
    for (const [name, amount] of Object.entries(value.clipInsetPercent)) {
      finite(amount, `${label}.clipInsetPercent.${name}`);
      if ((amount as number) < 0 || (amount as number) > 100) {
        throw new Error(`${label}.clipInsetPercent.${name} is invalid.`);
      }
    }
  }
}

function assertSequences(value: unknown): asserts value is readonly TextFineSequence[] {
  if (!Array.isArray(value)) throw new Error("NLE Fine Text sequences must be an array.");
  const identities = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const label = `NLE Fine Text sequences[${index}]`;
    record(candidate, label);
    exactFields(candidate, [
      "cycles", "durationFrames", "id", "keyframes",
      ...(candidate.nodes === undefined ? [] : ["nodes"]),
      "order", "staggerFrames", "startFrame", "unit",
    ], label);
    identity(candidate.id, `${label}.id`);
    if (identities.has(candidate.id)) throw new Error(`NLE Fine Text repeats Sequence ${candidate.id}.`);
    identities.add(candidate.id);
    if (!(candidate.unit === "node" || candidate.unit === "word" || candidate.unit === "grapheme")
      || !(candidate.order === "forward" || candidate.order === "reverse")) {
      throw new Error(`${label} unit or order is invalid.`);
    }
    if (candidate.nodes !== undefined) {
      if (!Array.isArray(candidate.nodes) || candidate.nodes.length === 0) throw new Error(`${label}.nodes is empty.`);
      const nodes = new Set<string>();
      for (const [nodeIndex, node] of candidate.nodes.entries()) {
        identity(node, `${label}.nodes[${nodeIndex}]`);
        if (nodes.has(node)) throw new Error(`${label}.nodes repeats ${node}.`);
        nodes.add(node);
      }
    }
    for (const [name, minimum] of [["startFrame", 0], ["durationFrames", 1],
      ["staggerFrames", 0], ["cycles", 1]] as const) {
      const amount = candidate[name];
      if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < minimum) {
        throw new Error(`${label}.${name} is invalid.`);
      }
    }
    if (!Array.isArray(candidate.keyframes) || candidate.keyframes.length < 2) {
      throw new Error(`${label}.keyframes requires at least two values.`);
    }
    let previous = -1;
    candidate.keyframes.forEach((keyframe, keyframeIndex) => {
      const keyframeLabel = `${label}.keyframes[${keyframeIndex}]`;
      record(keyframe, keyframeLabel);
      exactFields(keyframe, ["atProgress", ...(keyframe.easing === undefined ? [] : ["easing"]), "state"],
        keyframeLabel);
      finite(keyframe.atProgress, `${keyframeLabel}.atProgress`);
      if (keyframe.atProgress < 0 || keyframe.atProgress > 1 || keyframe.atProgress <= previous) {
        throw new Error(`${label} keyframe progress must increase from zero to one.`);
      }
      previous = keyframe.atProgress;
      if (keyframe.easing !== undefined && !(keyframe.easing === "linear" || keyframe.easing === "ease-in"
        || keyframe.easing === "ease-out" || keyframe.easing === "ease-in-out")) {
        throw new Error(`${keyframeLabel}.easing is invalid.`);
      }
      assertSequenceState(keyframe.state, `${keyframeLabel}.state`);
    });
    if (candidate.keyframes[0]!.atProgress !== 0 || candidate.keyframes.at(-1)!.atProgress !== 1) {
      throw new Error(`${label} keyframes must begin at zero and end at one.`);
    }
  }
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
    ...(value.background === undefined ? [] : ["background"]),
    ...(value.maxLines === undefined ? [] : ["maxLines"]),
    ...(value.minimumScale === undefined ? [] : ["minimumScale"]),
  ], label);
  if (value.background !== undefined && (typeof value.background !== "string"
      || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value.background))) {
    throw new Error(`${label}.background must be an RGB or RGBA hex color.`);
  }
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
    || value.overflow !== "ellipsis")) {
    throw new Error(`${label}.maxLines requires ellipsis overflow and a positive line count.`);
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

export function assertTextFineParameters(value: unknown): asserts value is TextFineParameters {
  const label = "NLE Fine Text parameters";
  record(value, label);
  exactFields(value, ["children", "paints", "placement", "typography",
    ...(value.motionRate === undefined ? [] : ["motionRate"]),
    ...(value.sequences === undefined ? [] : ["sequences"])], label);
  if (!Array.isArray(value.children) || value.children.length === 0) throw new Error(`${label}.children is empty.`);
  if (!Array.isArray(value.paints)) throw new Error(`${label}.paints must be an array.`);
  const { placement, sequences, motionRate } = value;
  assertPlacement(placement);
  if (sequences !== undefined) assertSequences(sequences);
  if (motionRate !== undefined || textFineHasMotion({ placement, ...(sequences === undefined ? {} : { sequences }) })) {
    record(motionRate, `${label}.motionRate`);
    exactFields(motionRate, ["numerator", "denominator"], `${label}.motionRate`);
    for (const amount of Object.values(motionRate)) {
      if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error(`${label}.motionRate requires positive integer numerator and denominator.`);
      }
    }
  }
  assertNleTextFragment({
    id: "text-fine-validation",
    typography: value.typography as TextFineParameters["typography"],
    paints: value.paints as TextFineParameters["paints"],
    children: value.children as TextFineParameters["children"],
  });
}
