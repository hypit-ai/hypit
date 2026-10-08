import { assertCompositableSurfaceRef } from "@hypit/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";
import { programSpaceFrameCount } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { assertCompositionIdentity } from "@hypit/composition";
import type {
  Composition,
  Track,
  VisualAnimation,
  VisualAttribute,
  VisualElement,
  VisualPresent,
  VisualSamplingRational,
  VisualSamplingSegment,
  VisualStyleDeclaration,
  VisualTrack,
} from "@hypit/composition";
import { canonicalStringify, isResourceId } from "@hypit/protocol";
import type { BlobRef, ResourceId } from "@hypit/protocol";
import { VISUAL_IR_V1 } from "@hypit/visual-ir";
import { readBrowserProgram, browserProgramHtml, browserProgramScript } from "./browser-program.js";
import { presentationCaptureScopeRuntime } from "./capture-scope.js";
import { presentationVisibilityScript } from "./visibility.js";
import { frameSelectionRuntime, frameWorkIndexRuntime } from "./frame-work.js";

import type {
  ResourceUrlResolver,
  HyperframesArtifact,
  HyperframesDocument,
  HyperframesFrameSpan,
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

function rationalDecimal(numerator: bigint, denominator: bigint): string {
  if (denominator <= 0n) throw new Error("HyperFrames rational denominator must be positive.");
  const scale = 1_000_000_000_000n;
  const scaled = numerator * scale / denominator;
  const whole = scaled / scale;
  const remainder = scaled % scale;
  if (remainder === 0n) return String(whole);
  return `${whole}.${String(remainder).padStart(12, "0").replace(/0+$/u, "")}`;
}

function sourceSeconds(frame: VisualSamplingRational, frameRate: VisualSamplingRational): string {
  return rationalDecimal(
    BigInt(frame.numerator) * BigInt(frameRate.denominator),
    BigInt(frame.denominator) * BigInt(frameRate.numerator),
  );
}

function sourcePosition(segment: VisualSamplingSegment, offset: number): {
  readonly position: VisualSamplingRational;
  readonly cycle: bigint;
} {
  const denominator = BigInt(segment.sourceFrame.denominator) * BigInt(segment.rate.denominator);
  const raw = BigInt(segment.sourceFrame.numerator) * BigInt(segment.rate.denominator)
    + BigInt(offset) * BigInt(segment.rate.numerator) * BigInt(segment.sourceFrame.denominator);
  if (segment.loop === undefined) {
    if (raw < 0n || raw > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("HyperFrames visual sampling exceeds safe arithmetic.");
    }
    return { position: { numerator: Number(raw), denominator: Number(denominator) }, cycle: 0n };
  }
  const start = BigInt(segment.loop.startFrame) * denominator;
  const length = BigInt(segment.loop.endFrameExclusive - segment.loop.startFrame) * denominator;
  const delta = raw - start;
  const cycle = delta / length;
  const wrapped = ((delta % length) + length) % length;
  const numerator = start + wrapped;
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER) || denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("HyperFrames visual sampling exceeds safe arithmetic.");
  }
  return { position: { numerator: Number(numerator), denominator: Number(denominator) }, cycle };
}

function samplingRuns(segment: VisualSamplingSegment): Array<{
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly sourceFrame: VisualSamplingRational;
}> {
  const length = segment.target.endFrameExclusive - segment.target.startFrame;
  const runs: Array<{ startFrame: number; endFrameExclusive: number; sourceFrame: VisualSamplingRational }> = [];
  // Keep a hold as the interval it is. HTMLMediaElement cannot accept a zero
  // playbackRate, but that browser limitation belongs to the render/preview
  // adapters; expanding the shared sampling description here would turn one
  // authored relation into O(target frames) DOM and Provider work.
  if (segment.rate.numerator === 0) {
    return [{
      startFrame: segment.target.startFrame,
      endFrameExclusive: segment.target.endFrameExclusive,
      sourceFrame: sourcePosition(segment, 0).position,
    }];
  }
  let runStart = 0;
  let runSource = sourcePosition(segment, 0);
  for (let offset = 1; offset < length; offset += 1) {
    const next = sourcePosition(segment, offset);
    if (next.cycle !== runSource.cycle) {
      runs.push({
        startFrame: segment.target.startFrame + runStart,
        endFrameExclusive: segment.target.startFrame + offset,
        sourceFrame: runSource.position,
      });
      runStart = offset;
      runSource = next;
    }
  }
  runs.push({
    startFrame: segment.target.startFrame + runStart,
    endFrameExclusive: segment.target.endFrameExclusive,
    sourceFrame: runSource.position,
  });
  return runs;
}

