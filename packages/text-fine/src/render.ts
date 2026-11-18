import { resolveNlePictureLayout, type NleComponentItem } from "@hypit/nle";
import { nleTextFragment, type NleComponentPicture, type NleComponentRenderContext, type NleTextNode } from "@hypit/nle-delivery";
import { assertTextFineParameters, textFineHasMotion } from "./parameters.js";
import { htmlPathTextRuntime } from "./path-text.js";
import { htmlTextSequenceRuntime } from "./text-sequence.js";
import type { TextFineFlowPlacement, TextFineParameters, TextFinePathCommand, TextFinePathPlacement, TextFinePlacement,
  TextFineSequence, TextFineSequenceState } from "./types.js";

function flowCss(placement: TextFineFlowPlacement): string {
  const vertical = placement.blockAlign === "start" ? "flex-start"
    : placement.blockAlign === "center" ? "center" : "flex-end";
  const whiteSpace = placement.wrap === "none" ? "nowrap" : "normal";
  const wordBreak = placement.wrap === "grapheme" ? "break-all" : "normal";
  const background = placement.background === undefined ? "" : `;background:${placement.background}`;
  const overflow = placement.overflow === "visible" ? "visible" : "hidden";
  const clamp = placement.overflow === "ellipsis"
    ? `;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${placement.maxLines ?? 1};overflow:hidden` : "";
  const wrapRuns = placement.wrap === "none" ? ""
    : `:scope [data-hypit-text-fine-content] [data-hypit-text-kind="text"]{max-width:100%;min-width:0}`;
  return `:scope>[data-hypit-text-fine-flow]{position:absolute;inset:0;box-sizing:border-box;display:flex;align-items:${vertical};padding:${placement.paddingPx.top}px ${placement.paddingPx.right}px ${placement.paddingPx.bottom}px ${placement.paddingPx.left}px;text-align:${placement.inlineAlign};overflow:${overflow}${background}}:scope [data-hypit-text-fine-content]{width:100%;white-space:${whiteSpace};overflow-wrap:${placement.wrap === "word" ? "anywhere" : "normal"};word-break:${wordBreak};column-count:${placement.columns};column-gap:${placement.columnGapPx}px${clamp}}${wrapRuns}`;
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
  return `:scope>[data-hypit-text-fine-path]{position:absolute;inset:0;overflow:${placement.overflow === "clip" ? "hidden" : "visible"}}:scope [data-hypit-text-fine-path-guide],:scope [data-hypit-text-fine-path-content]{position:absolute;inset:0;width:100%;height:100%;overflow:visible}:scope [data-hypit-text-fine-path-guide]{pointer-events:none}:scope [data-hypit-text-fine-path-content] [data-hypit-text-kind="group"]{position:static!important;display:contents}:scope [data-hypit-text-fine-path-content] [data-hypit-text-kind="text"]{position:absolute!important;left:0;top:0;box-sizing:border-box;white-space:pre}`;
}

