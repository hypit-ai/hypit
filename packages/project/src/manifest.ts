import { projectManifestFormat, type ProjectManifest, type ProjectPackageSelection } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function exactFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  const accepted = new Set(fields);
  const unknown = Object.keys(value).filter((field) => !accepted.has(field));
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  assert(unknown.length === 0, `${label} has unknown fields: ${unknown.join(", ")}.`);
  assert(missing.length === 0, `${label} is missing fields: ${missing.join(", ")}.`);
}

export function assertNpmPackageName(value: unknown, label = "npm package name"): asserts value is string {
  assert(typeof value === "string"
    && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(value), `${label} is invalid.`);
}

export function assertProjectIdentity(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertSelection(value: unknown, index: number): asserts value is ProjectPackageSelection {
  const label = `Project packages[${index}]`;
  record(value, label);
  exactFields(value, ["name", "catalog"], label);
  assertNpmPackageName(value.name, `${label}.name`);
  assert(Array.isArray(value.catalog), `${label}.catalog must be an array.`);
  const ids = new Set<string>();
  value.catalog.forEach((id, offeringIndex) => {
    assertProjectIdentity(id, `${label}.catalog[${offeringIndex}]`);
    assert(!ids.has(id), `${label}.catalog repeats ${id}.`);
    ids.add(id);
  });
}

export function assertProjectManifest(value: unknown): asserts value is ProjectManifest {
  record(value, "Project manifest");
  exactFields(value, ["format", "name", "packages"], "Project manifest");
  assert(value.format === projectManifestFormat, `Project manifest format must be ${projectManifestFormat}.`);
  assert(typeof value.name === "string" && value.name.trim().length > 0,
    "Project manifest name must be non-empty text.");
  assert(Array.isArray(value.packages), "Project manifest packages must be an array.");
  const packages = new Set<string>();
  value.packages.forEach((selection, index) => {
    assertSelection(selection, index);
    assert(!packages.has(selection.name), `Project manifest repeats package ${selection.name}.`);
    packages.add(selection.name);
  });
}

export function sealProjectManifest(value: ProjectManifest): ProjectManifest {
  assertProjectManifest(value);
  return structuredClone(value);
}

export function createProjectManifest(value: {
  readonly name: string;
  readonly packages?: readonly ProjectPackageSelection[];
}): ProjectManifest {
  return sealProjectManifest({
    format: projectManifestFormat,
    name: value.name,
    packages: value.packages ?? [],
  });
}

export function parseProjectManifest(text: string): ProjectManifest {
  return sealProjectManifest(JSON.parse(text) as ProjectManifest);
}

export function serializeProjectManifest(value: ProjectManifest): string {
  assertProjectManifest(value);
  return `${JSON.stringify(value, undefined, 2)}\n`;
}