function sampledPlaybackRate(
  rate: VisualSamplingRational,
  sourceFrameRate: VisualSamplingRational,
  programNumerator: number,
  programDenominator: number,
): string {
  // The exact zero rate remains in data-hypit-source-rate for adapters that
  // place discrete frames. This positive fallback is only the legal native
  // HTMLMediaElement value; preview adapters pause and seek held elements.
  if (rate.numerator === 0) return "1";
  return rationalDecimal(
    BigInt(rate.numerator) * BigInt(programNumerator) * BigInt(sourceFrameRate.denominator),
    BigInt(rate.denominator) * BigInt(programDenominator) * BigInt(sourceFrameRate.numerator),
  );
}

function percentage(frame: number, totalFrames: number): string {
  const scale = 1_000_000_000n;
  const scaled = BigInt(frame) * 100n * scale / BigInt(totalFrames);
  const whole = scaled / scale;
  const remainder = scaled % scale;
  if (remainder === 0n) return `${whole}%`;
  return `${whole}.${String(remainder).padStart(9, "0").replace(/0+$/u, "")}%`;
}

export function hyperframesResourceUri(resource: ResourceId): string {
  if (!isResourceId(resource)) throw new Error("HyperFrames Resource id is invalid.");
  return `hypit-resource://${resource}`;
}

/** Keep compiler-owned media inert until the page has applied its render selection. */
function deferredResource(attribute: "src" | "href", resource: ResourceId): string {
  return `data-hypit-resource-${attribute}="${escapeHtml(hyperframesResourceUri(resource))}"`;
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
  readonly trackId: string;
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
};

