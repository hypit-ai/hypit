import { assertCompositableSurfaceRef, verifyPreparedVisualSource } from "@hypit/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";
import { assertFrameSpan, timelineFrameCount } from "@hypit/timeline";
import type { FrameSpan, Timeline } from "@hypit/timeline";
import {
  assertCompositionIdentity,
  visualElements,
  visualPresents,
  visualScopeTrackOccurrences,
  visualScopeTracks,
} from "@hypit/composition";
import type {
  Composition,
  VisualAnimation,
  VisualAdjustment,
  VisualAttribute,
  VisualElement,
  VisualItem,
  VisualPresent,
  VisualStyleDeclaration,
  VisualScope,
} from "@hypit/composition";
import { assertTemporalMap, resolveTemporalBoundary, temporalValueInFrames } from "@hypit/temporal";
import type { ExactTemporalValue, TemporalMap } from "@hypit/temporal";
import { assertBlobRef, canonicalStringify, compareCodeUnits, isResourceId } from "@hypit/hypit/protocol";
import type { BlobRef, ResourceId } from "@hypit/hypit/protocol";
import { VISUAL_IR_V1 } from "@hypit/composition";
import { readHtmlVisual, htmlVisualHtml, htmlVisualScript } from "./html-visual.js";
import { htmlAdjustmentScript, readHtmlAdjustment } from "./html-adjustment.js";
import { presentationCaptureScopeRuntime } from "./capture-scope.js";
import { presentationVisibilityScript } from "./visibility.js";
import { frameSelectionRuntime, frameWorkIndexRuntime } from "./frame-work.js";

function isBlobRef(value: unknown): value is BlobRef {
  try {
    assertBlobRef(value);
    return true;
  } catch {
    return false;
  }
}

import type {
  ResourceUrlResolver,
  HtmlArtifact,
  HtmlProgram,
  HtmlVideoSource,
} from "./types.js";
import {
  collectTerminalTextFonts,
  renderGlyphPaintedString,
  renderTerminalTextElement,
  terminalTextLayoutScript,
} from "./text.js";

const NANOSECONDS = 1_000_000_000n;
const RESOURCE_URI = /hypit-resource:\/\/(res_[a-zA-Z0-9._:-]+)/gu;
const SURFACE_RESOURCE = /data-hypit-surface-resource="(res_[a-zA-Z0-9._:-]+)"/gu;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function frameSeconds(frame: number, numerator: number, denominator: number): string {
  const nanos = BigInt(frame) * BigInt(denominator) * NANOSECONDS / BigInt(numerator);
  const whole = nanos / NANOSECONDS;
  const remainder = nanos % NANOSECONDS;
  if (remainder === 0n) return String(whole);
  return `${whole}.${String(remainder).padStart(9, "0").replace(/0+$/u, "")}`;
}

function fpsDecimal(numerator: number, denominator: number): string {
  const scale = 1_000_000_000_000n;
  const scaled = BigInt(numerator) * scale / BigInt(denominator);
  const whole = scaled / scale;
  const remainder = scaled % scale;
  if (remainder === 0n) return String(whole);
  return `${whole}.${String(remainder).padStart(12, "0").replace(/0+$/u, "")}`;
}

function fpsRational(numerator: number, denominator: number): string {
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
}

type FrameRational = { readonly numerator: number; readonly denominator: number };
type FrameSamplingPiece = {
  readonly target: FrameSpan;
  readonly sourceAtStart: FrameRational;
  readonly rate: FrameRational;
  readonly wrap?: FrameSpan;
};

function sourcePosition(piece: FrameSamplingPiece, offset: number): {
  readonly position: FrameRational;
  readonly cycle: bigint;
} {
  const denominator = BigInt(piece.sourceAtStart.denominator) * BigInt(piece.rate.denominator);
  const raw = BigInt(piece.sourceAtStart.numerator) * BigInt(piece.rate.denominator)
    + BigInt(offset) * BigInt(piece.rate.numerator) * BigInt(piece.sourceAtStart.denominator);
  if (piece.wrap === undefined) {
    if (raw < 0n || raw > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("HTML renderer visual sampling exceeds safe arithmetic.");
    }
    return { position: { numerator: Number(raw), denominator: Number(denominator) }, cycle: 0n };
  }
  const start = BigInt(piece.wrap.startFrame) * denominator;
  const length = BigInt(piece.wrap.endFrameExclusive - piece.wrap.startFrame) * denominator;
  const delta = raw - start;
  const cycle = delta >= 0n ? delta / length : -((-delta + length - 1n) / length);
  const wrapped = ((delta % length) + length) % length;
  const numerator = start + wrapped;
  if (piece.rate.numerator < 0 && numerator === start) {
    const end = BigInt(piece.wrap.endFrameExclusive) * denominator;
    if (end > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("HTML renderer visual sampling exceeds safe arithmetic.");
    }
    return { position: { numerator: Number(end), denominator: Number(denominator) }, cycle: cycle - 1n };
  }
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("HTML renderer visual sampling exceeds safe arithmetic.");
  }
  return { position: { numerator: Number(numerator), denominator: Number(denominator) }, cycle };
}

function samplingRuns(piece: FrameSamplingPiece): Array<FrameSpan & {
  readonly sourceFrame: FrameRational;
}> {
  const length = piece.target.endFrameExclusive - piece.target.startFrame;
  const runs: Array<FrameSpan & { sourceFrame: FrameRational }> = [];
  // Keep a hold as the interval it is. HTMLMediaElement cannot accept a zero
  // playbackRate, but that browser limitation belongs to the render/preview
  // adapters; expanding the shared sampling description here would turn one
  // authored relation into O(target frames) DOM and Provider work.
  if (piece.rate.numerator === 0 || piece.wrap === undefined) {
    return [{
      startFrame: piece.target.startFrame,
      endFrameExclusive: piece.target.endFrameExclusive,
      sourceFrame: sourcePosition(piece, 0).position,
    }];
  }
  let runStart = 0;
  while (runStart < length) {
    const runSource = sourcePosition(piece, runStart);
    let left = runStart + 1;
    let right = length;
    while (left < right) {
      const middle = left + Math.floor((right - left) / 2);
      const cycle = sourcePosition(piece, middle).cycle;
      const crossed = piece.rate.numerator > 0 ? cycle > runSource.cycle : cycle < runSource.cycle;
      if (crossed) right = middle;
      else left = middle + 1;
    }
    runs.push({
      startFrame: piece.target.startFrame + runStart,
      endFrameExclusive: piece.target.startFrame + left,
      sourceFrame: runSource.position,
    });
    runStart = left;
  }
  return runs;
}

