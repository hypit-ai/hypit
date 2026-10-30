import { assertCompositableSurfaceRef, verifyPictureInterpretation, verifyPreparedVisualSource } from "@hypit/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";
import { assertFrameSpan, timelineFrameCount } from "@hypit/timeline";
import type { FrameSpan, Timeline } from "@hypit/timeline";
import {
  assertVisualCompositionIdentity,
  visualElements,
  visualPresents,
  visualScopeProcesses,
  visualScopeTrackOccurrences,
  visualScopeTracks,
} from "@hypit/composition";
import type {
  Composition,
  VisualAdjustment,
  VisualContribution,
  VisualElement,
  VisualItem,
  VisualPresent,
  VisualProcess,
  VisualScope,
} from "@hypit/composition";
import { visualProcesses } from "@hypit/composition";
import { assertTemporalMap, compareExactTemporalValues, exactTemporalValueFromFrames, isAffineTemporalMapPiece, resolveTemporalBoundary, temporalValueInFrames } from "@hypit/temporal";
import type { ExactTemporalValue, TemporalMap } from "@hypit/temporal";
import { assertBlobRef, canonicalStringify, compareCodeUnits } from "@hypit/hypit/protocol";
import type { BlobRef, ResourceId } from "@hypit/hypit/protocol";
import { readHtmlVisual, htmlVisualHtml, htmlVisualScript } from "./html-visual.js";
import { htmlAdjustmentScript, readHtmlAdjustment } from "./html-adjustment.js";
import { presentationCaptureScopeRuntime } from "./capture-scope.js";
import { presentationVisibilityScript } from "./visibility.js";
import { frameSelectionRuntime, frameWorkIndexRuntime } from "./frame-work.js";

type HtmlComposition = Pick<Composition, "id" | "timeline" | "visual">;

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
  HtmlArtifactUsage,
  HtmlProgram,
  HtmlProcessUsage,
  HtmlVideoSource,
} from "./types.js";
import {
  collectTerminalTextFonts,
  renderGlyphPaintedString,
  renderTerminalTextElement,
  terminalTextLayoutScript,
} from "./text.js";

const NANOSECONDS = 1_000_000_000n;
const ARTIFACT_URI = /hypit-artifact:\/\/([A-Za-z][A-Za-z0-9._:-]*)/gu;
const SURFACE_ARTIFACT = /data-hypit-surface-artifact="([A-Za-z][A-Za-z0-9._:-]*)"/gu;
const PROGRAM_RESOURCE_ID = /^[A-Za-z][A-Za-z0-9._:-]*$/u;

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
    if (!isAffineTemporalMapPiece(piece)) {
      throw new Error("HTML timed Surface adapter does not support cubic temporal sampling.");
    }
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

export function htmlArtifactUri(id: string): string {
  if (!PROGRAM_RESOURCE_ID.test(id)) throw new Error("HTML Programme Artifact id is invalid.");
  return `hypit-artifact://${id}`;
}

/** Keep compiler-owned media inert until the page has applied its render selection. */
function deferredArtifact(attribute: "src" | "href", id: string): string {
  return `data-hypit-artifact-${attribute}="${escapeHtml(htmlArtifactUri(id))}"`;
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
  readonly presentUsage: readonly FrameSpan[];
  readonly programNumerator: number;
  readonly programDenominator: number;
  readonly stackIndex: number;
  readonly emittedFilterIds: Set<string>;
  readonly sharedGlyphFilterDefinitions: string[];
  readonly stableId: StableDomId;
  readonly videoSources: HtmlVideoSource[];
  readonly processUsages: HtmlProcessUsage[];
};

function preparedVisualDisplayExtent(source: Extract<VisualElement, { readonly kind: "video" }>["source"]): {
  readonly width: number;
  readonly height: number;
} {
  const interpretation = source.interpretation;
  let width = interpretation.codedWidth * interpretation.sampleAspectRatio.numerator
    / interpretation.sampleAspectRatio.denominator;
  let height = interpretation.codedHeight;
  if (interpretation.rotationDegrees === 90 || interpretation.rotationDegrees === 270) [width, height] = [height, width];
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("HTML renderer video display extent is invalid.");
  }
  return { width, height };
}

/**
 * Keep authored layout and selectors on one stable box. Decoders replace only
 * the private payload inside the slot, so decoded pixels cannot add a sibling
 * to the authored flex/grid/selector tree.
 */
function mediaDisplayPlane(input: {
  readonly id: string;
  readonly logicalElementId: string;
  readonly inlineStyle: string;
  readonly width: number;
  readonly height: number;
  readonly sourceAttributes: readonly string[];
  readonly deferredSource: string;
}): string {
  const planeStyle = [
    input.inlineStyle,
    `--hypit-media-intrinsic-width:${input.width}px`,
    `--hypit-media-intrinsic-height:${input.height}px`,
  ].filter(Boolean).join(";");
  const payloadStyle = "position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none";
  return `<span id="${input.id}" data-hypit-element-id="${escapeHtml(input.logicalElementId)}" data-hypit-media-display-plane style="${escapeHtml(planeStyle)}"><span data-hypit-media-payload-host style="position:relative;display:block;width:100%;height:100%;object-fit:inherit;object-position:inherit"><video ${input.sourceAttributes.join(" ")} style="${payloadStyle}" muted playsinline ${input.deferredSource}></video><span data-hypit-decoded-media-slot style="position:absolute;inset:0;overflow:hidden;object-fit:inherit;object-position:inherit;pointer-events:none"></span></span></span>`;
}