/** Every emitted element, including SVG mask sources, keeps the same authored frame clock. */
function elementPresentation(element: VisualElement, context: ElementContext) {
  const id = context.stableId([context.trackId, context.presentId, element.id]);
  const animationName = element.animation === undefined
    ? undefined
    : context.stableId(["animation", context.trackId, context.presentId, element.id]);
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
      // CSS animations inert from first paint so HyperFrames' exact seek is
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
  children: ReadonlyMap<string, readonly VisualElement[]>,
  context: ElementContext,
): string {
  const { inlineStyle, commonAttributes, common } = elementPresentation(element, context);
  const id = context.stableId([context.trackId, context.presentId, element.id]);
  if (element.kind === "mask") {
    const direct = children.get(element.id) ?? [];
    const maskRoot = direct.find((child) => child.id === element.maskElement);
    const contentRoot = direct.find((child) => child.id === element.contentElement);
    if (maskRoot === undefined || contentRoot === undefined || direct.length !== 2) {
      throw new Error(`Local mask ${element.id} is missing its declared owned roots.`);
    }
    const maskId = context.stableId([context.trackId, context.presentId, element.id, "mask"]);
    const maskWidth = pixelDimension(element.style, "width");
    const maskHeight = pixelDimension(element.style, "height");
    const viewport = maskWidth === undefined || maskHeight === undefined
      ? ""
      : ` viewBox="0 0 ${maskWidth} ${maskHeight}" preserveAspectRatio="none"`;
    const renderOwned = (child: VisualElement) => renderElement(child, children, context);
    if ((children.get(maskRoot.id) ?? []).length !== 0) {
      throw new Error(`Local mask ${element.id} mask source must be one terminal owned element.`);
    }
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
    const program = readBrowserProgram(element.program);
    const slots = new Map((children.get(element.id) ?? []).map(child => [child.id, renderElement(child, children, context)]));
    return `<div ${common}>${browserProgramHtml(program, slots)}</div>`;
  }
  const descendants = (children.get(element.id) ?? [])
    .map((child) => renderElement(child, children, context))
    .join("");
  if (element.kind === "box") return `<div ${common}>${descendants}</div>`;
  const textContext = {
    trackId: context.trackId,
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
    return `<div ${common}>${body}${descendants}</div>`;
  }
  if (element.kind === "text-flow" || element.kind === "path-text") {
    return renderTerminalTextElement(element, textContext);
  }
  if ((element.kind === "video" || element.kind === "surface") && element.sampling !== undefined) {
    const artifact = element.kind === "surface" ? element.surface.artifact : element.artifact;
    let part = 0;
    return element.sampling.segments.flatMap((segment) => samplingRuns(segment).map((run) => {
      part += 1;
      const startFrame = context.presentStartFrame + run.startFrame;
      const durationFrames = run.endFrameExclusive - run.startFrame;
      const partId = `${id}-sample-${String(part).padStart(4, "0")}`;
      const media = [
        `id="${partId}"`,
        `data-hypit-element-id="${escapeHtml(element.id)}"`,
        `data-hypit-sampling-part="${part}"`,
        `data-start="${frameSeconds(startFrame, context.programNumerator, context.programDenominator)}"`,
        `data-duration="${frameSeconds(durationFrames, context.programNumerator, context.programDenominator)}"`,
        `data-track-index="${context.stackIndex}"`,
        `data-media-start="${sourceSeconds(run.sourceFrame, element.sampling!.sourceFrameRate)}"`,
        `data-playback-rate="${sampledPlaybackRate(segment.rate, element.sampling!.sourceFrameRate, context.programNumerator, context.programDenominator)}"`,
        `data-hypit-source-frame="${run.sourceFrame.numerator}/${run.sourceFrame.denominator}"`,
        `data-hypit-source-rate="${segment.rate.numerator}/${segment.rate.denominator}"`,
        `data-hypit-start-frame="${startFrame}"`,
        `data-hypit-end-frame="${startFrame + durationFrames}"`,
        `data-hypit-source-fps="${element.sampling!.sourceFrameRate.numerator}/${element.sampling!.sourceFrameRate.denominator}"`,
        `style="${escapeHtml(inlineStyle)}"`,
        attributes(element.attributes).trim(),
        "muted",
        "playsinline",
        ...(element.kind === "surface" ? [
          `data-hypit-surface-resource="${element.surface.artifact.resource}"`,
          `data-hypit-alpha-mode="${element.surface.alphaMode}"`,
          `data-hypit-color-space="${element.surface.colorSpace}"`,
          `width="${element.surface.width}"`,
          `height="${element.surface.height}"`,
        ] : []),
      ].filter(Boolean).join(" ");
      return `<video ${media} ${deferredResource("src", artifact.resource)}></video>`;
    })).join("");
  }
  if (element.kind === "surface") {
    const surface = [
      `data-hypit-surface-resource="${element.surface.artifact.resource}"`,
      `data-start="${context.presentStart}"`,
      `data-duration="${context.presentDuration}"`,
      `data-track-index="${context.stackIndex}"`,
      `data-hypit-alpha-mode="${element.surface.alphaMode}"`,
      `data-hypit-color-space="${element.surface.colorSpace}"`,
      `width="${element.surface.width}"`,
      `height="${element.surface.height}"`,
    ].join(" ");
    if (element.surface.timing.kind === "still") return `<img ${common} ${surface} ${deferredResource("src", element.surface.artifact.resource)}/>`;
    const timing = element.surface.timing;
    const exact = `data-hypit-start-frame="${context.presentStartFrame}" data-hypit-end-frame="${context.presentStartFrame + timing.frameCount}" data-hypit-source-frame="0/1" data-hypit-source-rate="1/1" data-hypit-source-fps="${timing.frameRate.numerator}/${timing.frameRate.denominator}"`;
    return `<video ${common} ${surface} ${exact} muted playsinline ${deferredResource("src", element.surface.artifact.resource)}></video>`;
  }

  const media = [
    `data-start="${context.presentStart}"`,
    `data-duration="${context.presentDuration}"`,
    `data-track-index="${context.stackIndex}"`,
    element.kind === "video" && element.muted !== false ? "muted" : "",
    element.kind === "video" ? "playsinline" : "",
  ].filter(Boolean).join(" ");
  if (element.kind === "image") return `<img ${common} ${media} ${deferredResource("src", element.artifact.resource)}/>`;
  const exact = `data-hypit-start-frame="${context.presentStartFrame}" data-hypit-end-frame="${context.presentStartFrame + context.presentDurationFrames}" data-hypit-source-frame="0/1" data-hypit-source-rate="1/1" data-hypit-source-fps="${context.programNumerator}/${context.programDenominator}"`;
  return `<video ${common} ${media} ${exact} ${deferredResource("src", element.artifact.resource)}>${descendants}</video>`;
}

