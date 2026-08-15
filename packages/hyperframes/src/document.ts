import { assertCompositableSurfaceRef } from "@narratage/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@narratage/media";
import { programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertCompositionIdentity } from "@narratage/composition";
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
} from "@narratage/composition";
import { digestOf, isDigest } from "@narratage/protocol";
import type { BlobRef, Digest } from "@narratage/protocol";
import { VISUAL_IR_V1 } from "@narratage/visual-ir";

import type {
  ArtifactUrlResolver,
  HyperframesDocument,
  HyperframesFrameSpan,
} from "./types.js";
import {
  collectTerminalTextFonts,
  renderTerminalTextElement,
  terminalTextLayoutScript,
} from "./text.js";

const NANOSECONDS = 1_000_000_000n;
const ARTIFACT_URI = /narratage-artifact:\/\/sha256\/([0-9a-f]{64})/gu;
const SURFACE_ARTIFACT = /data-narratage-surface-artifact="(sha256:[0-9a-f]{64})"/gu;

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
  // HyperFrames and HTMLMediaElement require a positive playback rate. A held
  // visual frame is therefore represented as one independently addressed
  // target-frame clip per Program frame. Every clip starts at the same exact
  // source position; no browser-specific zero-rate behavior is assumed.
  if (segment.rate.numerator === 0) {
    const source = sourcePosition(segment, 0).position;
    for (let offset = 0; offset < length; offset += 1) {
      runs.push({
        startFrame: segment.target.startFrame + offset,
        endFrameExclusive: segment.target.startFrame + offset + 1,
        sourceFrame: source,
      });
    }
    return runs;
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
  // Zero-rate segments have already been split into one-frame clips above.
  // Their media clock may advance inside that single frame, while every
  // independently rendered target frame still starts at the exact held source.
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

export function hyperframesArtifactUri(digest: Digest): string {
  if (!isDigest(digest)) throw new Error("HyperFrames Artifact digest is invalid.");
  return `narratage-artifact://sha256/${digest.slice("sha256:".length)}`;
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

function stableDomId(parts: readonly string[]): string {
  return `narratage-${digestOf(parts).slice("sha256:".length, "sha256:".length + 20)}`;
}

function exactFontFamily(font: FontArtifactRef): string {
  return stableDomId(["font", digestOf(font)]);
}

function exactFontStyle(element: VisualElement): string[] {
  if (element.kind !== "text") return [];
  const first = element.fonts[0]!;
  return [
    `font-family:${element.fonts.map(exactFontFamily).join(",")}`,
    `font-weight:${first.weight}`,
    `font-style:${first.style}`,
    "font-synthesis:none",
  ];
}

function renderElement(
  element: VisualElement,
  children: ReadonlyMap<string, readonly VisualElement[]>,
  context: {
    readonly trackId: string;
    readonly presentId: string;
    readonly presentStart: string;
    readonly presentDuration: string;
    readonly presentDurationFrames: number;
    readonly presentStartFrame: number;
    readonly programNumerator: number;
    readonly programDenominator: number;
    readonly stackIndex: number;
  },
): string {
  const id = stableDomId([context.trackId, context.presentId, element.id]);
  const animationName = element.animation === undefined
    ? undefined
    : stableDomId(["animation", context.trackId, context.presentId, element.id]);
  const animationProperties = element.animation === undefined
    ? []
    : [...new Set(element.animation.keyframes.flatMap((keyframe) => keyframe.style.map((declaration) => declaration.name)))].sort();
  const animationDurationFrames = element.animation === undefined
    ? context.presentDurationFrames
    : Math.max(context.presentDurationFrames, element.animation.keyframes.at(-1)?.atFrame ?? 0);
  const animationDuration = frameSeconds(animationDurationFrames, context.programNumerator, context.programDenominator);
  const inlineStyle = [
    css(element.style),
    ...exactFontStyle(element),
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
  const commonAttributes = `id="${id}" data-narratage-element-id="${escapeHtml(element.id)}"${attributes(element.attributes)}`;
  const animationAttributes = animationName === undefined
    ? ""
    : ` data-narratage-frame-animation data-narratage-animation-start-frame="${context.presentStartFrame}" data-narratage-animation-duration-frames="${animationDurationFrames}" data-narratage-animation-sample-frames="${context.presentDurationFrames}" data-narratage-animation-properties="${animationProperties.join(",")}"`;
  const common = `${commonAttributes}${animationAttributes} style="${escapeHtml(inlineStyle)}"`;
  if (element.kind === "mask") {
    const direct = children.get(element.id) ?? [];
    const maskRoot = direct.find((child) => child.id === element.maskElement);
    const contentRoot = direct.find((child) => child.id === element.contentElement);
    if (maskRoot === undefined || contentRoot === undefined || direct.length !== 2) {
      throw new Error(`Local mask ${element.id} is missing its declared owned roots.`);
    }
    const maskId = stableDomId([context.trackId, context.presentId, element.id, "mask"]);
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
        const textStyle = [css(maskRoot.style), ...exactFontStyle(maskRoot), "fill:currentColor"].filter(Boolean).join(";");
        return `<text${attributes(maskRoot.attributes)} x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="${baseline}" style="${escapeHtml(textStyle)}">${escapeHtml(maskRoot.text)}</text>`;
      }
      if (maskRoot.kind === "text-flow" || maskRoot.kind === "path-text") {
        return `<foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:100%;height:100%">${renderOwned(maskRoot)}</div></foreignObject>`;
      }
      if (maskRoot.kind === "image") {
        return `<image x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" href="${escapeHtml(hyperframesArtifactUri(maskRoot.artifact.digest))}" style="${escapeHtml(css(maskRoot.style))}"/>`;
      }
      if (maskRoot.kind === "surface" && maskRoot.surface.timing.kind === "still") {
        return `<image data-narratage-surface-artifact="${maskRoot.surface.artifact.digest}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" href="${escapeHtml(hyperframesArtifactUri(maskRoot.surface.artifact.digest))}" style="${escapeHtml(css(maskRoot.style))}"/>`;
      }
      throw new Error(`Local mask ${element.id} requires a terminal owned text, image or still Surface mask source.`);
    })();
    return `<svg ${common}${viewport} width="100%" height="100%" overflow="visible"><defs><mask id="${maskId}" x="0" y="0" width="100%" height="100%" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:${element.mode}">${maskSource}</mask></defs><foreignObject x="0" y="0" width="100%" height="100%" mask="url(#${maskId})"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:100%;height:100%">${renderOwned(contentRoot)}</div></foreignObject></svg>`;
  }
  const descendants = (children.get(element.id) ?? [])
    .map((child) => renderElement(child, children, context))
    .join("");
  if (element.kind === "box") return `<div ${common}>${descendants}</div>`;
  if (element.kind === "text") return `<div ${common}>${escapeHtml(element.text)}${descendants}</div>`;
  if (element.kind === "text-flow" || element.kind === "path-text") {
    return renderTerminalTextElement(element, {
      trackId: context.trackId,
      presentId: context.presentId,
      durationFrames: context.presentDurationFrames,
      durationSeconds: context.presentDuration,
      presentStartFrame: context.presentStartFrame,
      programNumerator: context.programNumerator,
      programDenominator: context.programDenominator,
      escape: escapeHtml,
      stableId: stableDomId,
      exactFontFamily,
      baseStyle: inlineStyle,
      commonAttributes,
    });
  }
  if ((element.kind === "video" || element.kind === "surface") && element.sampling !== undefined) {
    const artifact = element.kind === "surface" ? element.surface.artifact : element.artifact;
    const source = escapeHtml(hyperframesArtifactUri(artifact.digest));
    let part = 0;
    return element.sampling.segments.flatMap((segment) => samplingRuns(segment).map((run) => {
      part += 1;
      const startFrame = context.presentStartFrame + run.startFrame;
      const durationFrames = run.endFrameExclusive - run.startFrame;
      const partId = `${id}-sample-${String(part).padStart(4, "0")}`;
      const media = [
        `id="${partId}"`,
        `data-narratage-element-id="${escapeHtml(element.id)}"`,
        `data-narratage-sampling-part="${part}"`,
        `data-start="${frameSeconds(startFrame, context.programNumerator, context.programDenominator)}"`,
        `data-duration="${frameSeconds(durationFrames, context.programNumerator, context.programDenominator)}"`,
        `data-track-index="${context.stackIndex}"`,
        `data-media-start="${sourceSeconds(run.sourceFrame, element.sampling!.sourceFrameRate)}"`,
        `data-playback-rate="${sampledPlaybackRate(segment.rate, element.sampling!.sourceFrameRate, context.programNumerator, context.programDenominator)}"`,
        `data-narratage-source-frame="${run.sourceFrame.numerator}/${run.sourceFrame.denominator}"`,
        `data-narratage-source-rate="${segment.rate.numerator}/${segment.rate.denominator}"`,
        `style="${escapeHtml(inlineStyle)}"`,
        attributes(element.attributes).trim(),
        "muted",
        "playsinline",
        ...(element.kind === "surface" ? [
          `data-narratage-surface-artifact="${element.surface.artifact.digest}"`,
          `data-narratage-alpha-mode="${element.surface.alphaMode}"`,
          `data-narratage-color-space="${element.surface.colorSpace}"`,
          `width="${element.surface.width}"`,
          `height="${element.surface.height}"`,
        ] : []),
      ].filter(Boolean).join(" ");
      return `<video ${media} src="${source}"></video>`;
    })).join("");
  }
  if (element.kind === "surface") {
    const source = escapeHtml(hyperframesArtifactUri(element.surface.artifact.digest));
    const surface = [
      `data-narratage-surface-artifact="${element.surface.artifact.digest}"`,
      `data-start="${context.presentStart}"`,
      `data-duration="${context.presentDuration}"`,
      `data-track-index="${context.stackIndex}"`,
      `data-narratage-alpha-mode="${element.surface.alphaMode}"`,
      `data-narratage-color-space="${element.surface.colorSpace}"`,
      `width="${element.surface.width}"`,
      `height="${element.surface.height}"`,
    ].join(" ");
    if (element.surface.timing.kind === "still") return `<img ${common} ${surface} src="${source}"/>`;
    return `<video ${common} ${surface} muted playsinline src="${source}"></video>`;
  }

  const media = [
    `data-start="${context.presentStart}"`,
    `data-duration="${context.presentDuration}"`,
    `data-track-index="${context.stackIndex}"`,
    element.kind === "video" && element.muted !== false ? "muted" : "",
    element.kind === "video" ? "playsinline" : "",
  ].filter(Boolean).join(" ");
  const source = escapeHtml(hyperframesArtifactUri(element.artifact.digest));
  if (element.kind === "image") return `<img ${common} ${media} src="${source}"/>`;
  return `<video ${common} ${media} src="${source}">${descendants}</video>`;
}