function pathSetupBody(): string {
  return `
${htmlPathTextRuntime}
const path = root.querySelector('[data-hypit-text-fine-path-guide] path');
const elements = [...root.querySelectorAll('[data-hypit-text-fine-path-content] [data-hypit-text-kind="text"]')];
if (path === null) throw new Error('Fine Text path structure is incomplete.');
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
  children: readonly NleTextNode[],
  sequences: readonly TextFineSequence[],
  followsPath: boolean,
): { readonly children: readonly NleTextNode[]; readonly index: TextSequenceUnitIndex } {
  const split = followsPath || sequences.some((sequence) => sequence.unit !== "node");
  const order: string[] = [];
  const nodes = new Map<string, readonly (readonly string[])[]>();
  const words = new Map<string, readonly (readonly string[])[]>();
  const graphemes = new Map<string, readonly (readonly string[])[]>();
  const visit = (node: NleTextNode): NleTextNode => {
    if (node.kind === "break") return structuredClone(node);
    if (node.kind === "group") return { ...structuredClone(node), children: node.children.map(visit) };
    order.push(node.id);
    if (!split || node.text.length === 0) {
      const units = [[node.id]] as const;
      nodes.set(node.id, units);
      words.set(node.id, units);
      graphemes.set(node.id, units);
      return structuredClone(node);
    }
    const wordUnits = wordSegments(node.text);
    const wordTargets: string[][] = [];
    const graphemeTargets: string[][] = [];
    const wordNodes: NleTextNode[] = wordUnits.map((word, wordIndex) => {
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

export function renderTextFine(item: NleComponentItem, context: NleComponentRenderContext): NleComponentPicture {
  if (item.picture === undefined) throw new Error(`Fine Text ${item.id} requires a Picture layout.`);
  const { width, height } = resolveNlePictureLayout(context.project, item.picture.layout);
  const parameters = item.parameters;
  assertTextFineParameters(parameters);
  const { placement } = parameters;
  const sequences = parameters.sequences ?? [];
  const sequenced = sequenceTextNodes(parameters.children, sequences, placement.kind === "path");
  const compiledSequences = compileTextSequences(sequences, sequenced.index);
  const text = nleTextFragment({
    id: item.id, typography: parameters.typography, paints: parameters.paints, children: sequenced.children,
  }, context.resolveTextFont);
  const html = placement.kind === "flow"
    ? `<div data-hypit-text-fine-flow><div data-hypit-text-fine-content>${text.html}</div></div>`
    : placement.kind === "point"
      ? `<div data-hypit-text-fine-point>${text.html}</div>`
      : `<div data-hypit-text-fine-path><svg data-hypit-text-fine-path-guide aria-hidden="true"><path d="${pathData(placement.commands)}" fill="none" stroke="none"></path></svg><div data-hypit-text-fine-path-content>${text.html}</div></div>`;
  const css = placement.kind === "flow" ? flowCss(placement)
    : placement.kind === "point" ? pointCss(placement) : pathCss(placement);

  const init: string[] = [];
  const update: string[] = [];
  if (placement.kind === "flow" && placement.overflow === "shrink") {
    init.push(`
const content = root.querySelector('[data-hypit-text-fine-content]');
const frame = root.querySelector('[data-hypit-text-fine-flow]');
if (content === null || frame === null) throw new Error('Fine Text shrink structure is incomplete.');
let fitted = false;
const fit = () => {
  if (fitted || frame.clientWidth === 0 || frame.clientHeight === 0) return;
  const style = getComputedStyle(frame);
  const width = frame.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = frame.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.max(data.placement.minimumScale,
    Math.min(1, width / Math.max(1, content.scrollWidth), height / Math.max(1, content.scrollHeight)));
  content.style.transformOrigin = data.placement.blockAlign === 'start' ? 'center top'
    : data.placement.blockAlign === 'end' ? 'center bottom' : 'center';
  content.style.transform = 'scale(' + scale + ')';
  fitted = true;
};`);
    update.push("fit();");
  }
  if (placement.kind === "path") {
    init.push(pathSetupBody());
    update.push("renderPath(sourceFrame);");
  }
  if (compiledSequences.length > 0) {
    init.push(htmlTextSequenceRuntime, `
const sequenceElements = new Map([...root.querySelectorAll('[data-hypit-text-kind="text"]')]
  .map(element => [element.getAttribute('data-hypit-text-node'), element]));`);
    update.push("hypitApplyTextSequences(sourceFrame, data.sequences, sequenceElements);");
  }
  return {
    region: { x: 0, y: 0, width, height },
    ...(textFineHasMotion(parameters) ? { duration: context.sourceDuration } : {}),
    visual: {
      html, css, dependencies: text.dependencies,
      ...(update.length === 0 ? {} : {
        data: { placement, sequences: compiledSequences, motionRate: parameters.motionRate ?? null },
        setup: `${init.join("\n")}\nconst sourceScale = data.motionRate === null ? 1
          : data.motionRate.numerator / data.motionRate.denominator / context.frameRate;
          return localFrame => { const sourceFrame = localFrame * sourceScale; ${update.join("\n")} };`,
      }),
    },
  };
}
