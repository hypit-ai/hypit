import { assertCompositableSurfaceRef, verifyPictureInterpretation, verifyPreparedVisualSource, verifyWorkingPictureSpec } from "@hypit/media";
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
import { assertTemporalMap, composeTemporalMaps, evaluateTemporalMap, exactTemporalValueFromFrames, exactTemporalZero, isAffineTemporalMapPiece, resolveTemporalBoundary, sealTemporalMap, temporalValueInFrames } from "@hypit/temporal";
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

type ChildDocument = {
  readonly id: string;
  readonly html: string;
  readonly program: HtmlProgram;
  readonly resourceForArtifact: (id: string) => ResourceId;
};

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
  readonly childDocument: (composition: HtmlComposition) => ChildDocument;
};

type NestedFrameRun =
  | { readonly length: number }
  | { readonly length: number; readonly childStart: number; readonly step: number }
  | { readonly length: number; readonly childStart: number; readonly steps: readonly number[] }
  | { readonly values: readonly number[] };

function shortestRepeatingPrefix(values: readonly number[]): number[] {
  if (values.length < 2) return [...values];
  const prefix = Array.from({ length: values.length }, () => 0);
  for (let index = 1; index < values.length; index += 1) {
    let candidate = prefix[index - 1]!;
    while (candidate > 0 && values[index] !== values[candidate]) candidate = prefix[candidate - 1]!;
    if (values[index] === values[candidate]) candidate += 1;
    prefix[index] = candidate;
  }
  return values.slice(0, values.length - prefix.at(-1)!);
}

function compactNestedNumberFrames(values: readonly number[]): NestedFrameRun[] {
  if (values.length === 1) return [{ length: 1, childStart: values[0]!, step: 0 }];
  const arithmetic: NestedFrameRun[] = [];
  let index = 0;
  while (index < values.length) {
    const value = values[index]!;
    const next = values[index + 1];
    const step = next === undefined ? 0 : next - value;
    let end = index + 1;
    while (end < values.length && values[end] === value + step * (end - index)) end += 1;
    arithmetic.push({ length: end - index, childStart: value, step });
    index = end;
  }
  const differences = values.slice(1).map((value, position) => value - values[position]!);
  const steps = shortestRepeatingPrefix(differences);
  const periodic: NestedFrameRun[] = [{ length: values.length, childStart: values[0]!, steps }];
  const literal: NestedFrameRun[] = [{ values: [...values] }];
  return [arithmetic, periodic, literal].reduce((shortest, candidate) =>
    JSON.stringify(candidate).length < JSON.stringify(shortest).length ? candidate : shortest);
}

/** Compress an already-quantized parent-to-child frame table without changing its meaning. */
function nestedFrameRuns(frames: readonly (number | null)[]): NestedFrameRun[] {
  const runs: NestedFrameRun[] = [];
  let index = 0;
  while (index < frames.length) {
    const value = frames[index]!;
    if (value === null) {
      let end = index + 1;
      while (end < frames.length && frames[end] === null) end += 1;
      runs.push({ length: end - index });
      index = end;
      continue;
    }
    let end = index + 1;
    while (end < frames.length && frames[end] !== null) end += 1;
    runs.push(...compactNestedNumberFrames(frames.slice(index, end) as number[]));
    index = end;
  }
  return runs;
}

function nestedFrameAttribute(frames: readonly (number | null)[]): string {
  const values = escapeHtml(JSON.stringify(frames));
  const runs = escapeHtml(JSON.stringify(nestedFrameRuns(frames)));
  return runs.length < values.length
    ? `data-hypit-nested-frame-runs="${runs}"`
    : `data-hypit-nested-frame-values="${values}"`;
}