/** Every emitted element, including SVG mask sources, keeps the same authored frame clock. */
function elementPresentation(element: VisualElement, context: ElementContext) {
  const id = context.stableId(["visual-occurrence", ...context.occurrencePath, context.presentId, element.id]);
  const inlineStyle = [
    ...exactFontStyle(element, context.stableId),
  ].filter(Boolean).join(";");
  const commonAttributes = `id="${id}" data-hypit-element-id="${escapeHtml(element.id)}"`;
  const common = `${commonAttributes} style="${escapeHtml(inlineStyle)}"`;
  return { inlineStyle, commonAttributes, common };
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
    const viewport = "";
    const renderOwned = (child: VisualElement) => renderElement(child, context);
    const maskSource = (() => {
      const sourcePresentation = elementPresentation(maskRoot, context);
      if (maskRoot.kind === "text") {
        const anchor = "middle";
        const x = "50%";
        const y = "50%";
        const baseline = "central";
        const textStyle = `${sourcePresentation.inlineStyle};fill:currentColor`;
        return `<text ${sourcePresentation.commonAttributes} x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="${baseline}" style="${escapeHtml(textStyle)}">${escapeHtml(maskRoot.text)}</text>`;
      }
      if (maskRoot.kind === "text-flow" || maskRoot.kind === "path-text" || maskRoot.kind === "program") {
        return `<foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:100%;height:100%">${renderOwned(maskRoot)}</div></foreignObject>`;
      }
      if (maskRoot.kind === "image") {
        return `<image ${sourcePresentation.common} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" ${deferredArtifact("href", maskRoot.artifact.resource)}/>`;
      }
      if (maskRoot.kind === "surface" && maskRoot.surface.timing.kind === "still") {
        return `<image ${sourcePresentation.common} data-hypit-surface-artifact="${maskRoot.surface.artifact.resource}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" ${deferredArtifact("href", maskRoot.surface.artifact.resource)}/>`;
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
    const extent = preparedVisualDisplayExtent(element.source);
    context.videoSources.push({
      kind: "media",
      id,
      elementId: id,
      startFrame: context.presentStartFrame,
      endFrameExclusive: context.presentStartFrame + context.presentDurationFrames,
      usage: frameUsage(context.presentUsage),
      source: structuredClone(element.source),
      sampling: structuredClone(element.sampling),
    });
    const sourceAttributes = [
      "data-hypit-source-frame=\"media\"",
      `data-hypit-start-frame="${context.presentStartFrame}"`,
      `data-hypit-end-frame="${context.presentStartFrame + context.presentDurationFrames}"`,
    ];
    return mediaDisplayPlane({
      id,
      logicalElementId: element.id,
      inlineStyle,
      width: extent.width,
      height: extent.height,
      sourceAttributes,
      deferredSource: deferredArtifact("src", element.source.source.resource),
    });
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
    for (const piece of pieces) for (const run of samplingRuns(piece)) {
      part += 1;
      const startFrame = context.presentStartFrame + run.startFrame;
      const durationFrames = run.endFrameExclusive - run.startFrame;
      const partId = `${id}-sample-${String(part).padStart(4, "0")}`;
      context.videoSources.push({
        kind: "surface",
        id: partId,
        elementId: id,
        artifactId: artifact.resource,
        picture: structuredClone(element.surface.picture),
        startFrame,
        endFrameExclusive: startFrame + durationFrames,
        usage: frameUsage(intersectFrameSpans([{
          startFrame,
          endFrameExclusive: startFrame + durationFrames,
        }], context.presentUsage)),
        sourceFrame: { ...run.sourceFrame },
        sourceRate: { ...piece.rate },
        sourceFrameRate: { ...timing.frameRate },
      });
    }
    return mediaDisplayPlane({
      id,
      logicalElementId: element.id,
      inlineStyle,
      width: element.surface.width,
      height: element.surface.height,
      sourceAttributes: [
        "data-hypit-source-frame=\"surface\"",
        `data-hypit-surface-artifact="${element.surface.artifact.resource}"`,
        `data-hypit-alpha-mode="${element.surface.picture.alphaMode}"`,
        `data-hypit-color-primaries="${element.surface.picture.colorPrimaries}"`,
        `data-hypit-color-transfer="${element.surface.picture.colorTransfer}"`,
        `data-hypit-color-matrix="${element.surface.picture.colorMatrix}"`,
        `data-hypit-color-range="${element.surface.picture.colorRange}"`,
        `data-hypit-bit-depth="${element.surface.picture.bitDepth}"`,
      ],
      deferredSource: deferredArtifact("src", artifact.resource),
    });
  }
  if (element.kind === "surface") {
    const surface = [
      `data-hypit-surface-artifact="${element.surface.artifact.resource}"`,
      `data-hypit-alpha-mode="${element.surface.picture.alphaMode}"`,
      `data-hypit-color-primaries="${element.surface.picture.colorPrimaries}"`,
      `data-hypit-color-transfer="${element.surface.picture.colorTransfer}"`,
      `data-hypit-color-matrix="${element.surface.picture.colorMatrix}"`,
      `data-hypit-color-range="${element.surface.picture.colorRange}"`,
      `data-hypit-bit-depth="${element.surface.picture.bitDepth}"`,
      `width="${element.surface.width}"`,
      `height="${element.surface.height}"`,
    ].join(" ");
    if (element.surface.timing.kind === "still") return `<img ${common} ${surface} ${deferredArtifact("src", element.surface.artifact.resource)}/>`;
    throw new Error(`Timed Surface ${element.id} has no sampling Map.`);
  }

  if (element.kind === "image") return `<img ${common} ${deferredArtifact("src", element.artifact.resource)}/>`;
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
  processUsages: HtmlProcessUsage[],
  captureRoot: boolean,
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
    presentUsage: present.visibility ?? [present.span],
    programNumerator: numerator,
    programDenominator: denominator,
    stackIndex,
    emittedFilterIds,
    sharedGlyphFilterDefinitions,
    stableId,
    videoSources,
    processUsages,
  });
  return `<div class="hypit-visual-present"${captureRoot ? " data-hypit-capture-root" : ""} data-hypit-occurrence-path="${escapeHtml(JSON.stringify(occurrencePath))}" data-hypit-present-id="${escapeHtml(present.id)}" data-hypit-present-root-element-id="${escapeHtml(root.id)}" data-hypit-paint-path="${escapeHtml(JSON.stringify(paintPath))}" data-hypit-contribution-start-frame="${present.span.startFrame}" data-hypit-contribution-end-frame="${present.span.endFrameExclusive}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none">${present.visibility === undefined ? contents : `<div data-hypit-visibility="${escapeHtml(JSON.stringify(present.visibility))}" style="position:absolute;inset:0">${contents}</div>`}</div>`;
}

