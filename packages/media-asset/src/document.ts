import { verifyPreparedMedia } from "@hypit/media";
import { assertBlobRef, isTypeRef } from "@hypit/protocol";
import {
  assertTemporalMap,
  compareExactTemporalValues,
} from "@hypit/temporal/algebra";

import type {
  MediaAssetDocument,
  MediaAssetFile,
  MediaAssetFileResolver,
  MediaRepresentationBinding,
  MediaRepresentationDeclaration,
  PreparedMediaAsset,
  PreparedMediaFileValue,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object.`);
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const names = new Set(allowed);
  for (const name of Object.keys(value)) {
    assert(names.has(name), `${subject} contains unknown field ${name}.`);
  }
}

function identity(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value),
    `${subject} is invalid.`);
}

function mediaType(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string"
    && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(value), `${subject} is invalid.`);
}

function portablePath(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${subject} must be a non-empty relative path.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${subject} must use a portable relative path.`);
  const relative = value.startsWith("./") ? value.slice(2) : value;
  assert(relative.length > 0, `${subject} must name a file.`);
  assert(relative.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    `${subject} must not contain empty, current or parent segments.`);
}

function verifyFile(value: unknown, subject: string): asserts value is MediaAssetFile {
  const item = object(value, subject);
  exactFields(item, ["path", "mediaType"], subject);
  portablePath(item.path, `${subject}.path`);
  mediaType(item.mediaType, `${subject}.mediaType`);
}

function verifyType(value: unknown, subject: string): void {
  assert(isTypeRef(value), `${subject} must be a TypeRef.`);
  const item = object(value, subject);
  exactFields(item, ["module", "name"], subject);
  exactFields(object(item.module, `${subject}.module`), ["name", "version"], `${subject}.module`);
}

function preparedWithValidationSource(value: PreparedMediaFileValue) {
  return {
    ...value,
    source: {
      kind: "blob" as const,
      resource: "res_media-asset-validation" as const,
      size: 0,
      mediaType: "application/octet-stream",
    },
  };
}

function verifyBinding(
  value: unknown,
  prepared: PreparedMediaFileValue,
  subject: string,
): asserts value is MediaRepresentationBinding {
  const item = object(value, subject);
  exactFields(item, ["temporal", "picture", "audio"], subject);
  assert(item.temporal !== undefined || item.picture !== undefined || item.audio !== undefined,
    `${subject} must bind at least one media domain.`);

  if (item.temporal !== undefined) {
    const temporal = object(item.temporal, `${subject}.temporal`);
    exactFields(temporal, ["mapToMedia"], `${subject}.temporal`);
    assertTemporalMap(temporal.mapToMedia as never);
    assert(prepared.domain !== undefined, `${subject}.temporal requires temporal PreparedMedia.`);
    const source = (temporal.mapToMedia as import("@hypit/temporal/algebra").TemporalMap).stages.at(-1)!.source;
    assert(source.id === prepared.domain.id
      && compareExactTemporalValues(source.duration, prepared.domain.duration) === 0,
    `${subject}.temporal must end in PreparedMedia domain ${prepared.domain.id}.`);
  }

  if (item.picture !== undefined) {
    const picture = object(item.picture, `${subject}.picture`);
    exactFields(picture, ["member", "space"], `${subject}.picture`);
    assert(picture.member === "picture" && picture.space === "prepared-display-normalized",
      `${subject}.picture is invalid.`);
    assert(prepared.picture !== undefined, `${subject}.picture requires a PreparedMedia picture member.`);
  }

  if (item.audio !== undefined) {
    const audio = object(item.audio, `${subject}.audio`);
    exactFields(audio, ["member"], `${subject}.audio`);
    assert(audio.member === "audio", `${subject}.audio is invalid.`);
    assert(prepared.audio !== undefined, `${subject}.audio requires a PreparedMedia audio member.`);
  }
}

function verifyRepresentation(
  value: unknown,
  prepared: PreparedMediaFileValue,
  subject: string,
): asserts value is MediaRepresentationDeclaration {
  const item = object(value, subject);
  exactFields(item, ["id", "type", "document", "resources", "binding"], subject);
  identity(item.id, `${subject}.id`);
  verifyType(item.type, `${subject}.type`);
  verifyFile(item.document, `${subject}.document`);
  const resources = object(item.resources, `${subject}.resources`);
  for (const [name, file] of Object.entries(resources)) {
    identity(name, `${subject}.resources name`);
    verifyFile(file, `${subject}.resources.${name}`);
  }
  verifyBinding(item.binding, prepared, `${subject}.binding`);
}

export function verifyMediaAssetDocument(value: unknown): asserts value is MediaAssetDocument {
  const document = object(value, "MediaAssetDocument");
  exactFields(document, ["format", "id", "media", "representations"], "MediaAssetDocument");
  assert(document.format === "hypit.media-asset@1", "Unsupported Media Asset document format.");
  identity(document.id, "MediaAssetDocument.id");

  const media = object(document.media, "MediaAssetDocument.media");
  exactFields(media, ["file", "prepared"], "MediaAssetDocument.media");
  verifyFile(media.file, "MediaAssetDocument.media.file");
  const prepared = object(media.prepared, "MediaAssetDocument.media.prepared") as PreparedMediaFileValue;
  assert(!("source" in prepared), "MediaAssetDocument.media.prepared must not contain an execution BlobRef.");
  verifyPreparedMedia(preparedWithValidationSource(prepared));

  assert(Array.isArray(document.representations), "MediaAssetDocument.representations must be an array.");
  const representationIds = new Set<string>();
  document.representations.forEach((representation, index) => {
    verifyRepresentation(representation, prepared, `MediaAssetDocument.representations[${index}]`);
    assert(!representationIds.has(representation.id),
      `MediaAssetDocument repeats representation ${representation.id}.`);
    representationIds.add(representation.id);
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

async function resolveFile(
  file: MediaAssetFile,
  resolver: MediaAssetFileResolver,
  resolution: Parameters<MediaAssetFileResolver>[1],
): Promise<import("@hypit/protocol").BlobRef> {
  const blob = await resolver(structuredClone(file), resolution);
  assertBlobRef(blob, `${resolution.kind} file ${file.path}`);
  assert(blob.mediaType === file.mediaType,
    `${resolution.kind} file ${file.path} resolved as ${blob.mediaType}, expected ${file.mediaType}.`);
  return structuredClone(blob);
}

/** Resolve only explicit files; representation contents stay owned by their packages. */
export async function resolveMediaAssetDocument(
  value: MediaAssetDocument,
  resolver: MediaAssetFileResolver,
): Promise<PreparedMediaAsset> {
  const document = sealMediaAssetDocument(value);
  const [source, representations] = await Promise.all([
    resolveFile(document.media.file, resolver, { kind: "media" }),
    Promise.all(document.representations.map(async (representation) => {
      const [representationDocument, resources] = await Promise.all([
        resolveFile(representation.document, resolver, {
          kind: "representation",
          representation: representation.id,
          type: representation.type,
        }),
        Promise.all(Object.entries(representation.resources).map(async ([name, file]) => [
          name,
          await resolveFile(file, resolver, {
            kind: "representation-resource",
            representation: representation.id,
            type: representation.type,
            resource: name,
          }),
        ] as const)),
      ]);
      return {
        id: representation.id,
        type: representation.type,
        document: representationDocument,
        resources: Object.fromEntries(resources),
        binding: representation.binding,
      };
    })),
  ]);
  const media = { ...document.media.prepared, source };
  verifyPreparedMedia(media);
  return {
    id: document.id,
    media: structuredClone(media),
    representations: structuredClone(representations),
  };
}