function renderVisualPresent(
  track: VisualTrack,
  present: VisualPresent,
  stackIndex: number,
  numerator: number,
  denominator: number,
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
  });
  return `<div class="clip narratage-visual-present" data-narratage-track-id="${escapeHtml(track.id)}" data-narratage-present-id="${escapeHtml(present.id)}" data-narratage-stack-order="${present.stacking.order}" data-narratage-stack-tie="${escapeHtml(present.stacking.tieBreak)}" data-track-index="${stackIndex}" data-start="${start}" data-duration="${duration}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none">${contents}</div>`;
}

function renderAnimationRules(track: VisualTrack, present: VisualPresent): string[] {
  const presentDurationFrames = present.span.endFrameExclusive - present.span.startFrame;
  return present.elements.flatMap((element) => {
    if (element.animation === undefined) return [];
    const durationFrames = Math.max(presentDurationFrames, element.animation.keyframes.at(-1)?.atFrame ?? 0);
    const name = stableDomId(["animation", track.id, present.id, element.id]);
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

function collectArtifacts(composition: Composition): BlobRef[] {
  const artifacts = new Map<Digest, BlobRef>();
  const add = (artifact: Pick<BlobRef, "digest" | "size" | "mediaType">): void => {
    const next: BlobRef = {
      kind: "blob",
      digest: artifact.digest,
      size: artifact.size,
      mediaType: artifact.mediaType,
    };
    const existing = artifacts.get(artifact.digest);
    if (existing !== undefined && (existing.size !== next.size || existing.mediaType !== next.mediaType)) {
      throw new Error(`HyperFrames Artifact ${artifact.digest} has conflicting metadata.`);
    }
    artifacts.set(artifact.digest, next);
  };
  for (const track of composition.tracks) {
    if (track.kind === "audio") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind === "image" || element.kind === "video") add(element.artifact);
        if (element.kind === "surface") add(element.surface.artifact);
        if (element.kind === "text") {
          for (const font of element.fonts ?? []) {
            for (const source of font.sources) add(source.artifact);
          }
        }
        if (element.kind === "text-flow" || element.kind === "path-text") {
          for (const font of collectTerminalTextFonts(element)) {
            for (const source of font.sources) add(source.artifact);
          }
        }
      }
    }
  }
  return [...artifacts.values()].sort((left, right) => left.digest.localeCompare(right.digest));
}