function contributionInputPath(
  occurrencePath: readonly string[],
  process: VisualProcess,
  name: string,
): readonly string[] {
  return [...occurrencePath, `process:${process.id}`, `input:${name}`];
}

function renderVisualProcess(
  occurrencePath: readonly string[],
  process: VisualProcess,
  stackIndex: number,
  paintPath: readonly number[],
  numerator: number,
  denominator: number,
  emittedFilterIds: Set<string>,
  sharedGlyphFilterDefinitions: string[],
  stableId: StableDomId,
  videoSources: HtmlVideoSource[],
  processUsages: HtmlProcessUsage[],
  captureRoot: boolean,
): string {
  const id = stableId(["visual-process", ...occurrencePath, process.id]);
  const program = readHtmlVisual(process.effect.program);
  const slots = new Map(process.inputs.map((input, index) => [input.name, renderVisualContribution(
    contributionInputPath(occurrencePath, process, input.name),
    input.contribution,
    index + 1,
    [...paintPath, index + 1],
    numerator,
    denominator,
    emittedFilterIds,
    sharedGlyphFilterDefinitions,
    stableId,
    videoSources,
    processUsages,
    false,
  )]));
  const contents = htmlVisualHtml(program, slots);
  const visible = process.visibility === undefined
    ? contents
    : `<div data-hypit-visibility="${escapeHtml(JSON.stringify(process.visibility))}" style="position:absolute;inset:0">${contents}</div>`;
  return `<div id="${id}" class="hypit-visual-process"${captureRoot ? " data-hypit-capture-root" : ""} data-hypit-occurrence-path="${escapeHtml(JSON.stringify(occurrencePath))}" data-hypit-process-id="${escapeHtml(process.id)}" data-hypit-paint-path="${escapeHtml(JSON.stringify(paintPath))}" data-hypit-contribution-start-frame="${process.span.startFrame}" data-hypit-contribution-end-frame="${process.span.endFrameExclusive}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none">${visible}</div>`;
}

function renderVisualContribution(
  occurrencePath: readonly string[],
  contribution: VisualContribution,
  stackIndex: number,
  paintPath: readonly number[],
  numerator: number,
  denominator: number,
  emittedFilterIds: Set<string>,
  sharedGlyphFilterDefinitions: string[],
  stableId: StableDomId,
  videoSources: HtmlVideoSource[],
  processUsages: HtmlProcessUsage[],
  captureRoot: boolean,
): string {
  return contribution.kind === "present"
    ? renderVisualPresent(occurrencePath, contribution, stackIndex, paintPath, numerator, denominator,
        emittedFilterIds, sharedGlyphFilterDefinitions, stableId, videoSources, processUsages, captureRoot)
    : renderVisualProcess(occurrencePath, contribution, stackIndex, paintPath, numerator, denominator,
        emittedFilterIds, sharedGlyphFilterDefinitions, stableId, videoSources, processUsages, captureRoot);
}

type RenderedAdjustment = {
  readonly html: string;
  readonly runtime: FrameSpan & {
    readonly id: string;
    readonly occurrencePath: readonly string[];
    readonly adjustmentId: string;
    readonly visibility?: readonly FrameSpan[];
    readonly keyframes: ReturnType<typeof readHtmlAdjustment>["keyframes"];
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
    html: `<div id="${id}" class="hypit-visual-adjustment" data-hypit-occurrence-path="${escapeHtml(JSON.stringify(occurrencePath))}" data-hypit-adjustment-id="${escapeHtml(adjustment.id)}" data-hypit-adjustment-start-frame="${adjustment.span.startFrame}" data-hypit-adjustment-end-frame="${adjustment.span.endFrameExclusive}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none;filter:none">${contents}</div>`,
    runtime: {
      id,
      occurrencePath,
      adjustmentId: adjustment.id,
      startFrame: adjustment.span.startFrame,
      endFrameExclusive: adjustment.span.endFrameExclusive,
      ...(adjustment.visibility === undefined ? {} : { visibility: adjustment.visibility.map((span) => ({ ...span })) }),
      keyframes: program.keyframes,
    },
  };
}

type OrderedVisualScopeEntry =
  | { readonly memberId: string; readonly item: VisualItem }
  | { readonly stack: Extract<VisualScope["members"][number], { readonly kind: "stack" }> }
  | { readonly process: Extract<VisualScope["members"][number], { readonly kind: "process" }> };

