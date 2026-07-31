import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fail } from "./diagnostics.js";
import type { AttributeValue, SourceDocument, SourceElement } from "./model.js";
import { attributeString, childElements } from "./source/query.js";
import { parseRootSource } from "./source/parse-document.js";
import { sha256 } from "./util.js";

export type KernelPort = {
  name: string;
  direction: "input" | "output";
  type: string;
  cardinality: string;
  consume?: "one" | "each" | "set";
};

export type KernelParameter = {
  name: string;
  styleName: string;
  type: string;
  defaultValue?: AttributeValue;
};

export type KernelField = {
  name: string;
  styleName: string;
  type: string;
  required: boolean;
  consume?: "one" | "each" | "set";
};

export type KernelChildSchema = {
  name: string;
  cardinality: string;
  text: boolean;
  fields: KernelField[];
  children: KernelChildSchema[];
};

export type KernelManifest = {
  name: string;
  abiVersion: string;
  root: boolean;
  sourcePath: string;
  sourceHash: string;
  implementationPath?: string;
  implementationHash: string;
  profile: "isolated-projector-v1" | "capability-v1" | "composite-v1";
  capability?: string;
  permissions: string[];
  ports: KernelPort[];
  parameters: KernelParameter[];
  children: KernelChildSchema[];
  compositeImports?: Array<{ alias: string; sourcePath: string; kernelName?: string }>;
  compose?: SourceElement;
};

export type KernelRegistry = Map<string, KernelManifest>;

export function kernelTemporalContracts(
  manifest: KernelManifest,
): Record<string, {
  kind: "selection" | "moment";
  consume: "one" | "each" | "set";
}> {
  const output: Record<string, {
    kind: "selection" | "moment";
    consume: "one" | "each" | "set";
  }> = {};
  const add = (
    path: string,
    type: string,
    consume: "one" | "each" | "set" | undefined,
  ): void => {
    const kind = type.split("|").includes("SelectionSet")
      ? "selection"
      : type.split("|").includes("MomentSet")
        ? "moment"
        : undefined;
    if (!kind || !consume) return;
    const existing = output[path];
    if (existing && (existing.kind !== kind || existing.consume !== consume)) {
      fail(
        "kernel_temporal_contract_ambiguous",
        `Kernel "${manifest.name}" has conflicting temporal contract "${path}".`,
      );
    }
    output[path] = { kind, consume };
  };
  for (const port of manifest.ports) add(port.name, port.type, port.consume);
  const visit = (schemas: KernelChildSchema[]): void => {
    for (const schema of schemas) {
      for (const field of schema.fields) {
        add(`${schema.name}.${field.name}`, field.type, field.consume);
      }
      visit(schema.children);
    }
  };
  visit(manifest.children);
  return output;
}

function stringAttribute(
  element: SourceElement,
  name: string,
  fallback?: string,
): string | undefined {
  const value = element.attributes[name];
  if (typeof value === "string") return value;
  if (value === undefined) return fallback;
  fail("kernel_manifest_attribute", `<${element.name}> attribute "${name}" must be a string.`);
}

function booleanAttribute(
  element: SourceElement,
  name: string,
  fallback: boolean,
): boolean {
  const value = element.attributes[name];
  if (typeof value === "boolean") return value;
  if (value === undefined) return fallback;
  fail("kernel_manifest_attribute", `<${element.name}> attribute "${name}" must be boolean.`);
}

