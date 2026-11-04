import { verifyPictureInterpretation, verifyPreparedVisualSource } from "@hypit/media";
import { assertFrameSpan } from "@hypit/temporal";
import type { FrameSpan } from "@hypit/temporal";
import {
  assertTemporalMap,
  compareExactTemporalValues,
  exactTemporalValueFromFrames,
} from "@hypit/temporal";
import { assertBlobRef } from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";

import type {
  HtmlArtifact,
  HtmlProgram,
  HtmlVideoSource,
  ResourceUrlResolver,
} from "./types.js";

const NANOSECONDS = 1_000_000_000n;
const ARTIFACT_URI = /hypit-artifact:\/\/([A-Za-z][A-Za-z0-9._:-]*)/gu;
const PROGRAM_RESOURCE_ID = /^[A-Za-z][A-Za-z0-9._:-]*$/u;

function isBlobRef(value: unknown): value is BlobRef {
  try {
    assertBlobRef(value);
    return true;
  } catch {
    return false;
  }
}

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

export function htmlArtifactUri(id: string): string {
  if (!PROGRAM_RESOURCE_ID.test(id)) throw new Error("HTML Programme Artifact id is invalid.");
  return `hypit-artifact://${id}`;
}

export function assertHtmlProgram(document: HtmlProgram): void {
  if (document === null || typeof document !== "object" || Array.isArray(document)
    || Object.keys(document).some((key) => ![
      "frameRate", "frameCount", "canvas", "artifacts", "videoSources", "html",
    ].includes(key))) {
    throw new Error("HtmlProgram contains fields outside the Picture terminal contract.");
  }
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
  ) throw new Error("HtmlProgram frame domain or canvas is invalid.");
  if (!document.html.startsWith("<!doctype html>")) throw new Error("HtmlProgram HTML is invalid.");
  const declared = [...document.artifacts];
  if (declared.some((entry) => {
    if (typeof entry?.id !== "string" || !PROGRAM_RESOURCE_ID.test(entry.id)) return true;
    if (!isBlobRef(entry?.artifact)) return true;
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
  if (!Array.isArray(document.videoSources) || document.videoSources.some((source) =>
    Object.keys(source ?? {}).some((key) => ![
      "id", "elementId", "kind", "startFrame", "endFrameExclusive", "usage", "source", "sampling", "reconstruction",
    ].includes(key))
    || typeof source?.id !== "string" || source.id.length === 0
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
    || source.kind !== "media"
    || (source.reconstruction !== undefined && source.reconstruction.kind !== "nearest") || (() => {
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
    })())) {
    throw new Error("HtmlProgram video-source plan is invalid.");
  }
  if (new Set(document.videoSources.map((source) => source.id)).size !== document.videoSources.length) {
    throw new Error("HtmlProgram video-source identities must be unique.");
  }
}

export function assertHtmlFrameIndex(document: HtmlProgram, frame: number): void {
  assertHtmlProgram(document);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= document.frameCount) {
    throw new Error(`HTML renderer frame ${frame} is outside [0, ${document.frameCount}).`);
  }
}

export function assertHtmlFrameSpan(document: HtmlProgram, span: FrameSpan): void {
  assertHtmlProgram(document);
  try {
    assertFrameSpan(span, document.frameCount);
  } catch {
    throw new Error(
      `HTML renderer frame span [${span.startFrame}, ${span.endFrameExclusive}) is outside [0, ${document.frameCount}).`,
    );
  }
}

function assertHTMLFrameSelection(document: HtmlProgram, selection: readonly FrameSpan[]): void {
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

function frameSpansOverlap(usage: readonly FrameSpan[], selection: readonly FrameSpan[]): boolean {
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

export function selectHtmlVideoSources(
  document: HtmlProgram,
  frameSelection?: readonly FrameSpan[],
): readonly HtmlVideoSource[] {
  assertHtmlProgram(document);
  if (frameSelection !== undefined) assertHTMLFrameSelection(document, frameSelection);
  return document.videoSources.filter((source) => source.usage.kind === "frames"
    && (frameSelection === undefined || frameSpansOverlap(source.usage.spans, frameSelection)));
}

export function materializeHtmlProgram(document: HtmlProgram, resolve: ResourceUrlResolver): string {
  assertHtmlProgram(document);
  const artifacts = new Map(document.artifacts.map((entry) => [entry.id, entry.artifact]));
  return document.html.replace(ARTIFACT_URI, (_uri, id: string) => {
    const artifact = artifacts.get(id);
    if (artifact === undefined) throw new Error(`HTML renderer Programme Artifact ${id} is undeclared.`);
    return escapeHtml(resolve(artifact, id));
  });
}

export const htmlProgramTime = { frameSeconds, fpsDecimal, fpsRational } as const;