function renderVisualPresent(
  track: VisualTrack,
  present: VisualPresent,
  stackIndex: number,
  numerator: number,
  denominator: number,
  emittedFilterIds: Set<string>,
  sharedGlyphFilterDefinitions: string[],
  stableId: StableDomId,
): string {
  const start = frameSeconds(present.span.startFrame, numerator, denominator);
  const duration = frameSeconds(present.span.endFrameExclusive - present.span.startFrame, numerator, denominator);
  const children = new Map<string, VisualElement[]>();
  for (const element of present.elements) {
    if (element.parent === undefined) continue;
    const siblings = children.get(element.parent) ?? [];
    siblings.push(element);
    children.set(element.parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const root = present.elements.find((element) => element.parent === undefined)!;
  const contents = renderElement(root, children, {
    trackId: track.id,
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
  });
  return `<div class="clip hypit-visual-present" data-hypit-track-id="${escapeHtml(track.id)}" data-hypit-present-id="${escapeHtml(present.id)}" data-hypit-present-start-frame="${present.span.startFrame}" data-hypit-present-end-frame="${present.span.endFrameExclusive}" data-hypit-stack-order="${present.stacking.order}" data-hypit-stack-tie="${escapeHtml(present.stacking.tieBreak)}" data-track-index="${stackIndex}" data-start="${start}" data-duration="${duration}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none">${present.visibility === undefined ? contents : `<div data-hypit-visibility="${escapeHtml(JSON.stringify(present.visibility))}" style="position:absolute;inset:0">${contents}</div>`}</div>`;
}

function renderAnimationRules(track: VisualTrack, present: VisualPresent, stableId: StableDomId): string[] {
  const presentDurationFrames = present.span.endFrameExclusive - present.span.startFrame;
  return present.elements.flatMap((element) => {
    if (element.animation === undefined) return [];
    const durationFrames = Math.max(presentDurationFrames, element.animation.keyframes.at(-1)?.atFrame ?? 0);
    const name = stableId(["animation", track.id, present.id, element.id]);
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

function orderedVisualPresents(tracks: readonly Track[]): Array<{ readonly track: VisualTrack; readonly present: VisualPresent }> {
  return tracks
    .filter((track): track is VisualTrack => track.kind === "visual")
    .flatMap((track) => track.presents.map((present) => ({ track, present })))
    .sort((left, right) => left.present.stacking.order - right.present.stacking.order
      || left.present.stacking.tieBreak.localeCompare(right.present.stacking.tieBreak)
      || left.present.span.startFrame - right.present.span.startFrame
      || left.track.id.localeCompare(right.track.id)
      || left.present.id.localeCompare(right.present.id));
}

function mergeFrameSpans(spans: readonly HyperframesFrameSpan[]): HyperframesFrameSpan[] {
  const result: HyperframesFrameSpan[] = [];
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

function collectArtifacts(composition: Composition): HyperframesArtifact[] {
  const artifacts = new Map<ResourceId, { artifact: BlobRef; always: boolean; spans: HyperframesFrameSpan[] }>();
  const add = (artifact: Pick<BlobRef, "resource" | "size" | "mediaType">,
    usage: "always" | HyperframesFrameSpan): void => {
    const next: BlobRef = {
      kind: "blob",
      resource: artifact.resource,
      size: artifact.size,
      mediaType: artifact.mediaType,
    };
    const existing = artifacts.get(artifact.resource);
    if (existing !== undefined && (existing.artifact.size !== next.size || existing.artifact.mediaType !== next.mediaType)) {
      throw new Error(`HyperFrames Artifact ${artifact.resource} has conflicting metadata.`);
    }
    const entry = existing ?? { artifact: next, always: false, spans: [] };
    if (usage === "always") entry.always = true;
    else if (!entry.always) entry.spans.push({ ...usage });
    artifacts.set(artifact.resource, entry);
  };
  for (const track of composition.tracks) {
    if (track.kind === "audio") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind === "image" || element.kind === "video") add(element.artifact, present.span);
        if (element.kind === "surface") add(element.surface.artifact, present.span);
        // Browser Program HTML, CSS and setup are intentionally opaque. Their
        // declared dependencies stay conservative even though the Program root
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
  })).sort((left, right) => left.artifact.resource.localeCompare(right.artifact.resource));
}

function collectSurfaces(composition: Composition): CompositableSurfaceRef[] {
  const surfaces = new Map<ResourceId, CompositableSurfaceRef>();
  for (const track of composition.tracks) {
    if (track.kind !== "visual") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind !== "surface") continue;
        const surface = structuredClone(element.surface);
        const existing = surfaces.get(surface.artifact.resource);
        if (existing !== undefined && canonicalStringify(existing) !== canonicalStringify(surface)) {
          throw new Error(`HyperFrames Surface ${surface.artifact.resource} has conflicting declarations.`);
        }
        surfaces.set(surface.artifact.resource, surface);
      }
    }
  }
  return [...surfaces.values()].sort((left, right) =>
    left.artifact.resource.localeCompare(right.artifact.resource));
}