function parseParameter(sourcePath: string, element: SourceElement): KernelParameter {
  const name = stringAttribute(element, "name");
  const type = stringAttribute(element, "type");
  if (
    !name
    || !type
    || !(
      ["string", "number", "boolean", "duration"].includes(type)
      || /^enum\([A-Za-z_][A-Za-z0-9_.:-]*(?:,[A-Za-z_][A-Za-z0-9_.:-]*)+\)$/u.test(type)
    )
  ) {
    fail("kernel_manifest_parameter", `${sourcePath} contains an invalid <param>.`);
  }
  let defaultValue = element.attributes.default;
  if (defaultValue !== undefined) {
    if (type === "number" && (typeof defaultValue !== "number" || !Number.isFinite(defaultValue))) {
      fail(
        "kernel_manifest_parameter_default",
        `${sourcePath} parameter ${name} has a non-numeric default.`,
      );
    }
    if (type === "boolean" && typeof defaultValue !== "boolean") {
      fail(
        "kernel_manifest_parameter_default",
        `${sourcePath} parameter ${name} has a non-boolean default.`,
      );
    }
    if (type === "duration" && (
      typeof defaultValue !== "string"
      || !/^[+-]?\d+(?:\.\d+)?(?:ms|s)$/u.test(defaultValue)
    )) {
      fail(
        "kernel_manifest_parameter_default",
        `${sourcePath} parameter ${name} has an invalid duration default.`,
      );
    }
    const enumValues = /^enum\((.+)\)$/u.exec(type)?.[1]?.split(",");
    if (enumValues && (typeof defaultValue !== "string" || !enumValues.includes(defaultValue))) {
      fail(
        "kernel_manifest_parameter_default",
        `${sourcePath} parameter ${name} has an invalid enum default.`,
      );
    }
    if (type === "string" && typeof defaultValue !== "string") {
      defaultValue = String(defaultValue);
    }
  }
  return {
    name,
    styleName: stringAttribute(element, "style", name) ?? name,
    type: type as KernelParameter["type"],
    ...(defaultValue !== undefined ? { defaultValue } : {}),
  };
}

function parseField(sourcePath: string, element: SourceElement): KernelField {
  const name = stringAttribute(element, "name");
  const type = stringAttribute(element, "type");
  if (!name || !type) {
    fail("kernel_manifest_field", `${sourcePath} contains an incomplete <field>.`);
  }
  const consume = stringAttribute(element, "consume");
  if (consume && !["one", "each", "set"].includes(consume)) {
    fail("kernel_manifest_temporal_consume", `${sourcePath} field ${name} has invalid consume.`);
  }
  if (
    type.split("|").some((candidate) => ["SelectionSet", "MomentSet"].includes(candidate))
    && !consume
  ) {
    fail(
      "kernel_manifest_temporal_consume",
      `${sourcePath} temporal field ${name} must declare consume="one|each|set".`,
    );
  }
  return {
    name,
    styleName: stringAttribute(element, "style", name) ?? name,
    type,
    required: booleanAttribute(element, "required", false),
    ...(consume ? { consume: consume as "one" | "each" | "set" } : {}),
  };
}

function parseChild(sourcePath: string, element: SourceElement): KernelChildSchema {
  const name = stringAttribute(element, "name");
  if (!name) fail("kernel_manifest_child", `${sourcePath} contains a child without a name.`);
  const fields = childElements(element, "field").map((field) => parseField(sourcePath, field));
  if (new Set(fields.map((field) => field.name)).size !== fields.length) {
    fail("kernel_manifest_field_duplicate", `${sourcePath} repeats a field on child ${name}.`);
  }
  const children = childElements(element, "child").map((child) => parseChild(sourcePath, child));
  if (new Set(children.map((child) => child.name)).size !== children.length) {
    fail("kernel_manifest_child_duplicate", `${sourcePath} repeats child schema ${name}.`);
  }
  return {
    name,
    cardinality: stringAttribute(element, "cardinality", "zero-or-more") ?? "zero-or-more",
    text: booleanAttribute(element, "text", false),
    fields,
    children,
  };
}

