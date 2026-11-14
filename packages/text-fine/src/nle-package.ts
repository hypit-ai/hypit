import { pictureType, type ProgramSource } from "@hypit/audiovisual";
import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import {
  htmlPathTextRuntime,
  htmlTextFragment,
  htmlTextSequenceRuntime,
  htmlVisual,
  type HtmlTextNode,
} from "@hypit/html-program";
import type { NleAudiovisualComponentResolver } from "@hypit/nle-audiovisual";
import {
  resolveNlePictureLayout,
  type NleComponentItem,
  type NleComponentParameterAuthoring,
  type NleComponentResolver,
  type NlePackageSymbol,
  type NleComposition,
} from "@hypit/nle";
import { canonicalize } from "@hypit/protocol";
import { type GenerationModuleDefinition } from "@hypit/generation-build";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import type {
  TextFineFlowPlacement,
  TextFineNleEdit,
  TextFineNleParameters,
  TextFinePathCommand,
  TextFinePathPlacement,
  TextFinePlacement,
  TextFineSequence,
  TextFineSequenceState,
} from "./types.js";

export const textFineNleComponentSymbol: NlePackageSymbol = {
  module: { name: "@hypit/text-fine" },
  name: "fine",
};

export const textFineNleManifest: GenerationModuleDefinition = {
  name: textFineNleComponentSymbol.module.name,
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
  exactFields(value, ["children", "paints", "placement", "typography",
    ...(value.sequences === undefined ? [] : ["sequences"])], label);
  if (!Array.isArray(value.children) || value.children.length === 0) throw new Error(`${label}.children is empty.`);
  if (!Array.isArray(value.paints)) throw new Error(`${label}.paints must be an array.`);
  assertPlacement(value.placement);
  if (value.sequences !== undefined) assertSequences(value.sequences);
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

function pathSetupBody(): string {
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
const renderPath = localFrame => hypitLayoutTextOnPath(path, elements,
  { ...data.placement, startMarginPx: startMarginAt(localFrame) });`;
}

type TextSequenceUnitIndex = {
  readonly order: readonly string[];
  readonly nodes: ReadonlyMap<string, readonly (readonly string[])[]>;
  readonly words: ReadonlyMap<string, readonly (readonly string[])[]>;
  readonly graphemes: ReadonlyMap<string, readonly (readonly string[])[]>;
};

function wordSegments(value: string): readonly string[] {
  const segments = [...new Intl.Segmenter("und", { granularity: "word" }).segment(value)];
  const result: string[] = [];
  let pending = "";
  for (const segment of segments) {
    if (/^\s+$/u.test(segment.segment)) {
      pending += segment.segment;
    } else if (segment.isWordLike || result.length === 0) {
      result.push(`${pending}${segment.segment}`);
      pending = "";
    } else {
      result[result.length - 1] += `${pending}${segment.segment}`;
      pending = "";
    }
  }
  if (pending.length > 0) {
    if (result.length === 0) result.push(pending);
    else result[result.length - 1] += pending;
  }
  return result;
}

function graphemeSegments(value: string): readonly string[] {
  return [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(value)]
    .map((segment) => segment.segment);
}

function sequenceTextNodes(
  children: readonly HtmlTextNode[],
  sequences: readonly TextFineSequence[],
): { readonly children: readonly HtmlTextNode[]; readonly index: TextSequenceUnitIndex } {
  const split = sequences.some((sequence) => sequence.unit !== "node");
  const order: string[] = [];
  const nodes = new Map<string, readonly (readonly string[])[]>();
  const words = new Map<string, readonly (readonly string[])[]>();
  const graphemes = new Map<string, readonly (readonly string[])[]>();
  const visit = (node: HtmlTextNode): HtmlTextNode => {
    if (node.kind === "break") return structuredClone(node);
    if (node.kind === "group") return { ...structuredClone(node), children: node.children.map(visit) };
    order.push(node.id);
    if (!split) {
      const units = [[node.id]] as const;
      nodes.set(node.id, units);
      words.set(node.id, units);
      graphemes.set(node.id, units);
      return structuredClone(node);
    }
    const wordUnits = wordSegments(node.text);
    const wordTargets: string[][] = [];
    const graphemeTargets: string[][] = [];
    const wordNodes: HtmlTextNode[] = wordUnits.map((word, wordIndex) => {
      const parts = graphemeSegments(word);
      const leaves = parts.map((part, graphemeIndex) => {
        const id = `${node.id}:grapheme:${wordIndex}:${graphemeIndex}`;
        graphemeTargets.push([id]);
        return { kind: "text" as const, id, text: part };
      });
      wordTargets.push(leaves.map((leaf) => leaf.id));
      return { kind: "group" as const, id: `${node.id}:word:${wordIndex}`, children: leaves };
    });
    const allTargets = wordTargets.flat();
    nodes.set(node.id, [allTargets]);
    words.set(node.id, wordTargets);
    graphemes.set(node.id, graphemeTargets);
    return { kind: "group", id: node.id, children: wordNodes, ...(node.style === undefined ? {} : { style: node.style }) };
  };
  return { children: children.map(visit), index: { order, nodes, words, graphemes } };
}

function normalizedSequenceState(value: TextFineSequenceState) {
  const clip = value.clipInsetPercent ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    opacity: value.opacity ?? 1,
    translateX: value.translateXPx ?? 0,
    translateY: value.translateYPx ?? 0,
    scale: value.scale ?? 1,
    rotate: value.rotateDeg ?? 0,
    skewX: value.skewXDeg ?? 0,
    skewY: value.skewYDeg ?? 0,
    blur: value.blurPx ?? 0,
    clipTop: clip.top,
    clipRight: clip.right,
    clipBottom: clip.bottom,
    clipLeft: clip.left,
  };
}

function compileTextSequences(
  sequences: readonly TextFineSequence[],
  index: TextSequenceUnitIndex,
) {
  const claimed = new Set<string>();
  return sequences.map((sequence) => {
    const selected = sequence.nodes ?? index.order;
    const source = sequence.unit === "node" ? index.nodes
      : sequence.unit === "word" ? index.words : index.graphemes;
    const targets = selected.flatMap((id) => {
      const units = source.get(id);
      if (units === undefined) throw new Error(`NLE Fine Text Sequence ${sequence.id} references missing Text node ${id}.`);
      return units;
    });
    for (const target of targets) for (const id of target) {
      if (claimed.has(id)) throw new Error(`NLE Fine Text sequences overlap rendered unit ${id}.`);
      claimed.add(id);
    }
    return {
      id: sequence.id,
      targets,
      order: sequence.order,
      startFrame: sequence.startFrame,
      durationFrames: sequence.durationFrames,
      staggerFrames: sequence.staggerFrames,
      cycles: sequence.cycles,
      keyframes: sequence.keyframes.map((keyframe) => ({
        atProgress: keyframe.atProgress,
        ...(keyframe.easing === undefined ? {} : { easing: keyframe.easing }),
        state: normalizedSequenceState(keyframe.state),
      })),
    };
  });
}

function resolveTextFine(item: NleComponentItem, context: { readonly project: NleComposition }) {
  if (item.picture === undefined) throw new Error(`NLE Fine Text ${item.id} has no Picture appearance.`);
  const pictureLayout = resolveNlePictureLayout(context.project, item.picture.layout);
  assertTextFineNleParameters(item.parameters);
  const parameters = item.parameters;
  const sequences = parameters.sequences ?? [];
  const sequenced = sequenceTextNodes(parameters.children, sequences);
  const compiledSequences = compileTextSequences(sequences, sequenced.index);
  const text = htmlTextFragment({
    id: `${item.id}-text`,
    typography: parameters.typography,
    paints: parameters.paints,
    children: sequenced.children,
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
        region: { x: 0, y: 0, width: pictureLayout.width, height: pictureLayout.height },
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
  const shrinkSetup = placement.kind === "flow" && placement.overflow === "shrink" ? `
const content = root.querySelector('[data-hypit-text-fine-content]');
const frame = root.querySelector('[data-hypit-text-fine-flow]');
if (content === null || frame === null) throw new Error('Fine Text shrink structure is incomplete.');
const renderFit = () => {
  content.style.transform = '';
  content.style.transformOrigin = 'center';
  const availableWidth = frame.clientWidth;
  const availableHeight = frame.clientHeight;
  const scale = Math.max(data.placement.minimumScale,
    Math.min(1, availableWidth / Math.max(1, content.scrollWidth), availableHeight / Math.max(1, content.scrollHeight)));
  content.style.transform = 'scale(' + scale + ')';
};` : "";
  const pathSetup = placement.kind === "path" ? pathSetupBody() : "";
  const sequenceSetup = compiledSequences.length === 0 ? "" : `
${htmlTextSequenceRuntime}
const sequenceElements = new Map([...root.querySelectorAll('[data-hypit-text-kind="text"]')]
  .map(element => [element.getAttribute('data-hypit-text-node'), element]));
const renderSequences = localFrame => hypitApplyTextSequences(localFrame, data.sequences, sequenceElements);`;
  const setup = `${shrinkSetup}\n${pathSetup}\n${sequenceSetup}
return localFrame => {
  ${shrinkSetup === "" ? "" : "renderFit();"}
  ${pathSetup === "" ? "" : "renderPath(localFrame);"}
  ${sequenceSetup === "" ? "" : "renderSequences(localFrame);"}
};`;
  return {
    source,
    pictureOutput: "picture",
    html: visualProgramHtmlSource(sourceId, "picture", htmlVisual({
      dependencies: text.dependencies,
      data: { placement, sequences: compiledSequences },
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
  } else if (operation.kind === "set-sequences") {
    exactFields(operation, ["kind", "sequences"], "NLE Fine Text edit");
    next = { ...structuredClone(parameters), sequences: structuredClone(operation.sequences) };
  } else {
    throw new Error("NLE Fine Text edit.kind is invalid.");
  }
  assertTextFineNleParameters(next);
  return next;
}

export const textFineNleResolver: NleComponentResolver = {
  component: textFineNleComponentSymbol,
  resolve: (item, context) => {
    const { source, pictureOutput } = resolveTextFine(item, context);
    return { source, pictureOutput };
  },
};

export const textFineNleAudiovisualResolver: NleAudiovisualComponentResolver = {
  component: textFineNleComponentSymbol,
  resolve: (item, context) => ({ html: resolveTextFine(item, context).html }),
};

export const textFineNleAuthoring: NleComponentParameterAuthoring = {
  component: textFineNleComponentSymbol,
  inspect: (context) => {
    resolveTextFine(context.item, context);
    return canonicalize(context.item.parameters);
  },
  edit: (operation, { item }) => {
    assertTextFineNleParameters(item.parameters);
    const parameters = editTextFineNleParameters(item.parameters, operation as unknown as TextFineNleEdit);
    return canonicalize(parameters);
  },
};