function collectSurfaces(composition: Composition): CompositableSurfaceRef[] {
  const surfaces = new Map<Digest, CompositableSurfaceRef>();
  for (const track of composition.tracks) {
    if (track.kind !== "visual") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind !== "surface") continue;
        const surface = structuredClone(element.surface);
        const existing = surfaces.get(surface.artifact.digest);
        if (existing !== undefined && digestOf(existing) !== digestOf(surface)) {
          throw new Error(`HyperFrames Surface ${surface.artifact.digest} has conflicting declarations.`);
        }
        surfaces.set(surface.artifact.digest, surface);
      }
    }
  }
  return [...surfaces.values()].sort((left, right) =>
    left.artifact.digest.localeCompare(right.artifact.digest));
}

function collectFonts(composition: Composition): FontArtifactRef[] {
  const fonts = new Map<string, FontArtifactRef>();
  for (const track of composition.tracks) {
    if (track.kind !== "visual") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind !== "text") continue;
        for (const font of element.fonts ?? []) fonts.set(digestOf(font), font);
      }
    }
  }
  for (const track of composition.tracks) {
    if (track.kind !== "visual") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind !== "text-flow" && element.kind !== "path-text") continue;
        for (const font of collectTerminalTextFonts(element)) fonts.set(digestOf(font), font);
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

