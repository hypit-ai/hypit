import type {
  SceneLibraryCollection,
  SceneLibraryDocument,
  SceneLibraryEntry,
  SceneLibraryReference,
} from "./types.js";
import { sceneLibraryFormat } from "./types.js";

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

function text(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is empty.`);
}

function portableReferencePath(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty relative path.`);
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    `${label} must use a portable relative path.`);
  assert(value.split("/").every((part) => part.length > 0 && part !== "."),
    `${label} must not contain empty or current segments.`);
}

export function assertSceneLibraryReference(value: unknown): asserts value is SceneLibraryReference {
  object(value, "SceneLibraryReference");
  exactFields(value, ["path"], "SceneLibraryReference");
  portableReferencePath(value.path, "SceneLibraryReference.path");
  assert(value.path.endsWith(".scene-library.json"),
    "SceneLibraryReference.path must name a .scene-library.json document.");
}

function collection(value: unknown, identities: Set<string>, label: string): asserts value is SceneLibraryCollection {
  object(value, label);
  exactFields(value, ["id", "label", "icon", "children"], label);
  identity(value.id, `${label}.id`);
  assert(!identities.has(value.id), `Scene Library repeats Collection ${value.id}.`);
  identities.add(value.id);
  text(value.label, `${label}.label`);
  if (value.icon !== undefined) identity(value.icon, `${label}.icon`);
  assert(Array.isArray(value.children), `${label}.children must be an array.`);
  value.children.forEach((child, index) => collection(child, identities, `${label}.children[${index}]`));
}

function entry(value: unknown, collections: ReadonlySet<string>, label: string): asserts value is SceneLibraryEntry {
  object(value, label);
  exactFields(value, ["id", "label", "description", "asset", "collections", "tags"], label);
  identity(value.id, `${label}.id`);
  text(value.label, `${label}.label`);
  if (value.description !== undefined) text(value.description, `${label}.description`);
  object(value.asset, `${label}.asset`);
  exactFields(value.asset, ["path"], `${label}.asset`);
  portableReferencePath(value.asset.path, `${label}.asset.path`);
  assert(value.asset.path.endsWith(".scene-asset.json"), `${label}.asset.path must name a .scene-asset.json document.`);
  assert(Array.isArray(value.collections) && value.collections.length > 0, `${label}.collections must not be empty.`);
  const memberships = new Set<string>();
  for (const membership of value.collections) {
    identity(membership, `${label}.collections entry`);
    assert(collections.has(membership), `${label} refers to missing Collection ${membership}.`);
    assert(!memberships.has(membership), `${label} repeats Collection ${membership}.`);
    memberships.add(membership);
  }
  assert(Array.isArray(value.tags), `${label}.tags must be an array.`);
  const tags = new Set<string>();
  for (const tag of value.tags) {
    text(tag, `${label}.tags entry`);
    assert(!tags.has(tag), `${label} repeats tag ${tag}.`);
    tags.add(tag);
  }
}

export function assertSceneLibraryDocument(value: unknown): asserts value is SceneLibraryDocument {
  object(value, "SceneLibraryDocument");
  exactFields(value, ["format", "id", "name", "collections", "entries"], "SceneLibraryDocument");
  assert(value.format === sceneLibraryFormat, "Unsupported Scene Library document format.");
  identity(value.id, "SceneLibraryDocument.id");
  text(value.name, "SceneLibraryDocument.name");
  assert(Array.isArray(value.collections), "SceneLibraryDocument.collections must be an array.");
  const collections = new Set<string>();
  value.collections.forEach((item, index) => collection(item, collections, `SceneLibraryDocument.collections[${index}]`));
  assert(Array.isArray(value.entries), "SceneLibraryDocument.entries must be an array.");
  const entries = new Set<string>();
  value.entries.forEach((item, index) => {
    entry(item, collections, `SceneLibraryDocument.entries[${index}]`);
    assert(!entries.has(item.id), `Scene Library repeats Entry ${item.id}.`);
    entries.add(item.id);
  });
}

export function sealSceneLibraryDocument(value: SceneLibraryDocument): SceneLibraryDocument {
  assertSceneLibraryDocument(value);
  return structuredClone(value);
}

export function parseSceneLibraryDocument(source: string): SceneLibraryDocument {
  return sealSceneLibraryDocument(JSON.parse(source) as SceneLibraryDocument);
}

export function serializeSceneLibraryDocument(value: SceneLibraryDocument): string {
  assertSceneLibraryDocument(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}
