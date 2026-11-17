import { verifyPictureInterpretation, type MediaResource } from "@hypit/media";
import { assertExactTemporalValue } from "@hypit/temporal/algebra";
import { assertHtmlPictureReconstruction } from "./reconstruction.js";
import type { HtmlArtifact, HtmlArtifactUsage, HtmlFrameSpan, HtmlProgram, HtmlVideoSource } from "./types.js";

const ARTIFACT_URI = /hypit-artifact:\/\/([A-Za-z][A-Za-z0-9._:-]*)/gu;
const IDENTITY = /^[A-Za-z][A-Za-z0-9._:-]{0,191}$/u;

function assertResource(value: MediaResource, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.address !== "string" || value.address.length === 0
    || typeof value.mediaType !== "string" || value.mediaType.length === 0
    || (value.size !== undefined && (!Number.isSafeInteger(value.size) || value.size < 0))) {
    throw new Error(`${label} is invalid.`);
  }
}

function assertSpan(value: HtmlFrameSpan, frameCount: number, label: string): void {
  if (!Number.isSafeInteger(value.startFrame) || !Number.isSafeInteger(value.endFrameExclusive)
    || value.startFrame < 0 || value.endFrameExclusive <= value.startFrame
    || value.endFrameExclusive > frameCount) throw new Error(`${label} is outside the Programme frame domain.`);
}

function assertUsage(value: HtmlArtifactUsage, frameCount: number, label: string): void {
  if (value.kind === "never" || value.kind === "always") return;
  if (value.kind !== "frames" || !Array.isArray(value.spans) || value.spans.length === 0) {
    throw new Error(`${label} is invalid.`);
  }
  let end = -1;
  for (const [index, span] of value.spans.entries()) {
    assertSpan(span, frameCount, `${label}.${index}`);
    if (span.startFrame < end) throw new Error(`${label} must contain ordered, disjoint spans.`);
    end = span.endFrameExclusive;
  }
}

export function htmlArtifactUrl(id: string): string {
  if (!IDENTITY.test(id)) throw new Error("HTML Programme Artifact id is invalid.");
  return `hypit-artifact://${id}`;
}