function renderFontFaces(composition: Composition): string {
  return collectFonts(composition).flatMap((font) => font.sources.map((source) => [
      "@font-face{",
      `font-family:${exactFontFamily(font)};`,
      `src:url(\"${hyperframesArtifactUri(source.artifact.digest)}\") format(\"${fontFormat(source.artifact.mediaType)}\");`,
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
  const timelines = [];
  for (const element of document.querySelectorAll("[data-narratage-frame-animation]")) {
    void element.getBoundingClientRect();
    const animation = element.getAnimations()[0];
    if (animation === undefined) throw new Error("Visual IR frame animation did not materialize.");
    const start = Number(element.getAttribute("data-narratage-animation-start-frame"));
    const duration = Number(element.getAttribute("data-narratage-animation-duration-frames"));
    const sampleDuration = Number(element.getAttribute("data-narratage-animation-sample-frames"));
    const properties = String(element.getAttribute("data-narratage-animation-properties") || "")
      .split(",").filter(Boolean);
    const frames = [];
    for (let frame = 0; frame <= sampleDuration; frame += 1) {
      animation.currentTime = frame * millisecondsPerFrame;
      animation.pause();
      const style = getComputedStyle(element);
      frames.push(properties.map((property) => [property, style.getPropertyValue(property)]));
    }
    animation.cancel();
    element.style.animationName = "none";
    timelines.push({ element, start, duration: sampleDuration, frames });
  }
  const applyFrame = (time) => {
    const programFrame = Math.max(0, Math.round(Number(time || 0) * numerator / denominator));
    for (const timeline of timelines) {
      const localFrame = Math.max(0, Math.min(timeline.duration, programFrame - timeline.start));
      for (const [property, value] of timeline.frames[localFrame]) {
        timeline.element.style.setProperty(property, value);
      }
    }
    void document.documentElement.getBoundingClientRect();
  };
  applyFrame(0);
  window.addEventListener("hf-seek", (event) => applyFrame(event.detail?.time));
})();`;
}

function emitHtml(composition: Composition, programSpace: ProgramSpace): string {
  const { numerator, denominator } = programSpace.frameRate;
  const visuals = orderedVisualPresents(composition.tracks);
  const visualHtml = visuals.map(({ track, present }, index) => renderVisualPresent(track, present, index, numerator, denominator)).join("\n    ");
  const animationCss = visuals.flatMap(({ track, present }) => renderAnimationRules(track, present)).join("\n    ");
  const fontCss = renderFontFaces(composition);
  const duration = frameSeconds(programSpaceFrameCount(programSpace), numerator, denominator);
  const fps = fpsRational(numerator, denominator);
  const frameCount = programSpaceFrameCount(programSpace);
  const textRuntime = hasTerminalText(composition)
    ? `\n  <script>\n    ${terminalTextLayoutScript}\n  </script>`
    : "";
  const animationRuntime = hasFrameAnimations(composition)
    ? `\n  <script>\n    ${frameAnimationRuntime(numerator, denominator)}\n  </script>`
    : "";
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
  </style>
</head>
<body>
  <div data-composition-id="${escapeHtml(composition.id)}" data-start="0" data-no-timeline data-width="${composition.canvas.width}" data-height="${composition.canvas.height}" data-duration="${duration}" data-fps="${fps}" data-narratage-frame-count="${frameCount}">
    ${visualHtml}
  </div>${animationRuntime}${textRuntime}
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
      .map((artifact) => ({ ...artifact }))
      .sort((left, right) => left.digest.localeCompare(right.digest)),
    surfaces: [...value.surfaces]
      .map((surface) => structuredClone(surface))
      .sort((left, right) => left.artifact.digest.localeCompare(right.artifact.digest)),
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
  if (declared.some((item) => item.kind !== "blob" || !isDigest(item.digest)
    || !Number.isSafeInteger(item.size) || item.size < 0 || item.mediaType.length === 0)
    || new Set(declared.map((item) => item.digest)).size !== declared.length) {
    throw new Error("HyperframesDocument Artifact set is invalid.");
  }
  const referenced = [...document.html.matchAll(ARTIFACT_URI)].map((match) => `sha256:${match[1]}` as Digest);
  const actual = [...new Set(referenced)].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared.map((item) => item.digest).sort())) {
    throw new Error("HyperframesDocument Artifact placeholders do not match its declared dependencies.");
  }
  if (!Array.isArray(document.surfaces)) throw new Error("HyperframesDocument Surface set is invalid.");
  const surfaceArtifacts = new Set<string>();
  for (const [index, surface] of document.surfaces.entries()) {
    assertCompositableSurfaceRef(surface, `HyperframesDocument.surfaces.${index}`);
    if (surfaceArtifacts.has(surface.artifact.digest)) {
      throw new Error("HyperframesDocument Surface set repeats an Artifact.");
    }
    surfaceArtifacts.add(surface.artifact.digest);
    const artifact = declared.find((item) => item.digest === surface.artifact.digest);
    if (artifact === undefined
      || artifact.size !== surface.artifact.size
      || artifact.mediaType !== surface.artifact.mediaType) {
      throw new Error("HyperframesDocument Surface is not bound to its declared Artifact.");
    }
  }
  const referencedSurfaces = [...new Set(
    [...document.html.matchAll(SURFACE_ARTIFACT)].map((match) => match[1]!),
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

/** Runtime-only URL materialization. The returned HTML is intentionally not a new compiled Record. */
export function materializeHyperframesHtml(
  document: HyperframesDocument,
  resolve: ArtifactUrlResolver,
): string {
  assertHyperframesDocument(document);
  const artifacts = new Map(document.artifacts.map((artifact) => [artifact.digest, artifact]));
  return document.html.replace(ARTIFACT_URI, (_uri, hash: string) => {
    const digest = `sha256:${hash}` as Digest;
    const artifact = artifacts.get(digest);
    if (artifact === undefined) throw new Error(`HyperFrames Artifact ${digest} is undeclared.`);
    return escapeHtml(resolve(artifact));
  });
}

export const hyperframesTime = { frameSeconds, fpsDecimal, fpsRational } as const;
