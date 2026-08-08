import type { FontArtifactRef } from "@narratage/media";
import { programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertCompositionIdentity } from "@narratage/composition";
import type { Composition, Track, VisualAttribute, VisualElement, VisualPresent, VisualStyleDeclaration, VisualTrack } from "@narratage/composition";
import { digestOf, isDigest } from "@narratage/protocol";
import type { BlobRef, Digest } from "@narratage/protocol";
import { VISUAL_IR_V1 } from "@narratage/visual-ir";

import type {
  ArtifactUrlResolver,
  HyperframesDocument,
  HyperframesFrameSpan,
} from "./types.js";

export const compileHyperframesImplementationDigest = digestOf("@narratage/hyperframes/compile@1");

const NANOSECONDS = 1_000_000_000n;
const ARTIFACT_URI = /svml-artifact:\/\/sha256\/([0-9a-f]{64})/gu;

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
  return `svml-artifact://sha256/${digest.slice("sha256:".length)}`;
}

function css(style: readonly VisualStyleDeclaration[]): string {
  return style.map(({ name, value }) => `${name}:${String(value)}`).join(";");
}

function attributes(values: readonly VisualAttribute[] | undefined): string {
  return (values ?? []).map(({ name, value }) => ` ${name}="${escapeHtml(value)}"`).join("");
}

function stableDomId(parts: readonly string[]): string {
  return `svml-${digestOf(parts).slice("sha256:".length, "sha256:".length + 20)}`;
}

function exactFontFamily(font: FontArtifactRef): string {
  return stableDomId(["font", digestOf(font)]);
}

function exactFontStyle(element: VisualElement): string[] {
  if (element.kind !== "text" || element.fonts === undefined) return [];
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
    readonly stackIndex: number;
  },
): string {
  const id = stableDomId([context.trackId, context.presentId, element.id]);
  const animationName = element.animation === undefined
    ? undefined
    : stableDomId(["animation", context.trackId, context.presentId, element.id]);
  const inlineStyle = [
    css(element.style),
    ...exactFontStyle(element),
    ...(animationName === undefined ? [] : [
      `animation-name:${animationName}`,
      `animation-duration:${context.presentDuration}s`,
      "animation-fill-mode:both",
      "animation-timing-function:linear",
    ]),
  ].filter(Boolean).join(";");
  const common = `id="${id}" data-svml-element-id="${escapeHtml(element.id)}" style="${escapeHtml(inlineStyle)}"${attributes(element.attributes)}`;
  const descendants = (children.get(element.id) ?? [])
    .map((child) => renderElement(child, children, context))
    .join("");
  if (element.kind === "box") return `<div ${common}>${descendants}</div>`;
  if (element.kind === "text") return `<div ${common}>${escapeHtml(element.text)}${descendants}</div>`;
  if (element.kind === "surface") {
    const source = escapeHtml(hyperframesArtifactUri(element.surface.artifact.digest));
    const surface = [
      `data-start="${context.presentStart}"`,
      `data-duration="${context.presentDuration}"`,
      `data-track-index="${context.stackIndex}"`,
      `data-svml-alpha-mode="${element.surface.alphaMode}"`,
      `data-svml-color-space="${element.surface.colorSpace}"`,
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
    element.mediaStartSec === undefined ? "" : `data-media-start="${element.mediaStartSec}"`,
    element.playbackRate === undefined ? "" : `data-playback-rate="${element.playbackRate}"`,
    element.kind === "video" && element.muted !== false ? "muted" : "",
    element.kind === "video" ? "playsinline" : "",
    element.loop ? "loop" : "",
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
    stackIndex,
  });
  return `<div class="clip svml-visual-present" data-svml-track-id="${escapeHtml(track.id)}" data-svml-present-id="${escapeHtml(present.id)}" data-svml-stack-order="${present.stacking.order}" data-svml-stack-tie="${escapeHtml(present.stacking.tieBreak)}" data-track-index="${stackIndex}" data-start="${start}" data-duration="${duration}" style="position:absolute;inset:0;z-index:${stackIndex};overflow:hidden;pointer-events:none">${contents}</div>`;
}