function nestedSurfaceFrameAt(
  source: Extract<HtmlVideoSource, { readonly kind: "surface" }>,
  childFrame: number,
): number | undefined {
  if (childFrame < source.startFrame || childFrame >= source.endFrameExclusive) return undefined;
  const a = source.sourceFrame;
  const r = source.sourceRate;
  const numerator = BigInt(a.numerator) * BigInt(r.denominator)
    + BigInt(childFrame - source.startFrame) * BigInt(r.numerator) * BigInt(a.denominator);
  const denominator = BigInt(a.denominator) * BigInt(r.denominator);
  const value = numerator / denominator - (r.numerator < 0 && numerator % denominator === 0n ? 1n : 0n);
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Nested HTML Surface ${source.id} exceeds safe frame arithmetic.`);
  }
  return Number(value);
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
  if (element.kind === "composition") {
    const child = context.childDocument(element.composition);
    const frames = Array.from({ length: context.presentDurationFrames }, (_, localFrame) => {
      const mapped = evaluateTemporalMap(element.sampling, exactTemporalValueFromFrames(localFrame, {
        frameRate: { numerator: context.programNumerator, denominator: context.programDenominator },
      }));
      if (mapped === undefined) return null;
      // A visual frame owns the half-open interval beginning at its boundary.
      // Quantizing to nearest would switch to the next child frame halfway
      // through the current interval and make nesting depend on frame-rate ratio.
      const frame = resolveTemporalBoundary(mapped, element.composition.timeline, "inside");
      return frame >= 0 && frame < element.composition.timeline.frameCount ? frame : null;
    });
    for (const source of child.program.videoSources) {
      const documentPath = [id, ...source.documentPath];
      if (source.kind === "media") {
        const childDomain = element.sampling.stages.at(-1)!.source;
        const sourceDomain = source.sampling.stages[0]!.target;
        const active = sealTemporalMap({ stages: [{
          target: structuredClone(childDomain),
          source: structuredClone(sourceDomain),
          pieces: [{
            target: {
              start: exactTemporalValueFromFrames(source.startFrame, element.composition.timeline),
              end: exactTemporalValueFromFrames(source.endFrameExclusive, element.composition.timeline),
            },
            sourceAtStart: exactTemporalZero(),
            rate: { numerator: 1, denominator: 1 },
          }],
        }] });
        context.videoSources.push({
          kind: "media",
          id: context.stableId(["nested-source", ...context.occurrencePath, context.presentId, element.id, source.id]),
          documentPath,
          elementId: source.elementId,
          startFrame: context.presentStartFrame,
          endFrameExclusive: context.presentStartFrame + context.presentDurationFrames,
          source: structuredClone(source.source),
          sampling: composeTemporalMaps(composeTemporalMaps(element.sampling, active), source.sampling),
        });
        continue;
      }
      const sourceFrames = frames.map((frame) => frame === null ? null : nestedSurfaceFrameAt(source, frame));
      let runStart = 0;
      let part = 0;
      while (runStart < sourceFrames.length) {
        const sourceFrame = sourceFrames[runStart];
        if (sourceFrame === null || sourceFrame === undefined) { runStart += 1; continue; }
        const next = sourceFrames[runStart + 1];
        const rate = typeof next === "number" ? next - sourceFrame : 0;
        let runEnd = runStart + 1;
        while (runEnd < sourceFrames.length
          && sourceFrames[runEnd] === sourceFrame + rate * (runEnd - runStart)) runEnd += 1;
        part += 1;
        context.videoSources.push({
          kind: "surface",
          id: context.stableId(["nested-source", ...context.occurrencePath, context.presentId, element.id,
            source.id, String(part)]),
          documentPath,
          elementId: source.elementId,
          artifactId: child.resourceForArtifact(source.artifactId),
          startFrame: context.presentStartFrame + runStart,
          endFrameExclusive: context.presentStartFrame + runEnd,
          sourceFrame: { numerator: sourceFrame, denominator: 1 },
          sourceRate: { numerator: rate, denominator: 1 },
          sourceFrameRate: { ...source.sourceFrameRate },
        });
        runStart = runEnd;
      }
    }
    return `<iframe ${common} data-hypit-nested-composition data-hypit-nested-document-id="${child.id}" data-hypit-nested-start-frame="${context.presentStartFrame}" ${nestedFrameAttribute(frames)}></iframe>`;
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
      documentPath: [],
      elementId: id,
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
      "muted",
      "playsinline",
    ].filter(Boolean).join(" ");
    return `<video ${media} ${deferredArtifact("src", element.source.source.resource)}></video>`;
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
        documentPath: [],
        elementId: partId,
        artifactId: artifact.resource,
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
        "muted",
        "playsinline",
        ...[
          `data-hypit-surface-artifact="${element.surface.artifact.resource}"`,
          `data-hypit-alpha-mode="${element.surface.picture.alphaMode}"`,
          `data-hypit-color-primaries="${element.surface.picture.colorPrimaries}"`,
          `data-hypit-color-transfer="${element.surface.picture.colorTransfer}"`,
          `data-hypit-color-matrix="${element.surface.picture.colorMatrix}"`,
          `data-hypit-color-range="${element.surface.picture.colorRange}"`,
          `data-hypit-bit-depth="${element.surface.picture.bitDepth}"`,
          `width="${element.surface.width}"`,
          `height="${element.surface.height}"`,
        ],
      ].filter(Boolean).join(" ");
      return `<video ${media} ${deferredArtifact("src", artifact.resource)}></video>`;
    })).join("");
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
  childDocument: (composition: HtmlComposition) => ChildDocument,
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
    programNumerator: numerator,
    programDenominator: denominator,
    stackIndex,
    emittedFilterIds,
    sharedGlyphFilterDefinitions,
    stableId,
    videoSources,
    childDocument,
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
  childDocument: (composition: HtmlComposition) => ChildDocument,
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
    childDocument,
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
  childDocument: (composition: HtmlComposition) => ChildDocument,
  captureRoot: boolean,
): string {
  return contribution.kind === "present"
    ? renderVisualPresent(occurrencePath, contribution, stackIndex, paintPath, numerator, denominator,
        emittedFilterIds, sharedGlyphFilterDefinitions, stableId, videoSources, childDocument, captureRoot)
    : renderVisualProcess(occurrencePath, contribution, stackIndex, paintPath, numerator, denominator,
        emittedFilterIds, sharedGlyphFilterDefinitions, stableId, videoSources, childDocument, captureRoot);
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

function collectArtifacts(composition: HtmlComposition): HtmlArtifact[] {
  const artifacts = new Map<ResourceId, { artifact: BlobRef; picture?: import("@hypit/media").PictureInterpretation; always: boolean; spans: FrameSpan[] }>();
  const add = (artifact: Pick<BlobRef, "resource" | "size" | "mediaType">,
    usage: "always" | FrameSpan, picture?: import("@hypit/media").PictureInterpretation): void => {
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
    else if (!entry.always) entry.spans.push({ ...usage });
    artifacts.set(artifact.resource, entry);
  };
  for (const track of visualScopeTracks(composition.visual.root)) {
    for (const present of visualPresents(track)) {
      for (const element of visualElements(present.root)) {
        if (element.kind === "image") add(element.artifact, present.span, element.picture);
        if (element.kind === "video") add(element.source.source, present.span);
        if (element.kind === "surface") add(element.surface.artifact, present.span);
        if (element.kind === "composition") {
          for (const child of collectArtifacts(element.composition)) {
            add(child.artifact, present.span, child.picture);
          }
        }
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
    for (const process of visualProcesses(track)) {
      for (const artifact of process.effect.program.artifacts) add(artifact, "always");
    }
  }
  for (const process of visualScopeProcesses(composition.visual.root)) {
    for (const artifact of process.effect.program.artifacts) add(artifact, "always");
  }
  return [...artifacts.values()]
    .sort((left, right) => compareCodeUnits(left.artifact.resource, right.artifact.resource))
    .map(({ artifact, picture, always, spans }, index) => ({
      id: `artifact-${String(index + 1).padStart(4, "0")}`,
      artifact,
      ...(picture === undefined ? {} : { picture: structuredClone(picture) }),
      usage: always ? { kind: "always" as const } : { kind: "frames" as const, spans: mergeFrameSpans(spans) },
    }));
}

function collectSurfaces(
  composition: HtmlComposition,
  artifactIds: ReadonlyMap<ResourceId, string>,
): HtmlProgram["surfaces"][number][] {
  const surfaces = new Map<ResourceId, CompositableSurfaceRef>();
  for (const track of visualScopeTracks(composition.visual.root)) {
    for (const present of visualPresents(track)) {
      for (const element of visualElements(present.root)) {
        if (element.kind === "composition") {
          for (const nested of collectSurfaces(element.composition,
            new Map(collectArtifacts(element.composition).map((entry) => [entry.artifact.resource, entry.id] as const)))) {
            const surface = structuredClone(nested.surface);
            const existing = surfaces.get(surface.artifact.resource);
            if (existing !== undefined && canonicalStringify(existing) !== canonicalStringify(surface)) {
              throw new Error(`HTML renderer Surface ${surface.artifact.resource} has conflicting declarations.`);
            }
            surfaces.set(surface.artifact.resource, surface);
          }
          continue;
        }
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
    return { artifactId, surface };
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

function frameProgramRuntime(frameCount: number, hasNestedCompositions: boolean): string {
  const nestedDeclarations = hasNestedCompositions ? "\n    let nestedCompositions;" : "";
  const nestedRuntime = hasNestedCompositions ? `
    const nestedFrameAt = (nested, parentFrame) => {
      const localFrame = parentFrame - nested.startFrame;
      if (localFrame < 0 || localFrame >= nested.frameCount) return undefined;
      let low = 0;
      let high = nested.runs.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (nested.runs[middle].endFrameExclusive <= localFrame) low = middle + 1;
        else high = middle;
      }
      const run = nested.runs[low];
      if (run === undefined) return undefined;
      const offset = localFrame - run.startFrame;
      if (run.values !== undefined) return run.values[offset];
      if (!Number.isSafeInteger(run.childStart)) return undefined;
      if (run.steps === undefined) return run.childStart + offset * run.step;
      const cycles = Math.floor(offset / run.steps.length);
      const remainder = offset % run.steps.length;
      return run.childStart + cycles * run.stepSum + run.stepPrefix[remainder];
    };
    const projectedSpans = (nested, spans) => {
      const frames = new Set();
      for (const span of spans ?? [{ startFrame: 0, endFrameExclusive: ${frameCount} }]) {
        const start = Math.max(span.startFrame, nested.startFrame);
        const end = Math.min(span.endFrameExclusive, nested.startFrame + nested.frameCount);
        for (let frame = start; frame < end; frame += 1) {
          const childFrame = nestedFrameAt(nested, frame);
          if (Number.isSafeInteger(childFrame)) frames.add(childFrame);
        }
      }
      const ordered = [...frames].sort((left, right) => left - right);
      const result = [];
      for (const frame of ordered) {
        const previous = result.at(-1);
        if (previous !== undefined && previous.endFrameExclusive === frame) previous.endFrameExclusive = frame + 1;
        else result.push({ startFrame: frame, endFrameExclusive: frame + 1 });
      }
      return result;
    };
    const nestedProgram = async nested => {
      if (nested.ready === undefined) nested.ready = (async () => {
        if (typeof nested.srcdoc !== 'string') throw new Error('Nested Composition has no document.');
        if (!nested.element.hasAttribute('srcdoc')) {
          await new Promise((resolve, reject) => {
            nested.element.addEventListener('load', resolve, { once: true });
            nested.element.addEventListener('error', () => reject(new Error('Nested Composition failed to load.')), { once: true });
            nested.element.setAttribute('srcdoc', nested.srcdoc);
          });
        }
        const program = nested.element.contentWindow?.__hypitFrameProgram;
        if (program === undefined) throw new Error('Nested Composition has no frame programme.');
        await program.prepare(nested.spans);
        return program;
      })();
      return nested.ready;
    };` : "";
  const nestedInitialization = hasNestedCompositions ? `
      const nestedDocuments = new Map([...document.querySelectorAll('template[data-hypit-nested-document-id]')].map(element => [
        element.getAttribute('data-hypit-nested-document-id'),
        element.getAttribute('data-hypit-nested-srcdoc'),
      ]));
      nestedCompositions = [...document.querySelectorAll('iframe[data-hypit-nested-composition]')].map(element => {
        let cursor = 0;
        const values = element.getAttribute('data-hypit-nested-frame-values');
        const encoded = values === null
          ? JSON.parse(element.getAttribute('data-hypit-nested-frame-runs'))
          : [{ values: JSON.parse(values) }];
        const runs = encoded.map(run => {
          const length = run.length ?? run.values.length;
          const stepPrefix = run.steps?.reduce((prefix, step) => [...prefix, prefix.at(-1) + step], [0]);
          const resolved = { ...run, length, startFrame: cursor, endFrameExclusive: cursor + length,
            stepPrefix, stepSum: stepPrefix?.at(-1) };
          cursor = resolved.endFrameExclusive;
          return resolved;
        });
        return {
          element,
          startFrame: Number(element.getAttribute('data-hypit-nested-start-frame')),
          frameCount: cursor,
          runs,
          srcdoc: nestedDocuments.get(element.getAttribute('data-hypit-nested-document-id')),
          ready: undefined,
        };
      });
      for (const nested of nestedCompositions) nested.spans = projectedSpans(nested, spans);` : "";
  const nestedApplication = hasNestedCompositions ? `
      for (const nested of nestedCompositions) {
        const childFrame = nestedFrameAt(nested, frame);
        nested.element.style.display = Number.isSafeInteger(childFrame) ? '' : 'none';
        if (Number.isSafeInteger(childFrame)) pending.push(nestedProgram(nested).then(program => program.applyFrame(childFrame)));
      }` : "";
  return `(() => {
    let presents;${nestedDeclarations}
    let prepared;${nestedRuntime}
    const initialize = spans => {
      htmlPrepareFrameSelection(spans);
      for (const initializer of htmlFrameProgramInitializers) initializer();
      htmlFrameProgramInitializers.length = 0;
      presents = [...document.querySelectorAll('[data-hypit-contribution-start-frame]')].map(element => ({
        element,
        startFrame: Number(element.getAttribute('data-hypit-contribution-start-frame')),
        endFrameExclusive: Number(element.getAttribute('data-hypit-contribution-end-frame')),
      }));${nestedInitialization}
    };
    const applyFrame = async frame => {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame >= ${frameCount}) {
        throw new Error('HTML Program frame is outside its domain.');
      }
      if (!htmlFrameSelectionPrepared) initialize();
      for (const present of presents) {
        present.element.style.display = frame >= present.startFrame && frame < present.endFrameExclusive ? '' : 'none';
      }
      const pending = [];${nestedApplication}
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
  compileChild: (composition: HtmlComposition) => HtmlProgram,
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
  const nestedDocuments = new Map<HtmlComposition, ChildDocument>();
  const childDocument = (childComposition: HtmlComposition): ChildDocument => {
    const existing = nestedDocuments.get(childComposition);
    if (existing !== undefined) return existing;
    const child = compileChild(childComposition);
    const resources = new Map(child.artifacts.map((entry) => [entry.id, entry.artifact.resource] as const));
    const resource = (id: string): ResourceId => {
      const value = resources.get(id);
      if (value === undefined) throw new Error(`Nested Composition ${childComposition.id} references unknown Artifact ${id}.`);
      return value;
    };
    const document = {
      id: `hypit-nested-document-${nestedDocuments.size + 1}`,
      program: child,
      resourceForArtifact: resource,
      html: child.html
        .replace(ARTIFACT_URI, (_match, childId: string) => htmlArtifactUri(resource(childId)))
        .replace(SURFACE_ARTIFACT, (_match, childId: string) => `data-hypit-surface-artifact="${resource(childId)}"`),
    };
    nestedDocuments.set(childComposition, document);
    return document;
  };
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
          `<div data-hypit-process-stage data-hypit-process-order="${order}" data-hypit-process-stage-key="${key}" data-hypit-process-input-name="${escapeHtml(input.name)}" data-hypit-capture-root data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="${timelineFrameCount(timeline)}" style="display:none;position:fixed;inset:0;width:${composition.visual.canvas.width}px;height:${composition.visual.canvas.height}px;overflow:hidden;pointer-events:none;background:transparent;isolation:isolate">${child}</div>`,
        );
        scopePrograms.push({ id, startFrame: 0, durationFrames: timelineFrameCount(timeline), program });
        html += `\n    <div id="${id}" class="hypit-visual-scope-process"${captureContributions ? " data-hypit-capture-root" : ""} data-hypit-process-id="${escapeHtml(entry.process.id)}" data-hypit-occurrence-path="${escapeHtml(JSON.stringify(processPath))}" data-hypit-paint-path="${escapeHtml(JSON.stringify(processPaintPath))}" data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="${timelineFrameCount(timeline)}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none;isolation:isolate">${htmlVisualHtml(program, slots)}</div>`;
        continue;
      }
      const { item } = entry;
      const occurrencePath = [...scopePath, entry.memberId];
      if (item.kind !== "adjustment") {
        html += `\n    ${renderVisualContribution(occurrencePath, item, stackIndex, [...paintPath, stackIndex],
          numerator, denominator, emittedFilterIds, sharedGlyphFilterDefinitions, stableId, videoSources,
          childDocument, captureContributions)}`;
        continue;
      }
      const rendered = renderVisualAdjustment(occurrencePath, item, stackIndex, html, stableId);
      html = rendered.html;
      adjustments.push(rendered.runtime);
    }
    return html;
  };
  const visualHtml = renderScope(composition.visual.root, true, [], [], true);
  const hasNestedCompositions = nestedDocuments.size > 0;
  const nestedDocumentsHtml = [...nestedDocuments.values()].map((document) =>
    `<template data-hypit-nested-document-id="${document.id}" data-hypit-nested-srcdoc="${escapeHtml(document.html)}"></template>`).join("\n  ");
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
    ${hasNestedCompositions ? "iframe[data-hypit-nested-composition]{border:0;background:transparent}" : ""}
    *,*::before,*::after{box-sizing:border-box}
    ${fontCss}
    ${programCss}
  </style>