export function assertHtmlProgram(value: HtmlProgram): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("HTML Programme must be an object.");
  if (!Number.isSafeInteger(value.frameRate.numerator) || value.frameRate.numerator <= 0
    || !Number.isSafeInteger(value.frameRate.denominator) || value.frameRate.denominator <= 0) {
    throw new Error("HTML Programme frame rate is invalid.");
  }
  if (!Number.isSafeInteger(value.frameCount) || value.frameCount <= 0) throw new Error("HTML Programme frame count is invalid.");
  if (!Number.isSafeInteger(value.canvas.width) || value.canvas.width <= 0
    || !Number.isSafeInteger(value.canvas.height) || value.canvas.height <= 0
    || typeof value.canvas.background !== "string" || value.canvas.background.length === 0) {
    throw new Error("HTML Programme canvas is invalid.");
  }
  if (typeof value.html !== "string" || !value.html.startsWith("<!doctype html>")) throw new Error("HTML Programme document is invalid.");
  const artifactIds = new Set<string>();
  for (const artifact of value.artifacts) {
    if (!IDENTITY.test(artifact.id) || artifactIds.has(artifact.id)) throw new Error(`HTML Programme Artifact ${artifact.id} is invalid or repeated.`);
    artifactIds.add(artifact.id);
    assertResource(artifact.resource, `HTML Programme Artifact ${artifact.id}`);
    assertUsage(artifact.usage, value.frameCount, `HTML Programme Artifact ${artifact.id} usage`);
    if (artifact.kind === "picture") verifyPictureInterpretation(artifact.picture,
      `HTML Programme Artifact ${artifact.id} Picture`);
  }
  const referenced = new Set([...value.html.matchAll(ARTIFACT_URI)].map((match) => match[1]!));
  if (referenced.size !== artifactIds.size || [...referenced].some((id) => !artifactIds.has(id))) {
    throw new Error("HTML Programme Artifact placeholders do not match its declared dependencies.");
  }
  const sourceIds = new Set<string>();
  for (const source of value.videoSources) {
    if (!IDENTITY.test(source.id) || sourceIds.has(source.id) || !IDENTITY.test(source.elementId)) {
      throw new Error(`HTML Programme Video Source ${source.id} is invalid or repeated.`);
    }
    sourceIds.add(source.id);
    assertResource(source.resource, `HTML Programme Video Source ${source.id}`);
    if (!Number.isSafeInteger(source.interpretation.codedWidth) || source.interpretation.codedWidth <= 0
      || !Number.isSafeInteger(source.interpretation.codedHeight) || source.interpretation.codedHeight <= 0
      || !Number.isSafeInteger(source.interpretation.sampleAspectRatio.numerator)
      || source.interpretation.sampleAspectRatio.numerator <= 0
      || !Number.isSafeInteger(source.interpretation.sampleAspectRatio.denominator)
      || source.interpretation.sampleAspectRatio.denominator <= 0
      || ![0, 90, 180, 270].includes(source.interpretation.rotationDegrees)) {
      throw new Error(`HTML Programme Video Source ${source.id} interpretation is invalid.`);
    }
    verifyPictureInterpretation(source.interpretation.picture,
      `HTML Programme Video Source ${source.id} Picture`);
    if (!Number.isSafeInteger(source.streamIndex) || source.streamIndex < 0
      || source.sourceFrames.length !== value.frameCount) throw new Error(`HTML Programme Video Source ${source.id} plan is invalid.`);
    assertUsage(source.usage, value.frameCount, `HTML Programme Video Source ${source.id} usage`);
    if (source.reconstruction !== undefined) assertHtmlPictureReconstruction(source.reconstruction);
    for (const [frame, sample] of source.sourceFrames.entries()) {
      if (sample !== null) {
        assertExactTemporalValue(sample.position, `HTML Programme Video Source ${source.id} frame ${frame}`);
        if (sample.side !== "before" && sample.side !== "after") {
          throw new Error(`HTML Programme Video Source ${source.id} frame ${frame} side is invalid.`);
        }
      }
    }
  }
}

function overlaps(usage: HtmlArtifactUsage, selection?: readonly HtmlFrameSpan[]): boolean {
  return usage.kind === "always" || usage.kind === "frames"
    && (selection === undefined || usage.spans.some((left) => selection.some((right) =>
      left.startFrame < right.endFrameExclusive && right.startFrame < left.endFrameExclusive)));
}

export function selectHtmlArtifacts(program: HtmlProgram, selection?: readonly HtmlFrameSpan[]): readonly HtmlArtifact[] {
  assertHtmlProgram(program);
  return program.artifacts.filter((artifact) => overlaps(artifact.usage, selection));
}

export function selectHtmlVideoSources(program: HtmlProgram, selection?: readonly HtmlFrameSpan[]): readonly HtmlVideoSource[] {
  assertHtmlProgram(program);
  return program.videoSources.filter((source) => overlaps(source.usage, selection));
}

export function materializeHtmlProgram(program: HtmlProgram, resolve: (resource: MediaResource, id: string) => string): string {
  assertHtmlProgram(program);
  const resources = new Map(program.artifacts.map((artifact) => [artifact.id, artifact.resource]));
  return program.html.replace(ARTIFACT_URI, (_value, id: string) => {
    const resource = resources.get(id);
    if (resource === undefined) throw new Error(`HTML Programme Artifact ${id} is undeclared.`);
    return resolve(resource, id).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  });
}

export function sealHtmlProgram(value: HtmlProgram): HtmlProgram {
  assertHtmlProgram(value);
  return structuredClone(value);
}