function renderAnimationRules(track: VisualTrack, present: VisualPresent): string[] {
  const durationFrames = present.span.endFrameExclusive - present.span.startFrame;
  return present.elements.flatMap((element) => {
    if (element.animation === undefined) return [];
    const name = stableDomId(["animation", track.id, present.id, element.id]);
    const frames = element.animation.keyframes.map((keyframe) => {
      const easing = keyframe.easing === undefined ? "" : `;animation-timing-function:${keyframe.easing}`;
      return `${percentage(keyframe.atFrame, durationFrames)}{${css(keyframe.style)}${easing}}`;
    }).join("");
    return [`@keyframes ${name}{${frames}}`];
  });
}

function orderedVisualPresents(tracks: readonly Track[]): Array<{ readonly track: VisualTrack; readonly present: VisualPresent }> {
  return tracks
    .filter((track): track is VisualTrack => track.contract === "svml.visual-track@1")
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
    if (track.contract === "svml.audio-track@1") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind === "image" || element.kind === "video") add(element.artifact);
        if (element.kind === "surface") add(element.surface.artifact);
        if (element.kind === "text") {
          for (const font of element.fonts ?? []) add(font.artifact);
        }
      }
    }
  }
  return [...artifacts.values()].sort((left, right) => left.digest.localeCompare(right.digest));
}

function collectFonts(composition: Composition): FontArtifactRef[] {
  const fonts = new Map<string, FontArtifactRef>();
  for (const track of composition.tracks) {
    if (track.contract !== "svml.visual-track@1") continue;
    for (const present of track.presents) {
      for (const element of present.elements) {
        if (element.kind !== "text") continue;
        for (const font of element.fonts ?? []) fonts.set(digestOf(font), font);
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
  return collectFonts(composition).map((font) => [
    "@font-face{",
    `font-family:${exactFontFamily(font)};`,
    `src:url(\"${hyperframesArtifactUri(font.artifact.digest)}\") format(\"${fontFormat(font.artifact.mediaType)}\");`,
    `font-weight:${font.weight};`,
    `font-style:${font.style};`,
    "font-display:block;",
    "}",
  ].join("")).join("\n    ");
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
  <div data-composition-id="${escapeHtml(composition.id)}" data-start="0" data-no-timeline data-width="${composition.canvas.width}" data-height="${composition.canvas.height}" data-duration="${duration}" data-fps="${fps}" data-svml-frame-count="${frameCount}">
    ${visualHtml}
  </div>
</body>
</html>
`;
}

function normalizedDocument(value: HyperframesDocument): HyperframesDocument {
  return {
    contract: "svml.hyperframes-document@1",
    visualIr: value.visualIr,
    frameRate: { ...value.frameRate },
    frameCount: value.frameCount,
    canvas: { ...value.canvas },
    artifacts: [...value.artifacts]
      .map((artifact) => ({ ...artifact }))
      .sort((left, right) => left.digest.localeCompare(right.digest)),
    html: value.html,
  };
}

export function compileHyperframesDocument(composition: Composition, programSpace: ProgramSpace): HyperframesDocument {
  assertCompositionIdentity(composition, programSpace);
  const content = normalizedDocument({
    contract: "svml.hyperframes-document@1",
    visualIr: VISUAL_IR_V1,
    frameRate: { ...programSpace.frameRate },
    frameCount: programSpaceFrameCount(programSpace),
    canvas: {
      width: composition.canvas.width,
      height: composition.canvas.height,
    },
    artifacts: collectArtifacts(composition),
    html: emitHtml(composition, programSpace),
  });
  return content;
}

export function assertHyperframesDocument(document: HyperframesDocument): void {
  if (document.contract !== "svml.hyperframes-document@1") throw new Error("Unsupported HyperframesDocument contract.");
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