function safeFrameRational(value: { readonly numerator: bigint; readonly denominator: bigint }, label: string): FrameRational {
  let left = value.numerator < 0n ? -value.numerator : value.numerator;
  let right = value.denominator;
  while (right !== 0n) [left, right] = [right, left % right];
  const divisor = left === 0n ? 1n : left;
  const numerator = value.numerator / divisor;
  const denominator = value.denominator / divisor;
  if (numerator < BigInt(Number.MIN_SAFE_INTEGER) || numerator > BigInt(Number.MAX_SAFE_INTEGER)
    || denominator <= 0n || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds safe frame arithmetic.`);
  }
  return { numerator: Number(numerator), denominator: Number(denominator) };
}

function frameValue(value: ExactTemporalValue, frameRate: FrameRational, label: string): FrameRational {
  return safeFrameRational(temporalValueInFrames(value, { frameRate }), label);
}

function advanceFramePosition(
  position: FrameRational,
  from: FrameRational,
  to: number,
  rate: FrameRational,
  label: string,
): FrameRational {
  const deltaNumerator = BigInt(to) * BigInt(from.denominator) - BigInt(from.numerator);
  return safeFrameRational({
    numerator: BigInt(position.numerator) * BigInt(from.denominator) * BigInt(rate.denominator)
      + deltaNumerator * BigInt(rate.numerator) * BigInt(position.denominator),
    denominator: BigInt(position.denominator) * BigInt(from.denominator) * BigInt(rate.denominator),
  }, label);
}

/** Terminal HTML adapter: quantize one exact local Map only at the decoded-frame consumer. */
function frameSamplingPieces(
  map: TemporalMap,
  timing: { readonly frameRate: { readonly numerator: number; readonly denominator: number }; readonly frameCount: number },
  programFrameRate: FrameRational,
): FrameSamplingPiece[] {
  assertTemporalMap(map);
  if (map.stages.length !== 1) {
    throw new Error("HTML renderer requires one occurrence-to-source sampling stage.");
  }
  const stage = map.stages[0]!;
  return stage.pieces.flatMap((piece) => {
    const targetStart = frameValue(piece.target.start, programFrameRate, "Visual sampling target start");
    const startFrame = resolveTemporalBoundary(piece.target.start, { frameRate: programFrameRate }, "cover");
    const endFrameExclusive = resolveTemporalBoundary(piece.target.end, { frameRate: programFrameRate }, "cover");
    if (endFrameExclusive <= startFrame) return [];
    const rate = safeFrameRational({
      numerator: BigInt(piece.rate.numerator) * BigInt(timing.frameRate.numerator)
        * BigInt(programFrameRate.denominator),
      denominator: BigInt(piece.rate.denominator) * BigInt(timing.frameRate.denominator)
        * BigInt(programFrameRate.numerator),
    }, "Visual sampling rate");
    const sourceAtStart = advanceFramePosition(
      frameValue(piece.sourceAtStart, timing.frameRate, "Visual sampling source start"),
      targetStart,
      startFrame,
      rate,
      "Visual sampling source start after target quantization",
    );
    return [{
      target: { startFrame, endFrameExclusive },
      sourceAtStart,
      rate,
      ...(piece.wrap === undefined ? {} : { wrap: {
        startFrame: resolveTemporalBoundary(piece.wrap.start, { frameRate: timing.frameRate }, "cover"),
        endFrameExclusive: resolveTemporalBoundary(piece.wrap.end, { frameRate: timing.frameRate }, "cover"),
      } }),
    }];
  });
}

function percentage(frame: number, totalFrames: number): string {
  const scale = 1_000_000_000n;
  const scaled = BigInt(frame) * 100n * scale / BigInt(totalFrames);
  const whole = scaled / scale;
  const remainder = scaled % scale;
  if (remainder === 0n) return `${whole}%`;
  return `${whole}.${String(remainder).padStart(9, "0").replace(/0+$/u, "")}%`;
}

export function htmlProgramResourceUri(resource: ResourceId): string {
  if (!isResourceId(resource)) throw new Error("HTML renderer Resource id is invalid.");
  return `hypit-resource://${resource}`;
}

/** Keep compiler-owned media inert until the page has applied its render selection. */
function deferredResource(attribute: "src" | "href", resource: ResourceId): string {
  return `data-hypit-resource-${attribute}="${escapeHtml(htmlProgramResourceUri(resource))}"`;
}

function css(style: readonly VisualStyleDeclaration[]): string {
  return style.map(({ name, value }) => `${name}:${String(value)}`).join(";");
}

function pixelDimension(style: readonly VisualStyleDeclaration[], name: string): number | undefined {
  const value = style.find((declaration) => declaration.name === name)?.value;
  if (typeof value !== "string") return undefined;
  const match = /^(?:0|[1-9][0-9]*(?:\.[0-9]+)?)px$/u.exec(value);
  if (match === null) return undefined;
  const parsed = Number.parseFloat(value.slice(0, -2));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function attributes(values: readonly VisualAttribute[] | undefined): string {
  return (values ?? []).map(({ name, value }) => ` ${name}="${escapeHtml(value)}"`).join("");
}

type StableDomId = (parts: readonly string[]) => string;

/** Allocate short document-local names in first-use order; authored ids stay in data attributes. */
function createStableDomId(): StableDomId {
  const ids = new Map<string, string>();
  return (parts) => {
    const key = canonicalStringify(parts);
    const existing = ids.get(key);
    if (existing !== undefined) return existing;
    const id = `hypit-${ids.size + 1}`;
    ids.set(key, id);
    return id;
  };
}

function exactFontFamily(font: FontArtifactRef, stableId: StableDomId): string {
  return stableId(["font", canonicalStringify(font)]);
}

function exactFontStyle(element: VisualElement, stableId: StableDomId): string[] {
  if (element.kind !== "text") return [];
  const first = element.fonts[0]!;
  return [
    `font-family:${element.fonts.map((font) => exactFontFamily(font, stableId)).join(",")}`,
    `font-weight:${first.weight}`,
    `font-style:${first.style}`,
    "font-synthesis:none",
  ];
}

type ElementContext = {
  readonly occurrencePath: readonly string[];
  readonly presentId: string;
  readonly presentStart: string;
  readonly presentDuration: string;
  readonly presentDurationFrames: number;
  readonly presentStartFrame: number;
  readonly programNumerator: number;
  readonly programDenominator: number;
  readonly stackIndex: number;
  readonly emittedFilterIds: Set<string>;
  readonly sharedGlyphFilterDefinitions: string[];
  readonly stableId: StableDomId;
  readonly videoSources: HtmlVideoSource[];
};

/** Every emitted element, including SVG mask sources, keeps the same authored frame clock. */
function elementPresentation(element: VisualElement, context: ElementContext) {
  const id = context.stableId(["visual-occurrence", ...context.occurrencePath, context.presentId, element.id]);
  const animationName = element.animation === undefined
    ? undefined
    : context.stableId(["animation", ...context.occurrencePath, context.presentId, element.id]);
  const animationDurationFrames = element.animation === undefined
    ? context.presentDurationFrames
    : Math.max(context.presentDurationFrames, element.animation.keyframes.at(-1)?.atFrame ?? 0);
  const animationDuration = frameSeconds(animationDurationFrames, context.programNumerator, context.programDenominator);
  const inlineStyle = [
    css(element.style),
    ...exactFontStyle(element, context.stableId),
    ...(animationName === undefined ? [] : [
      `animation-name:${animationName}`,
      `animation-duration:${animationDuration}s`,
      "animation-fill-mode:both",
      // An independently launched render worker may begin at any frame. Keep
      // CSS animations inert from first paint so HTML renderer' exact seek is
      // the only clock; otherwise page-load time leaks into the first frame of
      // each partition before the runtime pauses the animation.
      "animation-play-state:paused",
      "animation-timing-function:linear",
    ]),
  ].filter(Boolean).join(";");
  const commonAttributes = `id="${id}" data-hypit-element-id="${escapeHtml(element.id)}"${attributes(element.attributes)}`;
  const animationAttributes = animationName === undefined
    ? ""
    : ` data-hypit-frame-animation data-hypit-animation-start-frame="${context.presentStartFrame}" data-hypit-animation-sample-frames="${context.presentDurationFrames}"`;
  const common = `${commonAttributes}${animationAttributes} style="${escapeHtml(inlineStyle)}"`;
  return { inlineStyle, commonAttributes: `${commonAttributes}${animationAttributes}`, common };
}

function renderElement(
  element: VisualElement,
  context: ElementContext,
): string {
  const { inlineStyle, commonAttributes, common } = elementPresentation(element, context);
  const id = context.stableId(["visual-occurrence", ...context.occurrencePath, context.presentId, element.id]);
  if (element.kind === "mask") {
    const maskRoot = element.mask;
    const contentRoot = element.content;
    const maskId = context.stableId(["visual-occurrence", ...context.occurrencePath, context.presentId, element.id, "mask"]);
    const maskWidth = pixelDimension(element.style, "width");
    const maskHeight = pixelDimension(element.style, "height");
    const viewport = maskWidth === undefined || maskHeight === undefined
      ? ""
      : ` viewBox="0 0 ${maskWidth} ${maskHeight}" preserveAspectRatio="none"`;
    const renderOwned = (child: VisualElement) => renderElement(child, context);
    const maskSource = (() => {
      const sourcePresentation = elementPresentation(maskRoot, context);
      if (maskRoot.kind === "text") {
        const alignment = maskRoot.style.find((declaration) => declaration.name === "text-align")?.value;
        const anchor = alignment === "right" || alignment === "end" ? "end" : alignment === "left" || alignment === "start" ? "start" : "middle";
        const blockAlignment = maskRoot.style.find((declaration) => declaration.name === "align-items")?.value;
        const paddingLeft = pixelDimension(maskRoot.style, "padding-left") ?? 0;
        const paddingRight = pixelDimension(maskRoot.style, "padding-right") ?? 0;
        const paddingTop = pixelDimension(maskRoot.style, "padding-top") ?? 0;
        const paddingBottom = pixelDimension(maskRoot.style, "padding-bottom") ?? 0;
        const x = maskWidth === undefined
          ? anchor === "start" ? "0" : anchor === "end" ? "100%" : "50%"
          : String(anchor === "start" ? paddingLeft : anchor === "end" ? maskWidth - paddingRight : (paddingLeft + maskWidth - paddingRight) / 2);
        const y = maskHeight === undefined
          ? blockAlignment === "flex-start" ? "0" : blockAlignment === "flex-end" ? "100%" : "50%"
          : String(blockAlignment === "flex-start" ? paddingTop : blockAlignment === "flex-end" ? maskHeight - paddingBottom : (paddingTop + maskHeight - paddingBottom) / 2);
        const baseline = blockAlignment === "flex-start" ? "text-before-edge" : blockAlignment === "flex-end" ? "text-after-edge" : "central";
        const textStyle = `${sourcePresentation.inlineStyle};fill:currentColor`;
        return `<text ${sourcePresentation.commonAttributes} x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="${baseline}" style="${escapeHtml(textStyle)}">${escapeHtml(maskRoot.text)}</text>`;
      }
      if (maskRoot.kind === "text-flow" || maskRoot.kind === "path-text") {
        return `<foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:100%;height:100%">${renderOwned(maskRoot)}</div></foreignObject>`;
      }
      if (maskRoot.kind === "image") {
        return `<image ${sourcePresentation.common} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" ${deferredResource("href", maskRoot.artifact.resource)}/>`;
      }
      if (maskRoot.kind === "surface" && maskRoot.surface.timing.kind === "still") {
        return `<image ${sourcePresentation.common} data-hypit-surface-resource="${maskRoot.surface.artifact.resource}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" ${deferredResource("href", maskRoot.surface.artifact.resource)}/>`;
      }
      throw new Error(`Local mask ${element.id} requires a terminal owned text, image or still Surface mask source.`);
    })();
    return `<svg ${common}${viewport} width="100%" height="100%" overflow="visible"><defs><mask id="${maskId}" x="0" y="0" width="100%" height="100%" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:${element.mode}">${maskSource}</mask></defs><foreignObject x="0" y="0" width="100%" height="100%" mask="url(#${maskId})"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:100%;height:100%">${renderOwned(contentRoot)}</div></foreignObject></svg>`;
  }
  if (element.kind === "program") {
    const program = readHtmlVisual(element.program);
    const slots = new Map(element.slots.map(slot => [slot.name, renderElement(slot.element, context)]));
    return `<div ${common}>${htmlVisualHtml(program, slots)}</div>`;
  }
  if (element.kind === "box") {
    const descendants = element.children.map((child) => renderElement(child, context)).join("");
    return `<div ${common}>${descendants}</div>`;
  }
  const textContext = {
    occurrencePath: context.occurrencePath,
    presentId: context.presentId,
    durationFrames: context.presentDurationFrames,
    durationSeconds: context.presentDuration,
    presentStartFrame: context.presentStartFrame,
    programNumerator: context.programNumerator,
    programDenominator: context.programDenominator,
    escape: escapeHtml,
    stableId: context.stableId,
    exactFontFamily: (font: FontArtifactRef) => exactFontFamily(font, context.stableId),
    baseStyle: inlineStyle,
    commonAttributes,
    emittedFilterIds: context.emittedFilterIds,
    sharedGlyphFilterDefinitions: context.sharedGlyphFilterDefinitions,
  };
  if (element.kind === "text") {
    const body = element.paints === undefined
      ? escapeHtml(element.text)
      : renderGlyphPaintedString(element.text, element.paints, textContext);
    return `<div ${common}>${body}</div>`;
  }
  if (element.kind === "text-flow" || element.kind === "path-text") {
    return renderTerminalTextElement(element, textContext);
  }
  if (element.kind === "video") {
    context.videoSources.push({
      kind: "media",
      id,
      startFrame: context.presentStartFrame,
      endFrameExclusive: context.presentStartFrame + context.presentDurationFrames,
      source: structuredClone(element.source),
      sampling: structuredClone(element.sampling),
    });
    const media = [
      `id="${id}"`,
      `data-hypit-element-id="${escapeHtml(element.id)}"`,
      "data-hypit-source-frame=\"media\"",
      `data-hypit-start-frame="${context.presentStartFrame}"`,
      `data-hypit-end-frame="${context.presentStartFrame + context.presentDurationFrames}"`,
      `style="${escapeHtml(inlineStyle)}"`,
      attributes(element.attributes).trim(),
      "muted",
      "playsinline",
    ].filter(Boolean).join(" ");
    return `<video ${media} ${deferredResource("src", element.source.source.resource)}></video>`;
  }
  if (element.kind === "surface" && element.sampling !== undefined) {
    const artifact = element.surface.artifact;
    const timing = element.surface.timing.kind === "frames"
        ? { frameRate: element.surface.timing.frameRate, frameCount: element.surface.timing.frameCount }
        : undefined;
    if (timing === undefined) throw new Error(`Visual element ${element.id} has sampling without frame timing.`);
    const pieces = frameSamplingPieces(element.sampling, timing, {
      numerator: context.programNumerator, denominator: context.programDenominator,
    });
    let part = 0;
    return pieces.flatMap((piece) => samplingRuns(piece).map((run) => {
      part += 1;
      const startFrame = context.presentStartFrame + run.startFrame;
      const durationFrames = run.endFrameExclusive - run.startFrame;
      const partId = `${id}-sample-${String(part).padStart(4, "0")}`;
      context.videoSources.push({
        kind: "surface",
        id: partId,
        resource: artifact.resource,
        startFrame,
        endFrameExclusive: startFrame + durationFrames,
        sourceFrame: { ...run.sourceFrame },
        sourceRate: { ...piece.rate },
        sourceFrameRate: { ...timing.frameRate },
      });
      const media = [
        `id="${partId}"`,
        `data-hypit-element-id="${escapeHtml(element.id)}"`,
        `data-hypit-sampling-part="${part}"`,
        `data-hypit-source-frame="${run.sourceFrame.numerator}/${run.sourceFrame.denominator}"`,
        `data-hypit-source-rate="${piece.rate.numerator}/${piece.rate.denominator}"`,
        `data-hypit-start-frame="${startFrame}"`,
        `data-hypit-end-frame="${startFrame + durationFrames}"`,
        `data-hypit-source-fps="${timing.frameRate.numerator}/${timing.frameRate.denominator}"`,
        `style="${escapeHtml(inlineStyle)}"`,
        attributes(element.attributes).trim(),
        "muted",
        "playsinline",
        ...[
          `data-hypit-surface-resource="${element.surface.artifact.resource}"`,
          `data-hypit-alpha-mode="${element.surface.alphaMode}"`,
          `data-hypit-color-space="${element.surface.colorSpace}"`,
          `width="${element.surface.width}"`,
          `height="${element.surface.height}"`,
        ],
      ].filter(Boolean).join(" ");
      return `<video ${media} ${deferredResource("src", artifact.resource)}></video>`;
    })).join("");
  }
  if (element.kind === "surface") {
    const surface = [
      `data-hypit-surface-resource="${element.surface.artifact.resource}"`,
      `data-hypit-alpha-mode="${element.surface.alphaMode}"`,
      `data-hypit-color-space="${element.surface.colorSpace}"`,
      `width="${element.surface.width}"`,
      `height="${element.surface.height}"`,
    ].join(" ");
    if (element.surface.timing.kind === "still") return `<img ${common} ${surface} ${deferredResource("src", element.surface.artifact.resource)}/>`;
    throw new Error(`Timed Surface ${element.id} has no sampling Map.`);
  }

  if (element.kind === "image") return `<img ${common} ${deferredResource("src", element.artifact.resource)}/>`;
  throw new Error("Timed visual element has no sampling Map.");
}

function renderVisualPresent(
  occurrencePath: readonly string[],
  present: VisualPresent,
  stackIndex: number,
  paintPath: readonly number[],
  numerator: number,
  denominator: number,
  emittedFilterIds: Set<string>,
  sharedGlyphFilterDefinitions: string[],
  stableId: StableDomId,
  videoSources: HtmlVideoSource[],
): string {
  const start = frameSeconds(present.span.startFrame, numerator, denominator);
  const duration = frameSeconds(present.span.endFrameExclusive - present.span.startFrame, numerator, denominator);
  const root = present.root;
  const contents = renderElement(root, {
    occurrencePath,
    presentId: present.id,
    presentStart: start,
    presentDuration: duration,
    presentDurationFrames: present.span.endFrameExclusive - present.span.startFrame,
    presentStartFrame: present.span.startFrame,
    programNumerator: numerator,
    programDenominator: denominator,
    stackIndex,
    emittedFilterIds,
    sharedGlyphFilterDefinitions,
    stableId,
    videoSources,
  });
  return `<div class="hypit-visual-present" data-hypit-occurrence-path="${escapeHtml(JSON.stringify(occurrencePath))}" data-hypit-present-id="${escapeHtml(present.id)}" data-hypit-present-root-element-id="${escapeHtml(root.id)}" data-hypit-paint-path="${escapeHtml(JSON.stringify(paintPath))}" data-hypit-present-start-frame="${present.span.startFrame}" data-hypit-present-end-frame="${present.span.endFrameExclusive}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none">${present.visibility === undefined ? contents : `<div data-hypit-visibility="${escapeHtml(JSON.stringify(present.visibility))}" style="position:absolute;inset:0">${contents}</div>`}</div>`;
}

type RenderedAdjustment = {
  readonly html: string;
  readonly runtime: FrameSpan & {
    readonly id: string;
    readonly occurrencePath: readonly string[];
    readonly adjustmentId: string;
    readonly visibility?: readonly FrameSpan[];
    readonly filter: string;
    readonly opacity?: number;
    readonly transform?: string;
    readonly transformOrigin?: string;
  };
};

function renderVisualAdjustment(
  occurrencePath: readonly string[],
  adjustment: VisualAdjustment,
  stackIndex: number,
  contents: string,
  stableId: StableDomId,
): RenderedAdjustment {
  const program = readHtmlAdjustment(adjustment.program);
  const id = stableId(["visual-adjustment", ...occurrencePath, adjustment.id]);
  return {
    html: `<div id="${id}" class="hypit-visual-adjustment" data-hypit-occurrence-path="${escapeHtml(JSON.stringify(occurrencePath))}" data-hypit-adjustment-id="${escapeHtml(adjustment.id)}" data-hypit-adjustment-start-frame="${adjustment.span.startFrame}" data-hypit-adjustment-end-frame="${adjustment.span.endFrameExclusive}" data-hypit-adjustment-filter="${escapeHtml(program.filter)}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none;filter:none">${contents}</div>`,
    runtime: {
      id,
      occurrencePath,
      adjustmentId: adjustment.id,
      startFrame: adjustment.span.startFrame,
      endFrameExclusive: adjustment.span.endFrameExclusive,
      ...(adjustment.visibility === undefined ? {} : { visibility: adjustment.visibility.map((span) => ({ ...span })) }),
      filter: program.filter,
      ...(program.opacity === undefined ? {} : { opacity: program.opacity }),
      ...(program.transform === undefined ? {} : { transform: program.transform }),
      ...(program.transformOrigin === undefined ? {} : { transformOrigin: program.transformOrigin }),
    },
  };
}

function renderAnimationRules(occurrencePath: readonly string[], present: VisualPresent, stableId: StableDomId): string[] {
  const presentDurationFrames = present.span.endFrameExclusive - present.span.startFrame;
  return visualElements(present.root).flatMap((element) => {
    if (element.animation === undefined) return [];
    const durationFrames = Math.max(presentDurationFrames, element.animation.keyframes.at(-1)?.atFrame ?? 0);
    const name = stableId(["animation", ...occurrencePath, present.id, element.id]);
    const keyframes: VisualAnimation["keyframes"] = element.animation.keyframes.at(-1)?.atFrame === durationFrames
      ? element.animation.keyframes
      : [...element.animation.keyframes, {
          atFrame: durationFrames,
          style: element.animation.keyframes.at(-1)!.style,
        }];
    const frames = keyframes.map((keyframe) => {
      const easing = keyframe.easing === undefined ? "" : `;animation-timing-function:${keyframe.easing}`;
      return `${percentage(keyframe.atFrame, durationFrames)}{${css(keyframe.style)}${easing}}`;
    }).join("");
    return [`@keyframes ${name}{${frames}}`];
  });
}

type OrderedVisualScopeEntry =
  | { readonly memberId: string; readonly item: VisualItem }
  | { readonly stack: Extract<VisualScope["members"][number], { readonly kind: "stack" }> };

/** Scope member order and each Track's item order are already the complete paint programme. */
function orderedVisualScopeEntries(scope: VisualScope): OrderedVisualScopeEntry[] {
  return scope.members.flatMap((member): OrderedVisualScopeEntry[] => member.kind === "track"
    ? member.track.items.map((item) => ({ memberId: member.id, item }))
    : [{ stack: member }]);
}

function mergeFrameSpans(spans: readonly FrameSpan[]): FrameSpan[] {
  const result: FrameSpan[] = [];
  for (const span of [...spans].sort((left, right) => left.startFrame - right.startFrame
    || left.endFrameExclusive - right.endFrameExclusive)) {
    const previous = result.at(-1);
    if (previous !== undefined && span.startFrame <= previous.endFrameExclusive) {
      result[result.length - 1] = {
        startFrame: previous.startFrame,
        endFrameExclusive: Math.max(previous.endFrameExclusive, span.endFrameExclusive),
      };
    } else result.push({ ...span });
  }
  return result;
}

function collectArtifacts(composition: Composition): HtmlArtifact[] {
  const artifacts = new Map<ResourceId, { artifact: BlobRef; always: boolean; spans: FrameSpan[] }>();
  const add = (artifact: Pick<BlobRef, "resource" | "size" | "mediaType">,
    usage: "always" | FrameSpan): void => {
    const next: BlobRef = {
      kind: "blob",
      resource: artifact.resource,
      size: artifact.size,
      mediaType: artifact.mediaType,
    };
    const existing = artifacts.get(artifact.resource);
    if (existing !== undefined && (existing.artifact.size !== next.size || existing.artifact.mediaType !== next.mediaType)) {
      throw new Error(`HTML renderer Artifact ${artifact.resource} has conflicting metadata.`);
    }
    const entry = existing ?? { artifact: next, always: false, spans: [] };
    if (usage === "always") entry.always = true;
    else if (!entry.always) entry.spans.push({ ...usage });
    artifacts.set(artifact.resource, entry);
  };
  for (const track of visualScopeTracks(composition.visual)) {
    for (const present of visualPresents(track)) {
      for (const element of visualElements(present.root)) {
        if (element.kind === "image") add(element.artifact, present.span);
        if (element.kind === "video") add(element.source.source, present.span);
        if (element.kind === "surface") add(element.surface.artifact, present.span);
        // HtmlVisual HTML, CSS and setup are intentionally opaque. Their
        // declared dependencies stay conservative even though the visual root
        // itself has a Present span.
        if (element.kind === "program") for (const artifact of element.program.artifacts) add(artifact, "always");
        if (element.kind === "text") {
          for (const font of element.fonts ?? []) {
            // @font-face declarations live at document scope. Keep them whole
            // rather than infer browser font demand from text structure.
            for (const source of font.sources) add(source.artifact, "always");
          }
        }
        if (element.kind === "text-flow" || element.kind === "path-text") {
          for (const font of collectTerminalTextFonts(element)) {
            for (const source of font.sources) add(source.artifact, "always");
          }
        }
      }
    }
  }
  return [...artifacts.values()].map(({ artifact, always, spans }) => ({
    artifact,
    usage: always ? { kind: "always" as const } : { kind: "frames" as const, spans: mergeFrameSpans(spans) },
  })).sort((left, right) => compareCodeUnits(left.artifact.resource, right.artifact.resource));
}

function collectSurfaces(composition: Composition): CompositableSurfaceRef[] {
  const surfaces = new Map<ResourceId, CompositableSurfaceRef>();
  for (const track of visualScopeTracks(composition.visual)) {
    for (const present of visualPresents(track)) {
      for (const element of visualElements(present.root)) {
        if (element.kind !== "surface") continue;
        const surface = structuredClone(element.surface);
        const existing = surfaces.get(surface.artifact.resource);
        if (existing !== undefined && canonicalStringify(existing) !== canonicalStringify(surface)) {
          throw new Error(`HTML renderer Surface ${surface.artifact.resource} has conflicting declarations.`);
        }
        surfaces.set(surface.artifact.resource, surface);
      }
    }
  }
  return [...surfaces.values()].sort((left, right) =>
    compareCodeUnits(left.artifact.resource, right.artifact.resource));
}

function collectFonts(composition: Composition): FontArtifactRef[] {
  const fonts = new Map<string, FontArtifactRef>();
  for (const track of visualScopeTracks(composition.visual)) {
    for (const present of visualPresents(track)) {
      for (const element of visualElements(present.root)) {
        if (element.kind !== "text") continue;
        for (const font of element.fonts ?? []) fonts.set(canonicalStringify(font), font);
      }
    }
  }
  for (const track of visualScopeTracks(composition.visual)) {
    for (const present of visualPresents(track)) {
      for (const element of visualElements(present.root)) {
        if (element.kind !== "text-flow" && element.kind !== "path-text") continue;
        for (const font of collectTerminalTextFonts(element)) fonts.set(canonicalStringify(font), font);
      }
    }
  }
  return [...fonts.entries()].sort(([left], [right]) => compareCodeUnits(left, right)).map(([, font]) => font);
}

function fontFormat(mediaType: string): string {
  if (mediaType === "font/woff2") return "woff2";
  if (mediaType === "font/woff") return "woff";
  if (mediaType === "font/otf") return "opentype";
  return "truetype";
}

function renderFontFaces(composition: Composition, stableId: StableDomId): string {
  return collectFonts(composition).flatMap((font) => font.sources.map((source) => [
      "@font-face{",
      `font-family:${exactFontFamily(font, stableId)};`,
      `src:url(\"${htmlProgramResourceUri(source.artifact.resource)}\") format(\"${fontFormat(source.artifact.mediaType)}\");`,
      `font-weight:${font.weight};`,
      `font-style:${font.style};`,
      "font-display:block;",
      ...(source.unicodeRange === undefined ? [] : [`unicode-range:${source.unicodeRange};`]),
      "}",
    ].join(""))).join("\n    ");
}

function hasTerminalText(composition: Composition): boolean {
  return visualScopeTracks(composition.visual).some((track) =>
    visualPresents(track).some((present) => visualElements(present.root).some((element) =>
      element.kind === "text-flow" || element.kind === "path-text")));
}

function hasFrameAnimations(composition: Composition): boolean {
  return visualScopeTracks(composition.visual).some((track) =>
    visualPresents(track).some((present) => visualElements(present.root).some((element) => element.animation !== undefined)));
}

function frameAnimationRuntime(numerator: number, denominator: number): string {
  return String.raw`
(() => {
  const numerator = ${numerator};
  const denominator = ${denominator};
  const millisecondsPerFrame = denominator * 1000 / numerator;
  const groupsBySpan = new Map();
  const read = (style, name) => name.startsWith("--") ? style.getPropertyValue(name) : style[name];
  const write = (style, name, value) => {
    if (name.startsWith("--")) style.setProperty(name, value);
    else style[name] = value;
  };
  const clear = (style, name) => {
    if (name.startsWith("--")) style.removeProperty(name);
    else style[name] = "";
  };
  for (const element of document.querySelectorAll("[data-hypit-frame-animation]")) {
    const start = Number(element.getAttribute("data-hypit-animation-start-frame"));
    const duration = Number(element.getAttribute("data-hypit-animation-sample-frames"));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(duration) || start < 0 || duration <= 0) {
      throw new Error("Visual IR frame animation has an invalid Present span.");
    }
    const end = start + duration;
    if (!Number.isSafeInteger(end)) throw new Error("Visual IR frame animation Present span exceeds safe arithmetic.");
    // CSS already keeps every authored animation paused. Only materialize the
    // browser Animation objects which this render can actually sample.
    if (!htmlSelectionOverlaps(start, end)) continue;
    void element.getBoundingClientRect();
    const animation = element.getAnimations()[0];
    if (animation === undefined) throw new Error("Visual IR frame animation did not materialize.");
    // The authored keyframes are already the compact state function. Keep them
    // instead of expanding every Present frame into a second table of
    // computed-style strings in every render Worker, but do not leave the CSS
    // animation live: HTML renderer' css and waapi adapters seek every live
    // document animation to absolute composition time, which replaces this
    // Present-relative pose whenever the Present does not start at frame 0.
    const keyframes = animation.effect.getKeyframes();
    const timing = animation.effect.getTiming();
    const properties = [...new Set(keyframes.flatMap((keyframe) => Object.keys(keyframe)))]
      .filter((name) => name !== "offset" && name !== "computedOffset" && name !== "easing" && name !== "composite");
    animation.cancel();
    element.style.animationName = "none";
    // Keyframes may omit properties and therefore interpolate against the
    // authored underlying value. Preserve that value before any requested
    // frame writes its sampled pose inline.
    const authored = {};
    for (const name of properties) authored[name] = read(element.style, name) ?? "";
    const key = start + ":" + end;
    let work = groupsBySpan.get(key);
    if (work === undefined) {
      work = {
        startFrame: start,
        endFrameExclusive: end,
        order: groupsBySpan.size,
        payload: { animations: [] },
      };
      groupsBySpan.set(key, work);
    }
    work.payload.animations.push({ element, keyframes, timing, properties, authored });
  }
  // The shared index owns only frame-span lookup. Animation materialization and
  // absolute currentTime evaluation remain private to this adapter.
  const workIndex = htmlCreateFrameWorkIndex([...groupsBySpan.values()]);
  const applyFrame = (programFrame) => {
    const active = [];
    for (const work of workIndex.at(programFrame)) {
      const localTime = (programFrame - work.startFrame) * millisecondsPerFrame;
      // Always derive the pose from the absolute requested frame. Worker
      // partitioning, seek order and the previously rendered frame are not
      // inputs to animation state.
      for (const item of work.payload.animations) active.push({ item, localTime });
    }
    // A previous seek's inline pose is not an input to this seek. Restore the
    // authored underlying value before transiently evaluating every animation.
    for (const { item } of active) {
      for (const name of item.properties) {
        const value = item.authored[name];
        if (value === "") clear(item.element.style, name);
        else write(item.element.style, name, value);
      }
    }
    // Evaluate each pose with a transient Animation, read it and cancel it before
    // this seek returns, so no adapter ever sees it. The Animation constructor,
    // unlike Element.animate, is not tracked by HTML renderer' waapi adapter. Only
    // the resulting inline style reaches the captured frame.
    const probes = active.map(({ item, localTime }) => {
      const probe = new Animation(new KeyframeEffect(item.element, item.keyframes, item.timing), document.timeline);
      // A running Animation advances with wall time after currentTime is set.
      // Pause first so the sampled pose is only a function of programFrame.
      probe.pause();
      probe.currentTime = localTime;
      return probe;
    });
    const poses = active.map(({ item }) => {
      const style = getComputedStyle(item.element);
      return item.properties.map((name) => read(style, name));
    });
    for (const probe of probes) probe.cancel();
    active.forEach(({ item }, index) => {
      item.properties.forEach((name, position) => write(item.element.style, name, poses[index][position]));
    });
    void document.documentElement.getBoundingClientRect();
  };
  void document.documentElement.getBoundingClientRect();
  window.addEventListener("hypit-frame", (event) => applyFrame(event.detail?.frame));
})();`;
}

function frameProgramRuntime(frameCount: number): string {
  return `(() => {
    let presents;
    let prepared;
    const initialize = spans => {
      htmlPrepareFrameSelection(spans);
      for (const initializer of htmlFrameProgramInitializers) initializer();
      htmlFrameProgramInitializers.length = 0;
      presents = [...document.querySelectorAll('[data-hypit-present-start-frame]')].map(element => ({
        element,
        startFrame: Number(element.getAttribute('data-hypit-present-start-frame')),
        endFrameExclusive: Number(element.getAttribute('data-hypit-present-end-frame')),
      }));
    };
    const applyFrame = async frame => {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame >= ${frameCount}) {
        throw new Error('HTML Program frame is outside its domain.');
      }
      if (!htmlFrameSelectionPrepared) initialize();
      for (const present of presents) {
        present.element.style.display = frame >= present.startFrame && frame < present.endFrameExclusive ? '' : 'none';
      }
      const pending = [];
      window.dispatchEvent(new CustomEvent('hypit-frame', { detail: {
        frame,
        waitUntil(value) { pending.push(Promise.resolve(value)); },
      }}));
      await Promise.all(pending);
      void document.documentElement.getBoundingClientRect();
    };
    Object.defineProperty(window, '__hypitFrameProgram', { configurable: false, writable: false, value: Object.freeze({
      frameCount: ${frameCount},
      prepare(spans) {
        if (prepared !== undefined) return prepared;
        prepared = (async () => {
          initialize(spans);
          await document.fonts.ready;
          await applyFrame(spans?.[0]?.startFrame ?? 0);
        })();
        return prepared;
      },
      applyFrame,
    }) });
  })();`;
}

function emitHtml(composition: Composition, timeline: Timeline, videoSources: HtmlVideoSource[]): string {
  const { numerator, denominator } = timeline.frameRate;
  const visualItems = visualScopeTrackOccurrences(composition.visual)
    .flatMap((occurrence) => occurrence.member.track.items.map((item) => ({
      occurrencePath: occurrence.path,
      item,
    })));
  const visuals = visualItems.flatMap(({ occurrencePath, item }) => item.kind === "present"
    ? [{ occurrencePath, present: item }]
    : []);
  // One document, one set of glyph filter definitions. Keep definitions outside
  // temporal Present roots so a render can make an unrelated Present inert
  // without invalidating a selected Present's document-wide url(#id) reference.
  const emittedFilterIds = new Set<string>();
  const sharedGlyphFilterDefinitions: string[] = [];
  const stableId = createStableDomId();
  const adjustments: RenderedAdjustment["runtime"][] = [];
  const renderScope = (
    scope: VisualScope,
    includeClear: boolean,
    scopePath: readonly string[],
    paintPath: readonly number[],
  ): string => {
    let html = includeClear
      ? `<div data-hypit-canvas-clear style="position:absolute;inset:0;z-index:0;background:${escapeHtml(composition.canvas.clearColor)};pointer-events:none"></div>`
      : "";
    const entries = orderedVisualScopeEntries(scope);
    for (const [index, entry] of entries.entries()) {
      const stackIndex = index + 1;
      if ("stack" in entry) {
        const childScopePath = [...scopePath, entry.stack.id];
        const childPaintPath = [...paintPath, stackIndex];
        const child = renderScope(entry.stack.scope, false, childScopePath, childPaintPath);
        const id = stableId(["visual-stack", ...childScopePath]);
        html += `\n    <div id="${id}" class="hypit-visual-stack" data-hypit-stack-id="${escapeHtml(entry.stack.id)}" data-hypit-stack-path="${escapeHtml(JSON.stringify(childScopePath))}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none;isolation:isolate">${child}</div>`;
        continue;
      }
      const { item } = entry;
      const occurrencePath = [...scopePath, entry.memberId];
      if (item.kind === "present") {
        html += `\n    ${renderVisualPresent(occurrencePath, item, stackIndex, [...paintPath, stackIndex],
          numerator, denominator, emittedFilterIds, sharedGlyphFilterDefinitions, stableId, videoSources)}`;
        continue;
      }
      const rendered = renderVisualAdjustment(occurrencePath, item, stackIndex, html, stableId);
      html = rendered.html;
      adjustments.push(rendered.runtime);
    }
    return html;
  };
  const visualHtml = renderScope(composition.visual, true, [], []);
  const sharedDefinitionsHtml = sharedGlyphFilterDefinitions.length === 0 ? ""
    : `<svg data-hypit-document-definitions aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden"><defs>${sharedGlyphFilterDefinitions.join("")}</defs></svg>`;
  const animationCss = visuals.flatMap(({ occurrencePath, present }) => renderAnimationRules(occurrencePath, present, stableId)).join("\n    ");
  const fontCss = renderFontFaces(composition, stableId);
  const programs = visuals.flatMap(({ occurrencePath, present }) => visualElements(present.root).flatMap(element => element.kind !== "program" ? [] : [{
    id: stableId(["visual-occurrence", ...occurrencePath, present.id, element.id]),
    startFrame: present.span.startFrame,
    durationFrames: present.span.endFrameExclusive - present.span.startFrame,
    program: readHtmlVisual(element.program),
  }]));
  const programCss = programs.map(entry => `@scope (#${entry.id}) { ${entry.program.css ?? ""} }`).join("\n");
  const hasVisibility = visuals.some(({ present }) => present.visibility !== undefined);
  const initializer = (runtime: string): string =>
    `<script>htmlRegisterFrameProgramInitializer(() => {\n${runtime}\n});</script>`;
  const programRuntime = programs.length === 0 ? "" : initializer(htmlVisualScript(programs, numerator, denominator));
  const visibilityRuntime = hasVisibility ? initializer(presentationVisibilityScript(numerator, denominator)) : "";
  const adjustmentRuntime = adjustments.length === 0 ? "" : initializer(htmlAdjustmentScript(adjustments));
  const frameCount = timelineFrameCount(timeline);
  const needsFrameWork = hasFrameAnimations(composition) || hasTerminalText(composition)
    || programs.length > 0 || hasVisibility || adjustments.length > 0;
  const frameRuntime = `\n  <script>\n    ${needsFrameWork ? frameWorkIndexRuntime : frameSelectionRuntime}\n  </script>
  <script>${presentationCaptureScopeRuntime}</script>${hasFrameAnimations(composition) || hasTerminalText(composition)
      ? `\n  ${initializer(`${hasFrameAnimations(composition) ? `\n    ${frameAnimationRuntime(numerator, denominator)}` : ""}${hasTerminalText(composition) ? `\n    ${terminalTextLayoutScript}` : ""}`)}`
      : ""}`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
    [data-hypit-program-root]{position:relative;overflow:hidden;background:transparent}
    *,*::before,*::after{box-sizing:border-box}
    ${fontCss}
    ${animationCss}
    ${programCss}
  </style>
</head>
<body>
  <div data-hypit-program-root data-hypit-program-id="${escapeHtml(composition.id)}" data-hypit-width="${composition.canvas.width}" data-hypit-height="${composition.canvas.height}" data-hypit-frame-numerator="${numerator}" data-hypit-frame-denominator="${denominator}" data-hypit-frame-count="${frameCount}" style="width:${composition.canvas.width}px;height:${composition.canvas.height}px">
    ${sharedDefinitionsHtml}${sharedDefinitionsHtml.length === 0 ? "" : "\n    "}${visualHtml}
  </div>${frameRuntime}${programRuntime}
  ${visibilityRuntime}${adjustmentRuntime}
  <script>${frameProgramRuntime(frameCount)}</script>
</body>
</html>
`;
}

function normalizedDocument(value: HtmlProgram): HtmlProgram {
  return {
    visualIr: value.visualIr,
    frameRate: { ...value.frameRate },
    frameCount: value.frameCount,
    canvas: { ...value.canvas },
    artifacts: [...value.artifacts]
      .map((entry) => ({ artifact: { ...entry.artifact }, usage: entry.usage.kind === "always"
        ? { kind: "always" as const }
        : { kind: "frames" as const, spans: entry.usage.spans.map((span) => ({ ...span })) } }))
      .sort((left, right) => compareCodeUnits(left.artifact.resource, right.artifact.resource)),
    surfaces: [...value.surfaces]
      .map((surface) => structuredClone(surface))
      .sort((left, right) => compareCodeUnits(left.artifact.resource, right.artifact.resource)),
    videoSources: [...value.videoSources].map((source) => source.kind === "media" ? ({
      ...source,
      source: structuredClone(source.source),
      sampling: structuredClone(source.sampling),
    }) : ({
      ...source,
      sourceFrame: { ...source.sourceFrame }, sourceRate: { ...source.sourceRate },
      sourceFrameRate: { ...source.sourceFrameRate },
    })).sort((left, right) => left.startFrame - right.startFrame || compareCodeUnits(left.id, right.id)),
    html: value.html,
  };
}

export function compileHtmlProgram(composition: Composition, timeline: Timeline): HtmlProgram {
  assertCompositionIdentity(composition, timeline);
  const videoSources: HtmlVideoSource[] = [];
  const content = normalizedDocument({
    visualIr: VISUAL_IR_V1,
    frameRate: { ...timeline.frameRate },
    frameCount: timelineFrameCount(timeline),
    canvas: {
      width: composition.canvas.width,
      height: composition.canvas.height,
    },
    artifacts: collectArtifacts(composition),
    surfaces: collectSurfaces(composition),
    videoSources,
    html: emitHtml(composition, timeline, videoSources),
  });
  return content;
}

export function assertHtmlProgram(document: HtmlProgram): void {
  if (document.visualIr !== VISUAL_IR_V1) throw new Error("Unsupported HtmlProgram visual IR.");
  if (
    !Number.isSafeInteger(document.frameRate.numerator)
    || document.frameRate.numerator <= 0
    || !Number.isSafeInteger(document.frameRate.denominator)
    || document.frameRate.denominator <= 0
    || !Number.isSafeInteger(document.frameCount)
    || document.frameCount <= 0
    || !Number.isSafeInteger(document.canvas.width)
    || document.canvas.width <= 0
    || !Number.isSafeInteger(document.canvas.height)
    || document.canvas.height <= 0
  ) {
    throw new Error("HtmlProgram frame domain or canvas is invalid.");
  }
  if (!document.html.startsWith("<!doctype html>")) throw new Error("HtmlProgram HTML is invalid.");
  const declared = [...document.artifacts];
  if (declared.some((entry) => {
    const item = entry?.artifact;
    if (!isBlobRef(item)) return true;
    if (entry.usage?.kind === "always") return Object.keys(entry.usage).length !== 1;
    if (entry.usage?.kind !== "frames" || !Array.isArray(entry.usage.spans) || entry.usage.spans.length === 0) return true;
    if (entry.usage.spans.some((span) => span === null || typeof span !== "object"
      || !Number.isSafeInteger(span.startFrame) || !Number.isSafeInteger(span.endFrameExclusive)
      || span.startFrame < 0 || span.endFrameExclusive <= span.startFrame
      || span.endFrameExclusive > document.frameCount)) return true;
    return JSON.stringify(mergeFrameSpans(entry.usage.spans)) !== JSON.stringify(entry.usage.spans);
  }) || new Set(declared.map((entry) => entry.artifact.resource)).size !== declared.length) {
    throw new Error("HtmlProgram Artifact set is invalid.");
  }
  const referenced = [...document.html.matchAll(RESOURCE_URI)].map((match) => match[1] as ResourceId);
  const actual = [...new Set(referenced)].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared.map((entry) => entry.artifact.resource).sort())) {
    throw new Error("HtmlProgram Artifact placeholders do not match its declared dependencies.");
  }
  if (!Array.isArray(document.surfaces)) throw new Error("HtmlProgram Surface set is invalid.");
  if (!Array.isArray(document.videoSources) || document.videoSources.some((source) =>
    typeof source?.id !== "string" || source.id.length === 0
    || !Number.isSafeInteger(source.startFrame) || !Number.isSafeInteger(source.endFrameExclusive)
    || source.startFrame < 0 || source.endFrameExclusive <= source.startFrame
    || source.endFrameExclusive > document.frameCount
    || (source.kind === "media" ? (() => {
      try {
        verifyPreparedVisualSource(source.source);
        assertTemporalMap(source.sampling);
        return !declared.some((entry) => entry.artifact.resource === source.source.source.resource)
          || source.sampling.stages.at(-1)?.source.id !== source.source.sourceDomain.id;
      } catch { return true; }
    })() : source.kind !== "surface" || !isResourceId(source.resource)
      || !Number.isSafeInteger(source.sourceFrame?.numerator) || source.sourceFrame.numerator < 0
      || !Number.isSafeInteger(source.sourceFrame?.denominator) || source.sourceFrame.denominator <= 0
      || !Number.isSafeInteger(source.sourceRate?.numerator)
      || !Number.isSafeInteger(source.sourceRate?.denominator) || source.sourceRate.denominator <= 0
      || !Number.isSafeInteger(source.sourceFrameRate?.numerator) || source.sourceFrameRate.numerator <= 0
      || !Number.isSafeInteger(source.sourceFrameRate?.denominator) || source.sourceFrameRate.denominator <= 0
      || !declared.some((entry) => entry.artifact.resource === source.resource)))) {
    throw new Error("HtmlProgram video-source plan is invalid.");
  }
  if (new Set(document.videoSources.map((source) => source.id)).size !== document.videoSources.length) {
    throw new Error("HtmlProgram video-source identities must be unique.");
  }
  const surfaceArtifacts = new Set<string>();
  for (const [index, surface] of document.surfaces.entries()) {
    assertCompositableSurfaceRef(surface, `HtmlProgram.surfaces.${index}`);
    if (surfaceArtifacts.has(surface.artifact.resource)) {
      throw new Error("HtmlProgram Surface set repeats an Artifact.");
    }
    surfaceArtifacts.add(surface.artifact.resource);
    const artifact = declared.find((entry) => entry.artifact.resource === surface.artifact.resource)?.artifact;
    if (artifact === undefined
      || artifact.size !== surface.artifact.size
      || artifact.mediaType !== surface.artifact.mediaType) {
      throw new Error("HtmlProgram Surface is not bound to its declared Artifact.");
    }
  }
  const referencedSurfaces = [...new Set(
    [...document.html.matchAll(SURFACE_RESOURCE)].map((match) => match[1]!),
  )].sort();
  if (JSON.stringify(referencedSurfaces) !== JSON.stringify([...surfaceArtifacts].sort())) {
    throw new Error("HtmlProgram Surface markers do not match its typed dependencies.");
  }
}

/** Validate one independently renderable frame index without parsing generated HTML. */
export function assertHtmlFrameIndex(document: HtmlProgram, frame: number): void {
  assertHtmlProgram(document);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= document.frameCount) {
    throw new Error(`HTML renderer frame ${frame} is outside [0, ${document.frameCount}).`);
  }
}

/** Validate a Provider-owned half-open chunk of the document's exact frame domain. */
export function assertHtmlFrameSpan(
  document: HtmlProgram,
  span: FrameSpan,
): void {
  assertHtmlProgram(document);
  try {
    assertFrameSpan(span, document.frameCount);
  } catch {
    throw new Error(
      `HTML renderer frame span [${span.startFrame}, ${span.endFrameExclusive}) is outside [0, ${document.frameCount}).`,
    );
  }
}

function assertHTMLFrameSelection(
  document: HtmlProgram,
  selection: readonly FrameSpan[],
): void {
  if (selection.length === 0) throw new Error("HTML renderer Artifact selection must not be empty");
  let previousEnd = 0;
  for (const [index, span] of selection.entries()) {
    try {
      assertFrameSpan(span, document.frameCount);
    } catch {
      throw new Error("HTML renderer Artifact selection must contain ordered, disjoint spans inside the document frame domain");
    }
    if (index > 0 && span.startFrame < previousEnd) {
      throw new Error("HTML renderer Artifact selection must contain ordered, disjoint spans inside the document frame domain");
    }
    previousEnd = span.endFrameExclusive;
  }
}

function artifactUsageOverlaps(
  usage: readonly FrameSpan[],
  selection: readonly FrameSpan[],
): boolean {
  return usage.some((span) => {
    let low = 0;
    let high = selection.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (selection[middle]!.endFrameExclusive <= span.startFrame) low = middle + 1;
      else high = middle;
    }
    return low < selection.length && selection[low]!.startFrame < span.endFrameExclusive;
  });
}

/**
 * Project one whole render selection onto the compiler's conservative byte dependencies.
 * The result is shared by every worker; no worker or traversal state enters the proof.
 */
export function selectHtmlArtifacts(
  document: HtmlProgram,
  frameSelection?: readonly FrameSpan[],
): readonly HtmlArtifact[] {
  assertHtmlProgram(document);
  if (frameSelection === undefined) return document.artifacts;
  assertHTMLFrameSelection(document, frameSelection);
  return document.artifacts.filter((entry) => entry.usage.kind === "always"
    || artifactUsageOverlaps(entry.usage.spans, frameSelection));
}

/** Runtime-only URL materialization. The returned HTML is intentionally not a new compiled Record. */
export function materializeHtmlProgram(
  document: HtmlProgram,
  resolve: ResourceUrlResolver,
): string {
  assertHtmlProgram(document);
  const artifacts = new Map(document.artifacts.map((entry) => [entry.artifact.resource, entry.artifact]));
  return document.html.replace(RESOURCE_URI, (_uri, resource: ResourceId) => {
    const artifact = artifacts.get(resource);
    if (artifact === undefined) throw new Error(`HTML renderer Resource ${resource} is undeclared.`);
    return escapeHtml(resolve(artifact));
  });
}

export const htmlProgramTime = { frameSeconds, fpsDecimal, fpsRational } as const;