</head>
<body>
  ${nestedDocumentsHtml}${nestedDocumentsHtml.length === 0 ? "" : "\n  "}
  ${processStages.join("\n  ")}${processStages.length === 0 ? "" : "\n  "}
  <div data-hypit-program-root data-hypit-program-id="${escapeHtml(composition.id)}" data-hypit-width="${composition.visual.canvas.width}" data-hypit-height="${composition.visual.canvas.height}" data-hypit-frame-numerator="${numerator}" data-hypit-frame-denominator="${denominator}" data-hypit-frame-count="${frameCount}" style="width:${composition.visual.canvas.width}px;height:${composition.visual.canvas.height}px">
    ${sharedDefinitionsHtml}${sharedDefinitionsHtml.length === 0 ? "" : "\n    "}${visualHtml}
  </div>${frameRuntime}${programRuntime}
  ${visibilityRuntime}${adjustmentRuntime}
  <script>${frameProgramRuntime(frameCount, hasNestedCompositions)}</script>
</body>
</html>
`;
}

function normalizedDocument(value: HtmlProgram): HtmlProgram {
  return {
    picture: structuredClone(value.picture),
    frameRate: { ...value.frameRate },
    frameCount: value.frameCount,
    canvas: { ...value.canvas },
    processPasses: value.processPasses,
    artifacts: [...value.artifacts]
      .map((entry) => ({ id: entry.id, artifact: { ...entry.artifact },
        ...(entry.picture === undefined ? {} : { picture: structuredClone(entry.picture) }), usage: entry.usage.kind === "always"
        ? { kind: "always" as const }
        : { kind: "frames" as const, spans: entry.usage.spans.map((span) => ({ ...span })) } }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    surfaces: [...value.surfaces]
      .map((surface) => structuredClone(surface))
      .sort((left, right) => compareCodeUnits(left.artifactId, right.artifactId)),
    videoSources: [...value.videoSources].map((source) => source.kind === "media" ? ({
      ...source,
      documentPath: [...source.documentPath],
      source: structuredClone(source.source),
      sampling: structuredClone(source.sampling),
    }) : ({
      ...source,
      documentPath: [...source.documentPath],
      sourceFrame: { ...source.sourceFrame }, sourceRate: { ...source.sourceRate },
      sourceFrameRate: { ...source.sourceFrameRate },
    })).sort((left, right) => left.startFrame - right.startFrame || compareCodeUnits(left.id, right.id)),
    html: value.html,
  };
}

function compositionProcessPasses(composition: HtmlComposition, visited = new Set<HtmlComposition>()): number {
  if (visited.has(composition)) throw new Error(`Nested Composition ${composition.id} forms a recursive value.`);
  visited.add(composition);
  let count = visualScopeProcesses(composition.visual.root)
    .reduce((total, process) => total + process.inputs.length, 0);
  const visitContribution = (contribution: VisualContribution): void => {
    if (contribution.kind === "process") {
      for (const input of contribution.inputs) visitContribution(input.contribution);
      return;
    }
    for (const element of visualElements(contribution.root)) {
      if (element.kind === "composition") count += compositionProcessPasses(element.composition, visited);
    }
  };
  for (const track of visualScopeTracks(composition.visual.root)) {
    for (const item of track.items) if (item.kind !== "adjustment") visitContribution(item);
  }
  visited.delete(composition);
  return count;
}

type HtmlCompilationContext = {
  readonly programs: WeakMap<object, HtmlProgram>;
};

function compileHtmlProgramWithContext(
  composition: HtmlComposition,
  context: HtmlCompilationContext,
): HtmlProgram {
  const cached = context.programs.get(composition);
  if (cached !== undefined) return cached;
  const timeline = composition.timeline;
  if (!composition.id.trim()) throw new Error("Visual Composition id must not be empty.");
  assertVisualCompositionIdentity(composition.visual, timeline);
  for (const track of visualScopeTracks(composition.visual.root)) for (const present of visualPresents(track)) {
    for (const element of visualElements(present.root)) {
      if (element.kind === "composition"
        && canonicalStringify(element.composition.visual.picture) !== canonicalStringify(composition.visual.picture)) {
        throw new Error(`Nested Composition ${element.composition.id} WorkingPicture differs from its parent.`);
      }
    }
  }
  const videoSources: HtmlVideoSource[] = [];
  const artifacts = collectArtifacts(composition);
  const artifactIds = new Map(artifacts.map((entry) => [entry.artifact.resource, entry.id] as const));
  let html = emitHtml(composition, timeline, videoSources,
    (child) => compileHtmlProgramWithContext(child, context));
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
    picture: structuredClone(composition.visual.picture),
    frameRate: { ...timeline.frameRate },
    frameCount: timelineFrameCount(timeline),
    canvas: {
      width: composition.visual.canvas.width,
      height: composition.visual.canvas.height,
    },
    processPasses: compositionProcessPasses(composition),
    artifacts,
    surfaces: collectSurfaces(composition, artifactIds),
    videoSources: videoSources.map((source) => {
      if (source.kind !== "surface") return source;
      const artifactId = artifactIds.get(source.artifactId as ResourceId);
      if (artifactId === undefined) throw new Error("HTML Programme sampled Surface has no declared Artifact.");
      return { ...source, artifactId };
    }),
    html,
  });
  context.programs.set(composition, content);
  return content;
}

export function compileHtmlProgram(composition: HtmlComposition): HtmlProgram {
  return compileHtmlProgramWithContext(composition, { programs: new WeakMap() });
}

export function assertHtmlProgram(document: HtmlProgram): void {
  verifyWorkingPictureSpec(document.picture, "HtmlProgram.picture");
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
    || !Number.isSafeInteger(document.processPasses)
    || document.processPasses < 0
  ) {
    throw new Error("HtmlProgram frame domain or canvas is invalid.");
  }
  if (!document.html.startsWith("<!doctype html>")) throw new Error("HtmlProgram HTML is invalid.");
  const declared = [...document.artifacts];
  if (declared.some((entry) => {
    if (typeof entry?.id !== "string" || !PROGRAM_RESOURCE_ID.test(entry.id)) return true;
    const item = entry?.artifact;
    if (!isBlobRef(item)) return true;
    if (entry.picture !== undefined) verifyPictureInterpretation(entry.picture, `HtmlProgram.artifacts.${entry.id}.picture`);
    if (entry.usage?.kind === "always") return Object.keys(entry.usage).length !== 1;
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
    || !Array.isArray(source.documentPath) || source.documentPath.some((id: unknown) => typeof id !== "string" || id.length === 0)
    || typeof source.elementId !== "string" || source.elementId.length === 0
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
    })() : source.kind !== "surface" || typeof source.artifactId !== "string"
      || !PROGRAM_RESOURCE_ID.test(source.artifactId)
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
    const artifact = declared.find((entry) => entry.id === binding.artifactId)?.artifact;
    if (artifact === undefined
      || artifact.resource !== surface.artifact.resource
      || artifact.size !== surface.artifact.size
      || artifact.mediaType !== surface.artifact.mediaType) {
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
  const artifacts = new Map(document.artifacts.map((entry) => [entry.id, entry.artifact]));
  return document.html.replace(ARTIFACT_URI, (_uri, id: string) => {
    const artifact = artifacts.get(id);
    if (artifact === undefined) throw new Error(`HTML renderer Programme Artifact ${id} is undeclared.`);
    return escapeHtml(resolve(artifact, id));
  });
}

export const htmlProgramTime = { frameSeconds, fpsDecimal, fpsRational } as const;