function collectFonts(composition: Composition): FontArtifactRef[] {
  const fonts = new Map<string, FontArtifactRef>();
  for (const track of composition.tracks) {
    if (track.kind !== "visual") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind !== "text") continue;
        for (const font of element.fonts ?? []) fonts.set(canonicalStringify(font), font);
      }
    }
  }
  for (const track of composition.tracks) {
    if (track.kind !== "visual") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind !== "text-flow" && element.kind !== "path-text") continue;
        for (const font of collectTerminalTextFonts(element)) fonts.set(canonicalStringify(font), font);
      }
    }
  }
  return [...fonts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, font]) => font);
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
      `src:url(\"${hyperframesResourceUri(source.artifact.resource)}\") format(\"${fontFormat(source.artifact.mediaType)}\");`,
      `font-weight:${font.weight};`,
      `font-style:${font.style};`,
      "font-display:block;",
      ...(source.unicodeRange === undefined ? [] : [`unicode-range:${source.unicodeRange};`]),
      "}",
    ].join(""))).join("\n    ");
}

function hasTerminalText(composition: Composition): boolean {
  return composition.tracks.some((track) => track.kind === "visual"
    && track.presents.some((present) => present.elements.some((element) =>
      element.kind === "text-flow" || element.kind === "path-text")));
}