function parseManifest(sourcePath: string, source: string): KernelManifest {
  const root = parseRootSource(sourcePath, source);
  if (root.name !== "kernel") {
    fail("kernel_manifest_root", `${sourcePath} must contain one <kernel> root.`);
  }
  const name = stringAttribute(root, "name");
  const implementation = stringAttribute(root, "implementation");
  const profile = stringAttribute(root, "profile", "isolated-projector-v1");
  if (!name || !/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(name)) {
    fail("kernel_manifest_name", `${sourcePath} has an invalid or missing Kernel name.`);
  }
  if (!["isolated-projector-v1", "capability-v1", "composite-v1"].includes(profile ?? "")) {
    fail("kernel_manifest_profile", `${sourcePath} has unsupported profile "${profile ?? ""}".`);
  }
  if (profile === "isolated-projector-v1" && !implementation) {
    fail("kernel_manifest_implementation", `${sourcePath} must declare implementation.`);
  }
  const capability = stringAttribute(root, "capability");
  if (profile === "capability-v1" && !capability) {
    fail("kernel_manifest_capability", `${sourcePath} capability Kernel requires capability.`);
  }
  const ports: KernelPort[] = childElements(root, "port").map((port) => {
    const portName = stringAttribute(port, "name");
    const direction = stringAttribute(port, "direction");
    const type = stringAttribute(port, "type");
    if (!portName || !direction || !type) {
      fail("kernel_manifest_port", `${sourcePath} contains an incomplete <port>.`);
    }
    if (direction !== "input" && direction !== "output") {
      fail("kernel_manifest_port_direction", `${sourcePath} port ${portName} has invalid direction.`);
    }
    const consume = stringAttribute(port, "consume");
    if (consume && !["one", "each", "set"].includes(consume)) {
      fail("kernel_manifest_temporal_consume", `${sourcePath} port ${portName} has invalid consume.`);
    }
    if (
      type.split("|").some((candidate) => ["SelectionSet", "MomentSet"].includes(candidate))
      && !consume
    ) {
      fail(
        "kernel_manifest_temporal_consume",
        `${sourcePath} temporal port ${portName} must declare consume="one|each|set".`,
      );
    }
    return {
      name: portName,
      direction,
      type,
      cardinality: stringAttribute(port, "cardinality", "one") ?? "one",
      ...(consume ? { consume: consume as "one" | "each" | "set" } : {}),
    };
  });
  const parameters = childElements(root, "param").map((parameter) =>
    parseParameter(sourcePath, parameter));
  if (new Set(parameters.map((parameter) => parameter.name)).size !== parameters.length) {
    fail("kernel_manifest_parameter_duplicate", `${sourcePath} repeats a parameter name.`);
  }
  const children = childElements(root, "child").map((child) => parseChild(sourcePath, child));
  if (new Set(children.map((child) => child.name)).size !== children.length) {
    fail("kernel_manifest_child_duplicate", `${sourcePath} repeats a root child schema.`);
  }
  const compositeImports = childElements(root, "import").map((element) => ({
    alias: stringAttribute(element, "as") ?? "",
    sourcePath: resolve(dirname(sourcePath), stringAttribute(element, "from") ?? ""),
  }));
  const compose = childElements(root, "compose")[0];
  if (profile === "composite-v1") {
    if (implementation || capability || !compose || !compositeImports.length) {
      fail(
        "kernel_composite_shape",
        `${sourcePath} composite-v1 requires imports and one <compose>, without implementation/capability.`,
      );
    }
    if (compositeImports.some((item) => !item.alias)) {
      fail("kernel_composite_import", `${sourcePath} Composite imports require explicit aliases.`);
    }
  }
  const known = new Set([
    "port",
    "param",
    "child",
    ...(profile === "composite-v1" ? ["import", "compose"] : []),
  ]);
  const unknown = childElements(root).find((element) => !known.has(element.name));
  if (unknown) {
    fail("kernel_manifest_element", `${sourcePath} contains unknown <${unknown.name}>.`);
  }
  return {
    name,
    abiVersion: String(root.attributes.abi ?? "1"),
    root: booleanAttribute(root, "root", false),
    sourcePath,
    sourceHash: sha256(source),
    ...(implementation ? { implementationPath: resolve(dirname(sourcePath), implementation) } : {}),
    implementationHash: "",
    profile: profile as KernelManifest["profile"],
    ...(capability ? { capability } : {}),
    permissions: (stringAttribute(root, "permissions", "") ?? "")
      .split(/[\s,]+/u)
      .filter(Boolean),
    ports,
    parameters,
    children,
    ...(profile === "composite-v1" ? { compositeImports, compose } : {}),
  };
}

