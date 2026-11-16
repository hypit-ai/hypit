import {
  interpretMedia,
  resolveMedia,
  selectMediaStreams,
  verifyMediaInterpretation,
} from "@hypit/media";
import { assertTemporalMap, compareExactTemporalValues } from "@hypit/temporal/algebra";
import type {
  MediaAssetDocument,
  MediaAssetFile,
  MediaAssetFileResolver,
  MediaAssetInterpretationInput,
  MediaAssetReference,
  MediaRepresentationBinding,
  MediaRepresentationDeclaration,
  MediaRepresentationType,
  ResolvedMediaAsset,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object.`);
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const fields = new Set(allowed);
  for (const name of Object.keys(value)) assert(fields.has(name), `${subject} contains unknown field ${name}.`);
}

function identity(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${subject} is invalid.`);
}

function mediaType(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(value),
    `${subject} is invalid.`);
}

function portablePath(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${subject} must be a non-empty relative path.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${subject} must use a portable relative path.`);
  const normalized = value.startsWith("./") ? value.slice(2) : value;
  assert(normalized.length > 0 && normalized.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    `${subject} must not contain empty, current or parent segments.`);
}

export function verifyMediaAssetReference(value: unknown): asserts value is MediaAssetReference {
  const item = object(value, "MediaAssetReference");
  exactFields(item, ["path"], "MediaAssetReference");
  portablePath(item.path, "MediaAssetReference.path");
  assert((item.path as string).endsWith(".media.json"), "MediaAssetReference.path must name a .media.json manifest.");
}

function verifyFile(value: unknown, subject: string): asserts value is MediaAssetFile {
  const item = object(value, subject);
  exactFields(item, ["path", "mediaType"], subject);
  portablePath(item.path, `${subject}.path`);
  mediaType(item.mediaType, `${subject}.mediaType`);
}

function verifyRepresentationType(value: unknown, subject: string): asserts value is MediaRepresentationType {
  const item = object(value, subject);
  exactFields(item, ["package", "name"], subject);
  assert(typeof item.package === "string" && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(item.package),
    `${subject}.package is invalid.`);
  identity(item.name, `${subject}.name`);
}

function verifyBinding(value: unknown, interpretation: MediaAssetDocument["media"]["interpretation"], subject: string):
asserts value is MediaRepresentationBinding {
  const item = object(value, subject);
  exactFields(item, ["temporal", "picture", "audio"], subject);
  assert(item.temporal !== undefined || item.picture !== undefined || item.audio !== undefined,
    `${subject} must bind at least one media domain.`);
  if (item.temporal !== undefined) {
    const temporal = object(item.temporal, `${subject}.temporal`);
    exactFields(temporal, ["mapToMedia"], `${subject}.temporal`);
    assertTemporalMap(temporal.mapToMedia as never);
    assert(interpretation.domain !== undefined, `${subject}.temporal requires temporal media.`);
    const source = (temporal.mapToMedia as import("@hypit/temporal/algebra").TemporalMap).stages.at(-1)!.source;
    assert(source.id === interpretation.domain.id
      && compareExactTemporalValues(source.duration, interpretation.domain.duration) === 0,
    `${subject}.temporal must end in the Media Asset domain.`);
  }
  if (item.picture !== undefined) {
    const picture = object(item.picture, `${subject}.picture`);
    exactFields(picture, ["member", "space"], `${subject}.picture`);
    assert(picture.member === "picture" && picture.space === "media-display-normalized", `${subject}.picture is invalid.`);
    assert(interpretation.picture !== undefined, `${subject}.picture requires a picture member.`);
  }
  if (item.audio !== undefined) {
    const audio = object(item.audio, `${subject}.audio`);
    exactFields(audio, ["member"], `${subject}.audio`);
    assert(audio.member === "audio", `${subject}.audio is invalid.`);
    assert(interpretation.audio !== undefined, `${subject}.audio requires an audio member.`);
  }
}

function verifyRepresentation(
  value: unknown,
  interpretation: MediaAssetDocument["media"]["interpretation"],
  subject: string,
): asserts value is MediaRepresentationDeclaration {
  const item = object(value, subject);
  exactFields(item, ["id", "type", "document", "resources", "binding"], subject);
  identity(item.id, `${subject}.id`);
  verifyRepresentationType(item.type, `${subject}.type`);
  verifyFile(item.document, `${subject}.document`);
  const resources = object(item.resources, `${subject}.resources`);
  for (const [name, file] of Object.entries(resources)) {
    identity(name, `${subject}.resources name`);
    verifyFile(file, `${subject}.resources.${name}`);
  }
  verifyBinding(item.binding, interpretation, `${subject}.binding`);
}

export function verifyMediaAssetDocument(value: unknown): asserts value is MediaAssetDocument {
  const document = object(value, "MediaAssetDocument");
  exactFields(document, ["format", "media", "representations"], "MediaAssetDocument");
  assert(document.format === "hypit.media-asset", "Unsupported Media Asset document format.");
  const media = object(document.media, "MediaAssetDocument.media");
  exactFields(media, ["file", "interpretation"], "MediaAssetDocument.media");
  verifyFile(media.file, "MediaAssetDocument.media.file");
  verifyMediaInterpretation(media.interpretation);
  assert(Array.isArray(document.representations), "MediaAssetDocument.representations must be an array.");
  const ids = new Set<string>();
  document.representations.forEach((representation, index) => {
    verifyRepresentation(representation, media.interpretation as MediaAssetDocument["media"]["interpretation"],
      `MediaAssetDocument.representations[${index}]`);
    assert(!ids.has(representation.id), `MediaAssetDocument repeats Representation ${representation.id}.`);
    ids.add(representation.id);
  });
}

export function sealMediaAssetDocument(value: MediaAssetDocument): MediaAssetDocument {
  verifyMediaAssetDocument(value);
  return structuredClone(value);
}

export function parseMediaAssetDocument(text: string): MediaAssetDocument {
  return sealMediaAssetDocument(JSON.parse(text) as MediaAssetDocument);
}

export function serializeMediaAssetDocument(value: MediaAssetDocument): string {
  verifyMediaAssetDocument(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function createMediaAssetDocumentFromInspection(input: MediaAssetInterpretationInput): MediaAssetDocument {
  const selection = selectMediaStreams(input.inspection, input.selection);
  return sealMediaAssetDocument({
    format: "hypit.media-asset",
    media: {
      file: structuredClone(input.file),
      interpretation: interpretMedia({ mediaType: input.file.mediaType, inspection: input.inspection, selection }),
    },
    representations: [],
  });
}

export function attachMediaRepresentation(
  value: MediaAssetDocument,
  representation: MediaRepresentationDeclaration,
): MediaAssetDocument {
  const document = sealMediaAssetDocument(value);
  assert(!document.representations.some((candidate) => candidate.id === representation.id),
    `Media Asset already has Representation ${representation.id}.`);
  return sealMediaAssetDocument({ ...document, representations: [...document.representations, structuredClone(representation)] });
}

export function replaceMediaRepresentation(
  value: MediaAssetDocument,
  id: string,
  representation: MediaRepresentationDeclaration,
): MediaAssetDocument {
  const document = sealMediaAssetDocument(value);
  assert(representation.id === id, `Replacement Representation must keep local identity ${id}.`);
  assert(document.representations.some((candidate) => candidate.id === id), `Media Asset has no Representation ${id}.`);
  return sealMediaAssetDocument({
    ...document,
    representations: document.representations.map((candidate) => candidate.id === id
      ? structuredClone(representation) : candidate),
  });
}

export function detachMediaRepresentation(value: MediaAssetDocument, id: string): MediaAssetDocument {
  const document = sealMediaAssetDocument(value);
  assert(document.representations.some((candidate) => candidate.id === id), `Media Asset has no Representation ${id}.`);
  return sealMediaAssetDocument({
    ...document,
    representations: document.representations.filter((candidate) => candidate.id !== id),
  });
}

async function resolveFile(
  file: MediaAssetFile,
  resolver: MediaAssetFileResolver,
  resolution: Parameters<MediaAssetFileResolver>[1],
) {
  const resource = await resolver(structuredClone(file), resolution);
  assert(typeof resource.address === "string" && resource.address.length > 0, `${resolution.kind} resource address is empty.`);
  assert(resource.mediaType === file.mediaType,
    `${resolution.kind} file ${file.path} resolved as ${resource.mediaType}, expected ${file.mediaType}.`);
  return structuredClone(resource);
}

export async function resolveMediaAssetMedia(value: MediaAssetDocument, resolver: MediaAssetFileResolver) {
  const document = sealMediaAssetDocument(value);
  const resource = await resolveFile(document.media.file, resolver, { kind: "media" });
  return resolveMedia(resource, document.media.interpretation);
}

export async function resolveMediaAssetDocument(
  value: MediaAssetDocument,
  resolver: MediaAssetFileResolver,
): Promise<ResolvedMediaAsset> {
  const document = sealMediaAssetDocument(value);
  const [media, representations] = await Promise.all([
    resolveMediaAssetMedia(document, resolver),
    Promise.all(document.representations.map(async (representation) => {
      const [representationDocument, resources] = await Promise.all([
        resolveFile(representation.document, resolver, {
          kind: "representation", representation: representation.id, type: representation.type,
        }),
        Promise.all(Object.entries(representation.resources).map(async ([name, file]) => [name, await resolveFile(file, resolver, {
          kind: "representation-resource", representation: representation.id, type: representation.type, resource: name,
        })] as const)),
      ]);
      return { ...representation, document: representationDocument, resources: Object.fromEntries(resources) };
    })),
  ]);
  return structuredClone({ media, representations });
}
