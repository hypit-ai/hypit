import { canonicalize } from "@hypit/protocol";
import { isModuleRef } from "@hypit/module";

import { sceneAssetFormat } from "./types.js";

import type {
  SceneAssetDocument,
  SceneAssetFile,
  SceneAssetReference,
  ScenePackageSymbol,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function exactFields(value: Readonly<Record<string, unknown>>, allowed: readonly string[], label: string): void {
  const fields = new Set(allowed);
  for (const field of Object.keys(value)) assert(fields.has(field), `${label} contains unknown field ${field}.`);
}

function identity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function name(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is empty.`);
}

function portableReferencePath(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty relative path.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${label} must use a portable relative path.`);
  assert(value.split("/").every((part) => part.length > 0 && part !== "."),
    `${label} must not contain empty or current segments.`);
}

function portableOwnedPath(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty relative path.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${label} must use a portable relative path.`);
  const relative = value.startsWith("./") ? value.slice(2) : value;
  assert(relative.length > 0 && relative.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    `${label} must name a file without current or parent segments.`);
}

function mediaType(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(value),
    `${label} is invalid.`);
}

function symbol(value: unknown, label: string): asserts value is ScenePackageSymbol {
  object(value, label);
  exactFields(value, ["module", "name"], label);
  assert(isModuleRef(value.module), `${label}.module is invalid.`);
  identity(value.name, `${label}.name`);
}

function file(value: unknown, label: string): asserts value is SceneAssetFile {
  object(value, label);
  exactFields(value, ["path", "mediaType"], label);
  portableOwnedPath(value.path, `${label}.path`);
  mediaType(value.mediaType, `${label}.mediaType`);
}

export function assertSceneAssetReference(value: unknown): asserts value is SceneAssetReference {
  object(value, "SceneAssetReference");
  exactFields(value, ["path"], "SceneAssetReference");
  portableReferencePath(value.path, "SceneAssetReference.path");
  assert(value.path.endsWith(".scene-asset.json"), "SceneAssetReference.path must name a .scene-asset.json document.");
}

export function assertSceneAssetDocument(value: unknown): asserts value is SceneAssetDocument {
  object(value, "SceneAssetDocument");
  exactFields(value, ["format", "id", "name", "using", "preview", "resources", "parameters"], "SceneAssetDocument");
  assert(value.format === sceneAssetFormat, "Unsupported Scene Asset document format.");
  identity(value.id, "SceneAssetDocument.id");
  name(value.name, "SceneAssetDocument.name");
  symbol(value.using, "SceneAssetDocument.using");
  if (value.preview !== undefined) file(value.preview, "SceneAssetDocument.preview");
  object(value.resources, "SceneAssetDocument.resources");
  for (const [resourceName, resource] of Object.entries(value.resources)) {
    identity(resourceName, "SceneAssetDocument resource name");
    file(resource, `SceneAssetDocument.resources.${resourceName}`);
  }
  canonicalize(value.parameters);
}

export function sealSceneAssetDocument(value: SceneAssetDocument): SceneAssetDocument {
  assertSceneAssetDocument(value);
  return structuredClone(value);
}

export function parseSceneAssetDocument(text: string): SceneAssetDocument {
  return sealSceneAssetDocument(JSON.parse(text) as SceneAssetDocument);
}

export function serializeSceneAssetDocument(value: SceneAssetDocument): string {
  assertSceneAssetDocument(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}