export async function loadKernels(document: SourceDocument): Promise<KernelRegistry> {
  const registry: KernelRegistry = new Map();
  const imports = childElements(document.root, "import");
  const loading = new Set<string>();
  const definitions = new Map<string, KernelManifest>();
  const load = async (sourcePath: string): Promise<KernelManifest> => {
    sourcePath = resolve(sourcePath);
    if (loading.has(sourcePath)) {
      fail("kernel_import_cycle", `Composite Kernel import cycle at ${sourcePath}.`);
    }
    const byPath = definitions.get(sourcePath);
    if (byPath) return byPath;
    loading.add(sourcePath);
    const manifest = parseManifest(sourcePath, await readFile(sourcePath, "utf8"));
    if (manifest.profile === "composite-v1") {
      for (const imported of manifest.compositeImports ?? []) {
        const nested = await load(imported.sourcePath);
        imported.kernelName = nested.name;
      }
      manifest.implementationHash = sha256(`composite\0${manifest.sourceHash}`);
    } else {
      manifest.implementationHash = manifest.implementationPath
        ? sha256(await readFile(manifest.implementationPath))
        : sha256(`capability\0${manifest.capability ?? manifest.name}`);
    }
    definitions.set(sourcePath, manifest);
    loading.delete(sourcePath);
    return manifest;
  };
  const bind = (binding: string, manifest: KernelManifest): void => {
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(binding)) {
      fail("kernel_import_alias", `Kernel import alias "${binding}" is invalid.`);
    }
    const existing = registry.get(binding);
    if (existing && existing.sourcePath !== manifest.sourcePath) {
      fail(
        "kernel_duplicate_binding",
        `Kernel binding "${binding}" is defined by both ${existing.sourcePath} and ${manifest.sourcePath}.`,
      );
    }
    registry.set(binding, binding === manifest.name ? manifest : { ...manifest, name: binding });
  };
  const bindCompositeDependencies = (manifest: KernelManifest): void => {
    for (const imported of manifest.compositeImports ?? []) {
      const nested = definitions.get(resolve(imported.sourcePath));
      if (!nested) fail("kernel_import_resolution", `Kernel import ${imported.sourcePath} is unresolved.`);
      bind(nested.name, nested);
      bindCompositeDependencies(nested);
    }
  };
  for (const element of imports) {
    const from = attributeString(element, "from");
    if (!from.endsWith(".svk")) continue;
    const manifest = await load(resolve(dirname(document.file), from));
    bindCompositeDependencies(manifest);
    const alias = element.attributes.as;
    if (alias !== undefined && typeof alias !== "string") {
      fail("kernel_import_alias", `${document.file} Kernel import alias must be a string.`);
    }
    bind(alias ?? manifest.name, manifest);
  }
  return registry;
}

export async function loadKernelImplementation<T>(
  manifest: KernelManifest,
): Promise<T> {
  if (!manifest.implementationPath) {
    fail(
      "kernel_implementation_profile",
      `Kernel "${manifest.name}" has no projector implementation.`,
    );
  }
  const moduleUrl = `${pathToFileURL(manifest.implementationPath).href}?kernel=${manifest.sourceHash}-${manifest.implementationHash}`;
  const loaded = await import(moduleUrl) as { default?: T };
  if (!loaded.default) {
    fail(
      "kernel_implementation_default",
      `${manifest.implementationPath} must export a default Kernel implementation.`,
    );
  }
  return loaded.default;
}

export function kernelElement(document: SourceDocument, id: string): SourceElement | undefined {
  return childElements(document.root).find((element) => element.attributes.id === id);
}