function hasFrameAnimations(composition: Composition): boolean {
  return composition.tracks.some((track) => track.kind === "visual"
    && track.presents.some((present) => present.elements.some((element) => element.animation !== undefined)));
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
    if (!hyperframesSelectionOverlaps(start, end)) continue;
    void element.getBoundingClientRect();
    const animation = element.getAnimations()[0];
    if (animation === undefined) throw new Error("Visual IR frame animation did not materialize.");
    // The authored keyframes are already the compact state function. Keep them
    // instead of expanding every Present frame into a second table of
    // computed-style strings in every render Worker, but do not leave the CSS
    // animation live: HyperFrames' css and waapi adapters seek every live
    // document animation to absolute composition time, which replaces this
    // Present-relative pose whenever the Present does not start at frame 0.
    const keyframes = animation.effect.getKeyframes();
    const timing = animation.effect.getTiming();
    const properties = [...new Set(keyframes.flatMap((keyframe) => Object.keys(keyframe)))]
      .filter((name) => name !== "offset" && name !== "computedOffset" && name !== "easing" && name !== "composite");
    animation.cancel();
    element.style.animationName = "none";
    // A probe interpolates every property a keyframe omits against the
    // underlying value, which the inline pose a previous seek wrote would
    // otherwise replace. Snapshot each animated property's authored inline
    // value so a later seek can restore it before probing.
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
  const workIndex = hyperframesCreateFrameWorkIndex([...groupsBySpan.values()]);
  const applyFrame = (time) => {
    const programFrame = Math.max(0, Math.round(Number(time || 0) * numerator / denominator));
    const active = [];
    for (const work of workIndex.at(programFrame)) {
      const localTime = (programFrame - work.startFrame) * millisecondsPerFrame;
      // Always derive the pose from the absolute requested frame. Worker
      // partitioning, seek order and the previously rendered frame are not
      // inputs to animation state.
      for (const item of work.payload.animations) active.push({ item, localTime });
    }
    // Restore the authored inline values before probing: each probe derives
    // missing keyframe properties from the underlying value, which the previous
    // seek's inline pose would otherwise replace.
    for (const { item } of active) {
      for (const name of item.properties) {
        const value = item.authored[name];
        if (value === "") clear(item.element.style, name);
        else write(item.element.style, name, value);
      }
    }
    // Evaluate each pose with a transient Animation, read it and cancel it before
    // this seek returns, so no adapter ever sees it. The Animation constructor,
    // unlike Element.animate, is not tracked by HyperFrames' waapi adapter. Only
    // the resulting inline style reaches the captured frame.
    const probes = active.map(({ item, localTime }) => {
      const probe = new Animation(new KeyframeEffect(item.element, item.keyframes, item.timing), document.timeline);
      // Pause before seeking: assigning currentTime to a running Animation
      // re-bases its start time, so wall-clock time elapsed before the
      // computed-style read would advance the sampled pose.
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
  window.addEventListener("hf-seek", (event) => applyFrame(event.detail?.time));
})();`;
}

function emitHtml(composition: Composition, programSpace: ProgramSpace): string {
  const { numerator, denominator } = programSpace.frameRate;
  const visuals = orderedVisualPresents(composition.tracks);
  // One document, one set of glyph filter definitions. Keep definitions outside
  // temporal Present roots so a render can make an unrelated Present inert
  // without invalidating a selected Present's document-wide url(#id) reference.
  const emittedFilterIds = new Set<string>();
  const sharedGlyphFilterDefinitions: string[] = [];
  const stableId = createStableDomId();
  const visualHtml = visuals.map(({ track, present }, index) => renderVisualPresent(track, present, index,
    numerator, denominator, emittedFilterIds, sharedGlyphFilterDefinitions, stableId)).join("\n    ");
  const sharedDefinitionsHtml = sharedGlyphFilterDefinitions.length === 0 ? ""
    : `<svg data-hypit-document-definitions aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden"><defs>${sharedGlyphFilterDefinitions.join("")}</defs></svg>`;
  const animationCss = visuals.flatMap(({ track, present }) => renderAnimationRules(track, present, stableId)).join("\n    ");
  const fontCss = renderFontFaces(composition, stableId);
  const programs = visuals.flatMap(({ track, present }) => present.elements.flatMap(element => element.kind !== "program" ? [] : [{
    id: stableId([track.id, present.id, element.id]),
    startFrame: present.span.startFrame,
    durationFrames: present.span.endFrameExclusive - present.span.startFrame,
    program: readBrowserProgram(element.program),
  }]));
  const programCss = programs.map(entry => `@scope (#${entry.id}) { ${entry.program.css ?? ""} }`).join("\n");
  const hasVisibility = visuals.some(({ present }) => present.visibility !== undefined);
  const programRuntime = programs.length === 0 ? "" : `<script>${browserProgramScript(programs, numerator, denominator)}</script>`;
  const visibilityRuntime = hasVisibility ? `<script>${presentationVisibilityScript(numerator, denominator)}</script>` : "";
  const duration = frameSeconds(programSpaceFrameCount(programSpace), numerator, denominator);
  const fps = fpsRational(numerator, denominator);
  const frameCount = programSpaceFrameCount(programSpace);
  const needsFrameWork = hasFrameAnimations(composition) || hasTerminalText(composition) || programs.length > 0 || hasVisibility;
  const frameRuntime = `\n  <script>\n    ${needsFrameWork ? frameWorkIndexRuntime : frameSelectionRuntime}\n  </script>
  <script>${presentationCaptureScopeRuntime}</script>${hasFrameAnimations(composition) || hasTerminalText(composition)
      ? `\n  <script>${hasFrameAnimations(composition) ? `\n    ${frameAnimationRuntime(numerator, denominator)}` : ""}${hasTerminalText(composition) ? `\n    ${terminalTextLayoutScript}` : ""}\n  </script>`
      : ""}`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${composition.canvas.clearColor}}
    [data-composition-id]{position:relative;overflow:hidden;background:${composition.canvas.clearColor}}
    *,*::before,*::after{box-sizing:border-box}
    ${fontCss}
    ${animationCss}
    ${programCss}
  </style>
</head>
<body>
  <div data-composition-id="${escapeHtml(composition.id)}" data-start="0" data-no-timeline data-width="${composition.canvas.width}" data-height="${composition.canvas.height}" data-duration="${duration}" data-fps="${fps}" data-hypit-frame-count="${frameCount}">
    ${sharedDefinitionsHtml}${sharedDefinitionsHtml.length === 0 ? "" : "\n    "}${visualHtml}
  </div>${frameRuntime}${programRuntime}
  ${visibilityRuntime}
</body>
</html>
`;
}

function normalizedDocument(value: HyperframesDocument): HyperframesDocument {
  return {
    visualIr: value.visualIr,
    frameRate: { ...value.frameRate },
    frameCount: value.frameCount,
    canvas: { ...value.canvas },
    artifacts: [...value.artifacts]
      .map((entry) => ({ artifact: { ...entry.artifact }, usage: entry.usage.kind === "always"
        ? { kind: "always" as const }
        : { kind: "frames" as const, spans: entry.usage.spans.map((span) => ({ ...span })) } }))
      .sort((left, right) => left.artifact.resource.localeCompare(right.artifact.resource)),
    surfaces: [...value.surfaces]
      .map((surface) => structuredClone(surface))
      .sort((left, right) => left.artifact.resource.localeCompare(right.artifact.resource)),
    html: value.html,
  };
}

export function compileHyperframesDocument(composition: Composition, programSpace: ProgramSpace): HyperframesDocument {
  assertCompositionIdentity(composition, programSpace);
  const content = normalizedDocument({
    visualIr: VISUAL_IR_V1,
    frameRate: { ...programSpace.frameRate },
    frameCount: programSpaceFrameCount(programSpace),
    canvas: {
      width: composition.canvas.width,
      height: composition.canvas.height,
    },
    artifacts: collectArtifacts(composition),
    surfaces: collectSurfaces(composition),
    html: emitHtml(composition, programSpace),
  });
  return content;
}

export function assertHyperframesDocument(document: HyperframesDocument): void {
  if (document.visualIr !== VISUAL_IR_V1) throw new Error("Unsupported HyperframesDocument visual IR.");
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
    throw new Error("HyperframesDocument frame domain or canvas is invalid.");
  }
  if (!document.html.startsWith("<!doctype html>")) throw new Error("HyperframesDocument HTML is invalid.");
  const declared = [...document.artifacts];
  if (declared.some((entry) => {
    const item = entry?.artifact;
    if (item?.kind !== "blob" || !isResourceId(item.resource)
      || !Number.isSafeInteger(item.size) || item.size < 0 || item.mediaType.length === 0) return true;
    if (entry.usage?.kind === "always") return Object.keys(entry.usage).length !== 1;
    if (entry.usage?.kind !== "frames" || !Array.isArray(entry.usage.spans) || entry.usage.spans.length === 0) return true;
    if (entry.usage.spans.some((span) => span === null || typeof span !== "object"
      || !Number.isSafeInteger(span.startFrame) || !Number.isSafeInteger(span.endFrameExclusive)
      || span.startFrame < 0 || span.endFrameExclusive <= span.startFrame
      || span.endFrameExclusive > document.frameCount)) return true;
    return JSON.stringify(mergeFrameSpans(entry.usage.spans)) !== JSON.stringify(entry.usage.spans);
  }) || new Set(declared.map((entry) => entry.artifact.resource)).size !== declared.length) {
    throw new Error("HyperframesDocument Artifact set is invalid.");
  }
  const referenced = [...document.html.matchAll(RESOURCE_URI)].map((match) => match[1] as ResourceId);
  const actual = [...new Set(referenced)].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared.map((entry) => entry.artifact.resource).sort())) {
    throw new Error("HyperframesDocument Artifact placeholders do not match its declared dependencies.");
  }
  if (!Array.isArray(document.surfaces)) throw new Error("HyperframesDocument Surface set is invalid.");
  const surfaceArtifacts = new Set<string>();
  for (const [index, surface] of document.surfaces.entries()) {
    assertCompositableSurfaceRef(surface, `HyperframesDocument.surfaces.${index}`);
    if (surfaceArtifacts.has(surface.artifact.resource)) {
      throw new Error("HyperframesDocument Surface set repeats an Artifact.");
    }
    surfaceArtifacts.add(surface.artifact.resource);
    const artifact = declared.find((entry) => entry.artifact.resource === surface.artifact.resource)?.artifact;
    if (artifact === undefined
      || artifact.size !== surface.artifact.size
      || artifact.mediaType !== surface.artifact.mediaType) {
      throw new Error("HyperframesDocument Surface is not bound to its declared Artifact.");
    }
  }
  const referencedSurfaces = [...new Set(
    [...document.html.matchAll(SURFACE_RESOURCE)].map((match) => match[1]!),
  )].sort();
  if (JSON.stringify(referencedSurfaces) !== JSON.stringify([...surfaceArtifacts].sort())) {
    throw new Error("HyperframesDocument Surface markers do not match its typed dependencies.");
  }
}

/** Validate one independently renderable frame index without parsing generated HTML. */
export function assertHyperframesFrameIndex(document: HyperframesDocument, frame: number): void {
  assertHyperframesDocument(document);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= document.frameCount) {
    throw new Error(`HyperFrames frame ${frame} is outside [0, ${document.frameCount}).`);
  }
}

/** Validate a Provider-owned half-open chunk of the document's exact frame domain. */
export function assertHyperframesFrameSpan(
  document: HyperframesDocument,
  span: HyperframesFrameSpan,
): void {
  assertHyperframesDocument(document);
  if (
    !Number.isSafeInteger(span.startFrame)
    || !Number.isSafeInteger(span.endFrameExclusive)
    || span.startFrame < 0
    || span.endFrameExclusive <= span.startFrame
    || span.endFrameExclusive > document.frameCount
  ) {
    throw new Error(
      `HyperFrames frame span [${span.startFrame}, ${span.endFrameExclusive}) is outside [0, ${document.frameCount}).`,
    );
  }
}

function assertHyperframesFrameSelection(
  document: HyperframesDocument,
  selection: readonly HyperframesFrameSpan[],
): void {
  if (selection.length === 0) throw new Error("HyperFrames Artifact selection must not be empty");
  let previousEnd = 0;
  for (const [index, span] of selection.entries()) {
    if (span === null || typeof span !== "object"
      || !Number.isSafeInteger(span.startFrame) || !Number.isSafeInteger(span.endFrameExclusive)
      || span.startFrame < 0 || span.endFrameExclusive <= span.startFrame
      || span.endFrameExclusive > document.frameCount
      || (index > 0 && span.startFrame < previousEnd)) {
      throw new Error("HyperFrames Artifact selection must contain ordered, disjoint spans inside the document frame domain");
    }
    previousEnd = span.endFrameExclusive;
  }
}

function artifactUsageOverlaps(
  usage: readonly HyperframesFrameSpan[],
  selection: readonly HyperframesFrameSpan[],
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
export function selectHyperframesArtifacts(
  document: HyperframesDocument,
  frameSelection?: readonly HyperframesFrameSpan[],
): readonly HyperframesArtifact[] {
  assertHyperframesDocument(document);
  if (frameSelection === undefined) return document.artifacts;
  assertHyperframesFrameSelection(document, frameSelection);
  return document.artifacts.filter((entry) => entry.usage.kind === "always"
    || artifactUsageOverlaps(entry.usage.spans, frameSelection));
}

/** Runtime-only URL materialization. The returned HTML is intentionally not a new compiled Record. */
export function materializeHyperframesHtml(
  document: HyperframesDocument,
  resolve: ResourceUrlResolver,
): string {
  assertHyperframesDocument(document);
  const artifacts = new Map(document.artifacts.map((entry) => [entry.artifact.resource, entry.artifact]));
  return document.html.replace(RESOURCE_URI, (_uri, resource: ResourceId) => {
    const artifact = artifacts.get(resource);
    if (artifact === undefined) throw new Error(`HyperFrames Resource ${resource} is undeclared.`);
    return escapeHtml(resolve(artifact));
  });
}

export const hyperframesTime = { frameSeconds, fpsDecimal, fpsRational } as const;
