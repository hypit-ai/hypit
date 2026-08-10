import { artifactTypes } from "@narratage/artifact";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, MarkupAttributeValue } from "@narratage/markup";

import { synchronizedMediaFragment } from "./fragment.js";
import { mediaPipelineTypes } from "./manifest.js";
import { sealMediaSelectionRequest } from "./selection.js";
import type { MediaSelectionRequest } from "./types.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be non-empty text.`);
  return value.trim();
}

function ref(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, artifactTypes.blob)) throw new Error(`${label} must resolve to BlobArtifact.`);
  return value;
}

function stream(value: string, kind: "video"): MediaSelectionRequest["video"];
function stream(value: string, kind: "audio"): MediaSelectionRequest["audio"];
function stream(value: string, kind: "video" | "audio"): MediaSelectionRequest["video"] | MediaSelectionRequest["audio"] {
  if (kind === "video" && value === "primary-moving") return { mode: "primary-moving" };
  if (kind === "audio" && value === "default") return { mode: "default" };
  if (value === "none") return { mode: "none" };
  const match = /^stream:(\d+)$/u.exec(value);
  if (match === null) throw new Error(`${kind} must be ${kind === "video" ? "primary-moving" : "default"}, none or stream:<index>.`);
  return { mode: "stream-index", streamIndex: Number(match[1]) };
}

function frameRate(value: string): { readonly numerator: number; readonly denominator: number } {
  const match = /^(\d+)(?:\/(\d+))?$/u.exec(value);
  if (match === null) throw new Error("Normalize.frame-rate must be a positive rational such as 30 or 30000/1001.");
  const numerator = Number(match[1]);
  const denominator = Number(match[2] ?? "1");
  if (!Number.isSafeInteger(numerator) || numerator < 1 || !Number.isSafeInteger(denominator) || denominator < 1) {
    throw new Error("Normalize.frame-rate is invalid.");
  }
  return { numerator, denominator };
}

export const decodeSynchronizedMediaSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const expected = ["audio", "frame-rate", "id", "source", "span-authority", "video"];
  if (Object.keys(element.attributes).sort().join("\0") !== expected.sort().join("\0")) {
    throw new Error(`${element.name} requires exactly id, source, video, audio, span-authority and frame-rate.`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty.`);
  }
  const id = text(element, "id");
  const source = ref(element.attributes.source, `${element.name}.source`, resolveReference);
  const video = stream(text(element, "video"), "video");
  const audio = stream(text(element, "audio"), "audio");
  const spanAuthority = text(element, "span-authority");
  if (spanAuthority !== "video" && spanAuthority !== "audio") throw new Error(`${element.name}.span-authority must be video or audio.`);
  const request = sealMediaSelectionRequest({
    contract: "svml.media-selection-request@1",
    video,
    audio,
    spanAuthority,
    frameRate: frameRate(text(element, "frame-rate")),
  });
  const requestId = `${id}.request`;
  return {
    records: [{ id: requestId, type: mediaPipelineTypes.selectionRequest, value: { kind: "inline", value: request }, range: element.range }],
    components: [{
      id,
      fragment: synchronizedMediaFragment.id,
      inputs: { source: source.ref, request: { kind: "record", id: requestId } },
      outputs: { media: `${id}.media` },
      range: element.range,
    }],
    fragments: [synchronizedMediaFragment],
  };
};