/** Scope member order and each Track's item order are already the complete paint programme. */
function orderedVisualScopeEntries(scope: VisualScope): OrderedVisualScopeEntry[] {
  return scope.members.flatMap((member): OrderedVisualScopeEntry[] => {
    if (member.kind === "track") return member.track.items.map((item) => ({ memberId: member.id, item }));
    if (member.kind === "stack") return [{ stack: member }];
    return [{ process: member }];
  });
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

function frameUsage(spans: readonly FrameSpan[]): HtmlArtifactUsage {
  const merged = mergeFrameSpans(spans);
  return merged.length === 0 ? { kind: "never" } : { kind: "frames", spans: merged };
}

function intersectFrameSpans(left: readonly FrameSpan[], right: readonly FrameSpan[]): FrameSpan[] {
  return mergeFrameSpans(left.flatMap((a) => right.map((b) => ({
    startFrame: Math.max(a.startFrame, b.startFrame),
    endFrameExclusive: Math.min(a.endFrameExclusive, b.endFrameExclusive),
  })).filter((span) => span.startFrame < span.endFrameExclusive)));
}

function collectArtifacts(composition: HtmlComposition): HtmlArtifact[] {
  const artifacts = new Map<ResourceId, { artifact: BlobRef; picture?: import("@hypit/media").PictureInterpretation; always: boolean; spans: FrameSpan[] }>();
  const add = (artifact: Pick<BlobRef, "resource" | "size" | "mediaType">,
    usage: "always" | "never" | FrameSpan, picture?: import("@hypit/media").PictureInterpretation): void => {
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
    if (existing?.picture !== undefined && picture !== undefined
      && canonicalStringify(existing.picture) !== canonicalStringify(picture)) {
      throw new Error(`HTML renderer picture ${artifact.resource} has conflicting interpretations.`);
    }
    const entry = existing ?? { artifact: next, always: false, spans: [], ...(picture === undefined ? {} : { picture }) };
    if (entry.picture === undefined && picture !== undefined) entry.picture = structuredClone(picture);
    if (usage === "always") entry.always = true;
    else if (usage !== "never" && !entry.always) entry.spans.push({ ...usage });
    artifacts.set(artifact.resource, entry);
  };
  const addForUsage = (artifact: Pick<BlobRef, "resource" | "size" | "mediaType">,
    usage: readonly FrameSpan[], picture?: import("@hypit/media").PictureInterpretation): void => {
    if (usage.length === 0) add(artifact, "never", picture);
    else for (const span of usage) add(artifact, span, picture);
  };
  for (const track of visualScopeTracks(composition.visual.root)) {
    for (const present of visualPresents(track)) {
      const presentUsage = present.visibility ?? [present.span];
      for (const element of visualElements(present.root)) {
        if (element.kind === "image") addForUsage(element.artifact, presentUsage, element.picture);
        if (element.kind === "video") addForUsage(element.source.source, presentUsage);
        if (element.kind === "surface") addForUsage(element.surface.artifact, presentUsage);
        if (element.kind === "program") {
          for (const dependency of readHtmlVisual(element.program).dependencies) {
            addForUsage(dependency.artifact, presentUsage,
              dependency.kind === "picture" ? dependency.picture : undefined);
          }
        }
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
    for (const process of visualProcesses(track)) {
      const usage = process.visibility ?? [process.span];
      for (const dependency of readHtmlVisual(process.effect.program).dependencies) {
        addForUsage(dependency.artifact, usage, dependency.kind === "picture" ? dependency.picture : undefined);
      }
    }
  }
  for (const process of visualScopeProcesses(composition.visual.root)) {
    for (const dependency of readHtmlVisual(process.effect.program).dependencies) {
      add(dependency.artifact, "always", dependency.kind === "picture" ? dependency.picture : undefined);
    }
  }
  return [...artifacts.values()]
    .sort((left, right) => compareCodeUnits(left.artifact.resource, right.artifact.resource))
    .map(({ artifact, picture, always, spans }, index): HtmlArtifact => ({
      id: `artifact-${String(index + 1).padStart(4, "0")}`,
      artifact,
      ...(picture === undefined
        ? { kind: "bytes" as const }
        : { kind: "picture" as const, picture: structuredClone(picture) }),
      usage: always
        ? { kind: "always" as const }
        : spans.length === 0
          ? { kind: "never" as const }
          : { kind: "frames" as const, spans: mergeFrameSpans(spans) },
    }));
}

function collectSurfaces(
  composition: HtmlComposition,
  artifactIds: ReadonlyMap<ResourceId, string>,
  artifacts: readonly HtmlArtifact[],
): HtmlProgram["surfaces"][number][] {
  const surfaces = new Map<ResourceId, CompositableSurfaceRef>();
  for (const track of visualScopeTracks(composition.visual.root)) {
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
    compareCodeUnits(left.artifact.resource, right.artifact.resource)).map((surface) => {
    const artifactId = artifactIds.get(surface.artifact.resource);
    if (artifactId === undefined) throw new Error("HTML Programme Surface has no declared Artifact.");
    const usage = artifacts.find((entry) => entry.id === artifactId)?.usage;
    if (usage === undefined) throw new Error("HTML Programme Surface has no declared Artifact usage.");
    return { artifactId, surface, usage: structuredClone(usage) };
  });
}

function collectFonts(composition: HtmlComposition): FontArtifactRef[] {
  const fonts = new Map<string, FontArtifactRef>();
  for (const track of visualScopeTracks(composition.visual.root)) {
    for (const present of visualPresents(track)) {
      for (const element of visualElements(present.root)) {
        if (element.kind !== "text") continue;
        for (const font of element.fonts ?? []) fonts.set(canonicalStringify(font), font);
      }
    }
  }
  for (const track of visualScopeTracks(composition.visual.root)) {
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

function renderFontFaces(composition: HtmlComposition, stableId: StableDomId): string {
  return collectFonts(composition).flatMap((font) => font.sources.map((source) => [
      "@font-face{",
      `font-family:${exactFontFamily(font, stableId)};`,
      `src:url(\"${htmlArtifactUri(source.artifact.resource)}\") format(\"${fontFormat(source.artifact.mediaType)}\");`,
      `font-weight:${font.weight};`,
      `font-style:${font.style};`,
      "font-display:block;",
      ...(source.unicodeRange === undefined ? [] : [`unicode-range:${source.unicodeRange};`]),
      "}",
    ].join(""))).join("\n    ");
}

function hasTerminalText(composition: HtmlComposition): boolean {
  return visualScopeTracks(composition.visual.root).some((track) =>
    visualPresents(track).some((present) => visualElements(present.root).some((element) =>
      element.kind === "text-flow" || element.kind === "path-text")));
}

function frameProgramRuntime(frameCount: number): string {
  return `(() => {
    let presents;
    let prepared;
    const initialize = spans => {
      htmlPrepareFrameSelection(spans);
      for (const initializer of htmlFrameProgramInitializers) initializer();
      htmlFrameProgramInitializers.length = 0;
      presents = [...document.querySelectorAll('[data-hypit-contribution-start-frame]')].map(element => ({
        element,
        startFrame: Number(element.getAttribute('data-hypit-contribution-start-frame')),
        endFrameExclusive: Number(element.getAttribute('data-hypit-contribution-end-frame')),
      }));
    };
    const applyPreparedFrame = async frame => {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame >= ${frameCount}) {
        throw new Error('HTML Program frame is outside its domain.');
      }
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
    const begin = (spans, frame) => {
      if (prepared !== undefined) return prepared;
      prepared = (async () => {
        initialize(spans);
        await document.fonts.ready;
        await applyPreparedFrame(frame);
      })();
      return prepared;
    };
    const applyFrame = async frame => {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame >= ${frameCount}) {
        throw new Error('HTML Program frame is outside its domain.');
      }
      if (prepared === undefined) return begin(undefined, frame);
      await prepared;
      await applyPreparedFrame(frame);
    };
    Object.defineProperty(window, '__hypitFrameProgram', { configurable: false, writable: false, value: Object.freeze({
      frameCount: ${frameCount},
      prepare(spans) {
        return begin(spans, spans?.[0]?.startFrame ?? 0);
      },
      applyFrame,
    }) });
  })();`;
}

type ContributionOccurrences = {
  readonly presents: readonly { readonly occurrencePath: readonly string[]; readonly present: VisualPresent }[];
  readonly processes: readonly { readonly occurrencePath: readonly string[]; readonly process: VisualProcess }[];
};

function contributionOccurrences(
  occurrencePath: readonly string[],
  contribution: VisualContribution,
): ContributionOccurrences {
  if (contribution.kind === "present") return { presents: [{ occurrencePath, present: contribution }], processes: [] };
  const children = contribution.inputs.map((input) => contributionOccurrences(
    contributionInputPath(occurrencePath, contribution, input.name),
    input.contribution,
  ));
  return {
    presents: children.flatMap((child) => child.presents),
    // Inputs settle before their owner so a recursive programme may read the complete requested input state.
    processes: [...children.flatMap((child) => child.processes), { occurrencePath, process: contribution }],
  };
}

function emitHtml(
  composition: HtmlComposition,
  timeline: Timeline,
  videoSources: HtmlVideoSource[],
  processUsages: HtmlProcessUsage[],
): string {
  const { numerator, denominator } = timeline.frameRate;
  const visualItems = visualScopeTrackOccurrences(composition.visual.root)
    .flatMap((occurrence) => occurrence.member.track.items.map((item) => ({
      occurrencePath: occurrence.path,
      item,
    })));
  const contributions = visualItems.flatMap(({ occurrencePath, item }) => item.kind === "adjustment"
    ? []
    : [contributionOccurrences(occurrencePath, item)]);
  const visuals = contributions.flatMap((entry) => entry.presents);
  const processes = contributions.flatMap((entry) => entry.processes);
  // One document, one set of glyph filter definitions. Keep definitions outside
  // temporal Present roots so a render can make an unrelated Present inert
  // without invalidating a selected Present's document-wide url(#id) reference.
  const emittedFilterIds = new Set<string>();
  const sharedGlyphFilterDefinitions: string[] = [];
  const stableId = createStableDomId();
  const adjustments: RenderedAdjustment["runtime"][] = [];
  const scopePrograms: {
    readonly id: string;
    readonly startFrame: number;
    readonly durationFrames: number;
    readonly program: ReturnType<typeof readHtmlVisual>;
  }[] = [];
  const processStages: string[] = [];
  let processOrder = 0;
  const renderScope = (
    scope: VisualScope,
    includeClear: boolean,
    scopePath: readonly string[],
    paintPath: readonly number[],
    captureContributions: boolean,
  ): string => {
    let html = includeClear
      ? `<div data-hypit-canvas-clear style="position:absolute;inset:0;z-index:0;background:${escapeHtml(composition.visual.canvas.clearColor)};pointer-events:none"></div>`
      : "";
    const entries = orderedVisualScopeEntries(scope);
    for (const [index, entry] of entries.entries()) {
      const stackIndex = index + 1;
      if ("stack" in entry) {
        const childScopePath = [...scopePath, entry.stack.id];
        const childPaintPath = [...paintPath, stackIndex];
        const child = renderScope(entry.stack.scope, false, childScopePath, childPaintPath, captureContributions);
        const id = stableId(["visual-stack", ...childScopePath]);
        html += `\n    <div id="${id}" class="hypit-visual-stack" data-hypit-stack-id="${escapeHtml(entry.stack.id)}" data-hypit-stack-path="${escapeHtml(JSON.stringify(childScopePath))}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none;isolation:isolate">${child}</div>`;
        continue;
      }
      if ("process" in entry) {
        const processPath = [...scopePath, `process:${entry.process.id}`];
        const processPaintPath = [...paintPath, stackIndex];
        const id = stableId(["visual-scope-process", ...processPath]);
        const program = readHtmlVisual(entry.process.effect.program);
        const renderedInputs = entry.process.inputs.map((input) => {
          const inputPath = [...processPath, `input:${input.name}`];
          const child = renderScope(input.scope, false, inputPath, processPaintPath, false);
          const key = stableId(["visual-scope-process-input", ...inputPath]);
          return { input, child, key };
        });
        const order = ++processOrder;
        const slots = new Map(renderedInputs.map(({ input, key }) => [input.name,
          `<div data-hypit-process-input="${escapeHtml(input.name)}" style="position:absolute;inset:0;overflow:hidden;pointer-events:none;isolation:isolate"><img data-hypit-process-raster-key="${key}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none"/></div>`] as const));
        for (const { input, child, key } of renderedInputs) processStages.push(
          `<div id="${key}" data-hypit-process-stage data-hypit-process-order="${order}" data-hypit-process-stage-key="${key}" data-hypit-process-input-name="${escapeHtml(input.name)}" data-hypit-capture-root data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="${timelineFrameCount(timeline)}" style="display:none;position:fixed;inset:0;width:${composition.visual.canvas.width}px;height:${composition.visual.canvas.height}px;overflow:hidden;pointer-events:none;background:transparent;isolation:isolate">${child}</div>`,
        );
        processUsages.push({
          order,
          passes: renderedInputs.length,
          stageKeys: renderedInputs.map(({ key }) => key),
          spans: [{ startFrame: 0, endFrameExclusive: timelineFrameCount(timeline) }],
        });
        scopePrograms.push({ id, startFrame: 0, durationFrames: timelineFrameCount(timeline), program });
        html += `\n    <div id="${id}" class="hypit-visual-scope-process"${captureContributions ? " data-hypit-capture-root" : ""} data-hypit-process-id="${escapeHtml(entry.process.id)}" data-hypit-occurrence-path="${escapeHtml(JSON.stringify(processPath))}" data-hypit-paint-path="${escapeHtml(JSON.stringify(processPaintPath))}" data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="${timelineFrameCount(timeline)}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none;isolation:isolate">${htmlVisualHtml(program, slots)}</div>`;
        continue;
      }
      const { item } = entry;
      const occurrencePath = [...scopePath, entry.memberId];
      if (item.kind !== "adjustment") {
        html += `\n    ${renderVisualContribution(occurrencePath, item, stackIndex, [...paintPath, stackIndex],
          numerator, denominator, emittedFilterIds, sharedGlyphFilterDefinitions, stableId, videoSources,
          processUsages, captureContributions)}`;
        continue;
      }
      const rendered = renderVisualAdjustment(occurrencePath, item, stackIndex, html, stableId);
      html = rendered.html;
      adjustments.push(rendered.runtime);
    }
    return html;
  };
  const visualHtml = renderScope(composition.visual.root, true, [], [], true);
  const sharedDefinitionsHtml = sharedGlyphFilterDefinitions.length === 0 ? ""
    : `<svg data-hypit-document-definitions aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden"><defs>${sharedGlyphFilterDefinitions.join("")}</defs></svg>`;
  const fontCss = renderFontFaces(composition, stableId);
  const programs = [...visuals.flatMap(({ occurrencePath, present }) => visualElements(present.root).flatMap(element => element.kind !== "program" ? [] : [{
    id: stableId(["visual-occurrence", ...occurrencePath, present.id, element.id]),
    startFrame: present.span.startFrame,
    durationFrames: present.span.endFrameExclusive - present.span.startFrame,
    program: readHtmlVisual(element.program),
  }])), ...processes.map(({ occurrencePath, process }) => ({
    id: stableId(["visual-process", ...occurrencePath, process.id]),
    startFrame: process.span.startFrame,
    durationFrames: process.span.endFrameExclusive - process.span.startFrame,
    program: readHtmlVisual(process.effect.program),
  })), ...scopePrograms];
  const programCss = programs.map(entry => `@scope (#${entry.id}) { ${entry.program.css ?? ""} }`).join("\n");
  const hasVisibility = visuals.some(({ present }) => present.visibility !== undefined)
    || processes.some(({ process }) => process.visibility !== undefined);
  const initializer = (runtime: string): string =>
    `<script>htmlRegisterFrameProgramInitializer(() => {\n${runtime}\n});</script>`;
  const programRuntime = programs.length === 0 ? "" : initializer(htmlVisualScript(programs, composition.visual.canvas));
  const visibilityRuntime = hasVisibility ? initializer(presentationVisibilityScript()) : "";
  const adjustmentRuntime = adjustments.length === 0 ? "" : initializer(htmlAdjustmentScript(adjustments));
  const frameCount = timelineFrameCount(timeline);
  const needsFrameWork = hasTerminalText(composition)
    || programs.length > 0 || hasVisibility || adjustments.length > 0;
  const frameRuntime = `\n  <script>\n    ${needsFrameWork ? frameWorkIndexRuntime : frameSelectionRuntime}\n  </script>
  <script>${presentationCaptureScopeRuntime}</script>${hasTerminalText(composition)
      ? `\n  ${initializer(`\n    ${terminalTextLayoutScript}`)}`
      : ""}`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
    [data-hypit-program-root]{position:relative;overflow:hidden;background:transparent}
    :where([data-hypit-media-display-plane]){display:inline-block;width:var(--hypit-media-intrinsic-width);height:var(--hypit-media-intrinsic-height)}
    *,*::before,*::after{box-sizing:border-box}
    ${fontCss}
    ${programCss}
  </style>
</head>
<body>
  ${processStages.join("\n  ")}${processStages.length === 0 ? "" : "\n  "}
  <div data-hypit-program-root data-hypit-program-id="${escapeHtml(composition.id)}" data-hypit-width="${composition.visual.canvas.width}" data-hypit-height="${composition.visual.canvas.height}" data-hypit-frame-numerator="${numerator}" data-hypit-frame-denominator="${denominator}" data-hypit-frame-count="${frameCount}" style="width:${composition.visual.canvas.width}px;height:${composition.visual.canvas.height}px">
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
    frameRate: { ...value.frameRate },
    frameCount: value.frameCount,
    canvas: { ...value.canvas },
    processUsages: value.processUsages.map((usage) => ({
      order: usage.order,
      passes: usage.passes,
      stageKeys: [...usage.stageKeys],
      spans: usage.spans.map((span) => ({ ...span })),
    })),
    artifacts: [...value.artifacts]
      .map((entry) => ({ id: entry.id, artifact: { ...entry.artifact },
        ...(entry.kind === "picture"
          ? { kind: "picture" as const, picture: structuredClone(entry.picture) }
          : { kind: "bytes" as const }), usage: entry.usage.kind === "always"
        ? { kind: "always" as const }
        : entry.usage.kind === "never"
          ? { kind: "never" as const }
          : { kind: "frames" as const, spans: entry.usage.spans.map((span) => ({ ...span })) } }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    surfaces: [...value.surfaces]
      .map((surface) => structuredClone(surface))
      .sort((left, right) => compareCodeUnits(left.artifactId, right.artifactId)),
    videoSources: [...value.videoSources].map((source) => source.kind === "media" ? ({
      ...source,
      usage: structuredClone(source.usage),
      source: structuredClone(source.source),
      sampling: structuredClone(source.sampling),
    }) : ({
      ...source,
      usage: structuredClone(source.usage),
      picture: structuredClone(source.picture),
      sourceFrame: { ...source.sourceFrame }, sourceRate: { ...source.sourceRate },
      sourceFrameRate: { ...source.sourceFrameRate },
    })).sort((left, right) => left.startFrame - right.startFrame || compareCodeUnits(left.id, right.id)),
    html: value.html,
  };
}

export function compileHtmlProgram(composition: HtmlComposition): HtmlProgram {
  const timeline = composition.timeline;
  if (!composition.id.trim()) throw new Error("Visual Composition id must not be empty.");
  assertVisualCompositionIdentity(composition.visual, timeline);
  const videoSources: HtmlVideoSource[] = [];
  const processUsages: HtmlProcessUsage[] = [];
  const artifacts = collectArtifacts(composition);
  const artifactIds = new Map(artifacts.map((entry) => [entry.artifact.resource, entry.id] as const));
  let html = emitHtml(composition, timeline, videoSources, processUsages);
  html = html
    .replace(ARTIFACT_URI, (_uri, resource: string) => {
      const artifactId = artifactIds.get(resource as ResourceId);
      if (artifactId === undefined) throw new Error(`HTML Programme references undeclared Artifact ${resource}.`);
      return htmlArtifactUri(artifactId);
    })
    .replace(SURFACE_ARTIFACT, (_marker, resource: string) => {
      const artifactId = artifactIds.get(resource as ResourceId);
      if (artifactId === undefined) throw new Error(`HTML Programme references undeclared Surface ${resource}.`);
      return `data-hypit-surface-artifact="${artifactId}"`;
    });
  const content = normalizedDocument({
    frameRate: { ...timeline.frameRate },
    frameCount: timelineFrameCount(timeline),
    canvas: {
      width: composition.visual.canvas.width,
      height: composition.visual.canvas.height,
    },
    processUsages,
    artifacts,
    surfaces: collectSurfaces(composition, artifactIds, artifacts),
    videoSources: videoSources.map((source) => {
      if (source.kind !== "surface") return source;
      const artifactId = artifactIds.get(source.artifactId as ResourceId);
      if (artifactId === undefined) throw new Error("HTML Programme sampled Surface has no declared Artifact.");
      return { ...source, artifactId };
    }),
    html,
  });
  return content;
}

export function assertHtmlProgram(document: HtmlProgram): void {
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
  if (!Array.isArray(document.processUsages) || document.processUsages.some((usage) =>
    !Number.isSafeInteger(usage.order) || usage.order <= 0
    || !Number.isSafeInteger(usage.passes) || usage.passes <= 0
    || !Array.isArray(usage.stageKeys) || usage.stageKeys.length !== usage.passes
    || usage.stageKeys.some((key: unknown) => typeof key !== "string" || key.length === 0)
    || new Set(usage.stageKeys).size !== usage.stageKeys.length
    || !Array.isArray(usage.spans) || usage.spans.length === 0
    || usage.spans.some((span: FrameSpan) => span === null || typeof span !== "object"
      || !Number.isSafeInteger(span.startFrame) || !Number.isSafeInteger(span.endFrameExclusive)
      || span.startFrame < 0 || span.endFrameExclusive <= span.startFrame
      || span.endFrameExclusive > document.frameCount)
    || JSON.stringify(mergeFrameSpans(usage.spans)) !== JSON.stringify(usage.spans))) {
    throw new Error("HtmlProgram Process execution topology is invalid.");
  }
  const declared = [...document.artifacts];
  if (declared.some((entry) => {
    if (typeof entry?.id !== "string" || !PROGRAM_RESOURCE_ID.test(entry.id)) return true;
    const item = entry?.artifact;
    if (!isBlobRef(item)) return true;
    if (entry.kind === "picture") {
      verifyPictureInterpretation(entry.picture, `HtmlProgram.artifacts.${entry.id}.picture`);
    } else if (entry.kind !== "bytes" || "picture" in entry) return true;
    if (entry.usage?.kind === "always" || entry.usage?.kind === "never") return Object.keys(entry.usage).length !== 1;
    if (entry.usage?.kind !== "frames" || !Array.isArray(entry.usage.spans) || entry.usage.spans.length === 0) return true;
    if (entry.usage.spans.some((span) => span === null || typeof span !== "object"
      || !Number.isSafeInteger(span.startFrame) || !Number.isSafeInteger(span.endFrameExclusive)
      || span.startFrame < 0 || span.endFrameExclusive <= span.startFrame
      || span.endFrameExclusive > document.frameCount)) return true;
    return JSON.stringify(mergeFrameSpans(entry.usage.spans)) !== JSON.stringify(entry.usage.spans);
  }) || new Set(declared.map((entry) => entry.id)).size !== declared.length) {
    throw new Error("HtmlProgram Artifact set is invalid.");
  }
  const resourceMetadata = new Map<string, { readonly size: number; readonly mediaType: string }>();
  for (const entry of declared) {
    const existing = resourceMetadata.get(entry.artifact.resource);
    if (existing !== undefined
      && (existing.size !== entry.artifact.size || existing.mediaType !== entry.artifact.mediaType)) {
      throw new Error(`HtmlProgram Artifact ${entry.artifact.resource} has conflicting metadata.`);
    }
    resourceMetadata.set(entry.artifact.resource, {
      size: entry.artifact.size,
      mediaType: entry.artifact.mediaType,
    });
  }
  const referenced = [...document.html.matchAll(ARTIFACT_URI)].map((match) => match[1]!);
  const actual = [...new Set(referenced)].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared.map((entry) => entry.id).sort())) {
    throw new Error("HtmlProgram Artifact placeholders do not match its declared dependencies.");
  }
  if (!Array.isArray(document.surfaces)) throw new Error("HtmlProgram Surface set is invalid.");
  if (!Array.isArray(document.videoSources) || document.videoSources.some((source) =>
    typeof source?.id !== "string" || source.id.length === 0
    || typeof source.elementId !== "string" || source.elementId.length === 0
    || !Number.isSafeInteger(source.startFrame) || !Number.isSafeInteger(source.endFrameExclusive)
    || source.startFrame < 0 || source.endFrameExclusive <= source.startFrame
    || source.endFrameExclusive > document.frameCount
    || source.usage === null || typeof source.usage !== "object"
    || (source.usage.kind === "never" ? Object.keys(source.usage).length !== 1 : (source.usage.kind !== "frames"
      || !Array.isArray(source.usage.spans) || source.usage.spans.length === 0
      || source.usage.spans.some((span: FrameSpan) => !Number.isSafeInteger(span.startFrame)
        || !Number.isSafeInteger(span.endFrameExclusive)
        || span.startFrame < source.startFrame || span.endFrameExclusive > source.endFrameExclusive
        || span.endFrameExclusive <= span.startFrame)
      || JSON.stringify(mergeFrameSpans(source.usage.spans)) !== JSON.stringify(source.usage.spans)))
    || (source.kind === "media" ? (() => {
      try {
        verifyPreparedVisualSource(source.source);
        assertTemporalMap(source.sampling);
        const target = source.sampling.stages[0]!.target;
        const terminal = source.sampling.stages.at(-1)!.source;
          return !declared.some((entry) => entry.artifact.resource === source.source.source.resource)
          || compareExactTemporalValues(target.duration,
            exactTemporalValueFromFrames(source.endFrameExclusive - source.startFrame, document)) !== 0
          || terminal.id !== source.source.sourceDomain.id
          || compareExactTemporalValues(terminal.duration, source.source.sourceDomain.duration) !== 0;
      } catch { return true; }
    })() : source.kind !== "surface" || typeof source.artifactId !== "string"
      || !PROGRAM_RESOURCE_ID.test(source.artifactId)
      || (() => { try { verifyPictureInterpretation(source.picture, `HtmlProgram.videoSources.${source.id}.picture`); return false; }
        catch { return true; } })()
      || !Number.isSafeInteger(source.sourceFrame?.numerator) || source.sourceFrame.numerator < 0
      || !Number.isSafeInteger(source.sourceFrame?.denominator) || source.sourceFrame.denominator <= 0
      || !Number.isSafeInteger(source.sourceRate?.numerator)
      || !Number.isSafeInteger(source.sourceRate?.denominator) || source.sourceRate.denominator <= 0
      || !Number.isSafeInteger(source.sourceFrameRate?.numerator) || source.sourceFrameRate.numerator <= 0
      || !Number.isSafeInteger(source.sourceFrameRate?.denominator) || source.sourceFrameRate.denominator <= 0
      || !declared.some((entry) => entry.id === source.artifactId)))) {
    throw new Error("HtmlProgram video-source plan is invalid.");
  }
  if (new Set(document.videoSources.map((source) => source.id)).size !== document.videoSources.length) {
    throw new Error("HtmlProgram video-source identities must be unique.");
  }
  const surfaceArtifacts = new Set<string>();
  for (const [index, binding] of document.surfaces.entries()) {
    if (binding === null || typeof binding !== "object" || !PROGRAM_RESOURCE_ID.test(binding.artifactId)) {
      throw new Error("HtmlProgram Surface binding is invalid.");
    }
    const surface = binding.surface;
    assertCompositableSurfaceRef(surface, `HtmlProgram.surfaces.${index}.surface`);
    if (surfaceArtifacts.has(binding.artifactId)) {
      throw new Error("HtmlProgram Surface set repeats an Artifact.");
    }
    surfaceArtifacts.add(binding.artifactId);
    const artifactEntry = declared.find((entry) => entry.id === binding.artifactId);
    const artifact = artifactEntry?.artifact;
    if (artifact === undefined || artifactEntry === undefined
      || artifact.resource !== surface.artifact.resource
      || artifact.size !== surface.artifact.size
      || artifact.mediaType !== surface.artifact.mediaType
      || canonicalStringify(binding.usage) !== canonicalStringify(artifactEntry.usage)) {
      throw new Error("HtmlProgram Surface is not bound to its declared Artifact.");
    }
  }
  const referencedSurfaces = [...new Set(
    [...document.html.matchAll(SURFACE_ARTIFACT)].map((match) => match[1]!),
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

function frameSpansOverlap(
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
  if (frameSelection !== undefined) assertHTMLFrameSelection(document, frameSelection);
  return document.artifacts.filter((entry) => entry.usage.kind === "always"
    || entry.usage.kind === "frames" && (frameSelection === undefined
      || frameSpansOverlap(entry.usage.spans, frameSelection)));
}

/** Project one render selection onto exact source occurrences. */
export function selectHtmlVideoSources(
  document: HtmlProgram,
  frameSelection?: readonly FrameSpan[],
): readonly HtmlVideoSource[] {
  assertHtmlProgram(document);
  if (frameSelection !== undefined) assertHTMLFrameSelection(document, frameSelection);
  return document.videoSources.filter((source) => source.usage.kind === "frames"
    && (frameSelection === undefined || frameSpansOverlap(source.usage.spans, frameSelection)));
}

/** Project one render selection onto typed Surface dependencies. */
export function selectHtmlSurfaces(
  document: HtmlProgram,
  frameSelection?: readonly FrameSpan[],
): HtmlProgram["surfaces"] {
  assertHtmlProgram(document);
  if (frameSelection !== undefined) assertHTMLFrameSelection(document, frameSelection);
  return document.surfaces.filter((surface) => surface.usage.kind === "always"
    || surface.usage.kind === "frames" && (frameSelection === undefined
      || frameSpansOverlap(surface.usage.spans, frameSelection)));
}

/** Project one render selection onto renderer-private Process input work. */
export function selectHtmlProcessUsages(
  document: HtmlProgram,
  frameSelection?: readonly FrameSpan[],
): readonly HtmlProcessUsage[] {
  assertHtmlProgram(document);
  if (frameSelection === undefined) return document.processUsages;
  assertHTMLFrameSelection(document, frameSelection);
  return document.processUsages.filter((usage) => frameSpansOverlap(usage.spans, frameSelection));
}

/** Runtime-only URL materialization. The returned HTML is intentionally not a new compiled Record. */
export function materializeHtmlProgram(
  document: HtmlProgram,
  resolve: ResourceUrlResolver,
): string {
  assertHtmlProgram(document);
  const artifacts = new Map(document.artifacts.map((entry) => [entry.id, entry.artifact]));
  return document.html.replace(ARTIFACT_URI, (_uri, id: string) => {
    const artifact = artifacts.get(id);
    if (artifact === undefined) throw new Error(`HTML renderer Programme Artifact ${id} is undeclared.`);
    return escapeHtml(resolve(artifact, id));
  });
}

export const htmlProgramTime = { frameSeconds, fpsDecimal, fpsRational } as const;
