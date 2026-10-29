import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { CliIo } from "@hypit/hypit/cli";
import {
  animatableLocalStyles,
  visualCompositionVocabulary,
} from "@hypit/composition";
import { markupSurfaceFacetAbi } from "@hypit/hypit/markup";
import type {
  RegisteredSurface,
  SurfaceAttributeVocabulary,
  SurfacePortVocabulary,
  SurfaceVocabulary,
} from "@hypit/hypit/markup";
import { exactModelFacetAbi } from "@hypit/generation/model";
import { loadNodePackageSelection, locateNodePackage, distributionPackageRoots } from "@hypit/hypit/loader/node";
import type { NodePackageLoadOptions } from "@hypit/hypit/loader/node";
import type { ValueSchema } from "@hypit/hypit/protocol";
import { findProjectRoot } from "@hypit/hypit/project";
import { VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@hypit/composition";

/**
 * What a Source may write: the installed packages, and the Surfaces each one declares.
 *
 * The manifest is the authority; this prints it. A system you never inspected is a system you are
 * about to invent, so the listing shows every scope and the project's own `packages/`, and a named
 * package answers with its own Surfaces only, not with everything it happens to depend on.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loading(distributionRoot?: string): NodePackageLoadOptions {
  return distributionRoot === undefined ? {} : { fallbackRoots: [distributionRoot] };
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; } catch { return undefined; }
}

// ---------------------------------------------------------------------------------------------------
// Listing

export type PackageListing = {
  readonly name: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly models?: readonly string[];
  readonly unreadable?: string;
};

export async function listPackages(projectRoot: string, distributionRoot?: string): Promise<readonly PackageListing[]> {
  // Discover installed scopes and unlinked packages in both the project and the Distribution.
  const roots = [...new Set([
    projectRoot,
    ...(distributionRoot === undefined ? [] : distributionPackageRoots(distributionRoot)),
  ])];
  const candidates: { readonly name: string; readonly directory: string }[] = [];
  for (const root of roots) {
    const modules = join(root, "node_modules");
    const scopes = (await readdir(modules, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("@"))
      .map((entry) => entry.name)
      .sort();
    for (const scope of scopes) {
      for (const inside of (await readdir(join(modules, scope)).catch(() => [] as string[])).sort()) {
        const name = `${scope}/${inside}`;
        if (!candidates.some((item) => item.name === name)) candidates.push({ name, directory: join(modules, scope, inside) });
      }
    }
  }
  // The loader also finds packages by name under `packages/<name>/`, even without package-manager
  // links. Published Distributions carry their built-in packages here.
  for (const root of roots) {
    for (const entry of (await readdir(join(root, "packages")).catch(() => [] as string[])).sort()) {
      const directory = join(root, "packages", entry);
      const own = await readJson<{ readonly name?: string }>(join(directory, "package.json"));
      if (own?.name !== undefined && !candidates.some((item) => item.name === own.name)) candidates.push({ name: own.name, directory });
    }
  }
  const listing: PackageListing[] = [];
  for (const { name, directory } of candidates) {
    const manifest = await readJson<{ readonly hypit?: { readonly activation?: string }; readonly description?: string }>(join(directory, "package.json"));
    if (manifest?.hypit?.activation === undefined) continue;
    const tags: string[] = [];
    const models: string[] = [];
    let unreadable: string | undefined;
    try {
      for (const pack of await loadNodePackageSelection([name], projectRoot, loading(distributionRoot))) {
        for (const facet of pack.contribution.facets ?? []) {
          if (facet.abi === markupSurfaceFacetAbi) tags.push((facet.implementation as RegisteredSurface).tag);
          else if (facet.abi === exactModelFacetAbi) models.push(...(facet as { readonly offers?: readonly string[] }).offers ?? []);
        }
      }
    } catch (error) { unreadable = error instanceof Error ? error.message : String(error); }
    listing.push({
      name,
      ...(manifest.description === undefined ? {} : { description: manifest.description }),
      tags: [...new Set(tags)].sort(),
      ...(models.length === 0 ? {} : { models: [...new Set(models)].sort() }),
      ...(unreadable === undefined ? {} : { unreadable }),
    });
  }
  return listing;
}

// ---------------------------------------------------------------------------------------------------
// Surfaces

export type SurfaceListing = {
  readonly package: string;
  readonly module: RegisteredSurface["module"];
  readonly surface: string;
  readonly tag: string;
  readonly mode: RegisteredSurface["mode"];
  readonly outputs: RegisteredSurface["outputs"];
  readonly vocabulary?: unknown;
  readonly readme?: string;
};

function printableVocabulary(value: SurfaceVocabulary | undefined): unknown {
  if (value === undefined) return undefined;
  // The poster is a file the manifest opens; the listing names it and does not read it.
  return { ...value, ...(value.preview === undefined ? {} : { preview: { mediaType: value.preview.mediaType, path: value.preview.path } }) };
}

function readmePath(name: string, projectRoot: string, distributionRoot?: string): string | undefined {
  try {
    const located = locateNodePackage(name, {
      from: join(projectRoot, "__hypit_vocabulary__.mjs"),
      workspaceRoots: [projectRoot],
      ...(distributionRoot === undefined ? {} : { distributionRoots: [distributionRoot] }),
    });
    return join(located.root, "README.md");
  } catch { return undefined; }
}

export async function listSurfaces(
  projectRoot: string,
  packages: readonly string[],
  tags?: readonly string[],
  distributionRoot?: string,
): Promise<readonly SurfaceListing[]> {
  assert(packages.length > 0, "name at least one package");
  const loaded = await loadNodePackageSelection(packages, projectRoot, loading(distributionRoot));
  const named = new Set(packages);
  const wanted = tags === undefined ? undefined : new Set(tags);
  const surfaces: SurfaceListing[] = [];
  for (const pack of loaded) {
    // Loading a package brings its dependencies with it; the answer is about the ones named.
    if (!named.has(pack.specifier)) continue;
    for (const facet of pack.contribution.facets ?? []) {
      if (facet.abi !== markupSurfaceFacetAbi) continue;
      const surface = facet.implementation as RegisteredSurface;
      if (wanted !== undefined && !wanted.has(surface.tag) && !wanted.has(surface.surface)) continue;
      const readme = readmePath(pack.specifier, projectRoot, distributionRoot);
      surfaces.push({
        package: pack.specifier,
        module: surface.module,
        surface: surface.surface,
        tag: surface.tag,
        mode: surface.mode,
        outputs: surface.outputs,
        ...(surface.vocabulary === undefined ? {} : { vocabulary: printableVocabulary(surface.vocabulary) }),
        ...(readme === undefined ? {} : { readme }),
      });
    }
  }
  return surfaces;
}

// ---------------------------------------------------------------------------------------------------
// Visual schema, for a component that draws

/** Render a declared value shape as prose an author can act on. */
export function describeSchema(schema: ValueSchema, indent = ""): string[] {
  const step = `${indent}  `;
  switch (schema.kind) {
    case "object": {
      const lines: string[] = [];
      for (const [name, field] of Object.entries(schema.fields)) {
        const inner = describeSchema(field.schema, step);
        lines.push(`${indent}${name}${field.optional === true ? " (optional)" : ""}: ${inner[0]!.trimStart()}`, ...inner.slice(1));
      }
      if (schema.allowUnknown === true) lines.push(`${indent}… further fields are admitted`);
      return lines;
    }
    case "oneOf": {
      const pinned = schema.variants.map((variant) => {
        if (variant.kind !== "object") return undefined;
        const literal = Object.entries(variant.fields).find(([, field]) => field.schema.kind === "literal");
        return literal === undefined ? undefined : String((literal[1].schema as { value: unknown }).value);
      });
      return [pinned.every((value) => value !== undefined) ? `${indent}one of ${pinned.join(", ")}` : `${indent}one of ${schema.variants.length} shapes`];
    }
    case "array": return [`${indent}a list${schema.minItems === undefined ? "" : ` (at least ${schema.minItems})`} of:`, ...describeSchema(schema.items, step)];
    case "string": return [schema.enum !== undefined ? `${indent}one of ${schema.enum.join(", ")}` : `${indent}${schema.minLength === undefined ? "text" : `text, at least ${schema.minLength} characters`}`];
    case "number": {
      const parts = [schema.integer === true ? "a whole number" : "a number"];
      if (schema.minimum !== undefined) parts.push(`at least ${schema.minimum}`);
      if (schema.maximum !== undefined) parts.push(`at most ${schema.maximum}`);
      return [`${indent}${parts.join(", ")}`];
    }
    case "literal": return [`${indent}exactly ${JSON.stringify(schema.value)}`];
    case "boolean": return [`${indent}true or false`];
    case "null": return [`${indent}null`];
    default: return [`${indent}${(schema as { kind: string }).kind}`];
  }
}

export function visualSchema(shape?: string): {
  readonly shapes: readonly { readonly shape: string; readonly describes: string }[];
  readonly animatableLocalStyles: readonly string[];
  readonly styleNames: readonly string[];
  readonly styleEnumValues: typeof VISUAL_STYLE_ENUM_VALUES_V1;
  readonly rules: readonly string[];
} {
  const asked = shape?.trim();
  const shapes = visualCompositionVocabulary.shapes;
  assert(asked === undefined || asked.length === 0 || Object.hasOwn(shapes, asked), `shape must be one of ${Object.keys(shapes).join(", ")}`);
  const chosen = asked === undefined || asked.length === 0 ? Object.keys(shapes) : [asked];
  return {
    shapes: chosen.map((name) => ({ shape: name, describes: describeSchema(shapes[name]!).join("\n") })),
    animatableLocalStyles: [...animatableLocalStyles],
    styleNames: [...VISUAL_STYLE_NAMES_V1],
    styleEnumValues: VISUAL_STYLE_ENUM_VALUES_V1,
    rules: visualCompositionVocabulary.rules,
  };
}

// ---------------------------------------------------------------------------------------------------
// Command

function attributeLine(attribute: SurfaceAttributeVocabulary): string {
  const shape = attribute.values !== undefined ? attribute.values.join(" | ")
    : attribute.accepts !== undefined ? attribute.accepts.map((type) => type.name).join(" | ")
    : attribute.kind;
  return `      ${attribute.name}${attribute.required ? "" : "?"}  ${shape}  ${attribute.summary}`;
}

function moduleSpecifier(surface: SurfaceListing): string {
  return `${surface.module.name}@${surface.module.version}`;
}

function sourceImport(surface: SurfaceListing, vocabulary: SurfaceVocabulary): string {
  // An example may open with another package's element (a Motion before its Track), so use the
  // prefix of this Surface's own tag wherever it appears.
  const alias = [...vocabulary.example.matchAll(/<([A-Za-z_][A-Za-z0-9_.-]*):([A-Za-z_][A-Za-z0-9_.-]*)\b/gu)]
    .find((match) => match[2] === surface.tag)?.[1];
  return alias === undefined
    ? `<import from="${moduleSpecifier(surface)}"/>`
    : `<import as="${alias}" from="${moduleSpecifier(surface)}"/>`;
}

function portLine(port: SurfacePortVocabulary): string {
  const type = `${port.type.name} (${port.type.module.name}@${port.type.module.version})`;
  return `      ${port.name}  ${type}  ${port.summary}`;
}

function surfaceText(surface: SurfaceListing): string {
  const vocabulary = surface.vocabulary as SurfaceVocabulary | undefined;
  const lines = [
    `  <${surface.tag}>  ${surface.mode}`,
    `    package  ${surface.package}`,
    `    module   ${moduleSpecifier(surface)}`,
  ];
  if (vocabulary !== undefined) {
    lines.push(`    import   ${sourceImport(surface, vocabulary)}`);
    lines.push(`    ${vocabulary.summary}`);
    if (vocabulary.appearance !== undefined) lines.push(`    ${vocabulary.appearance}`);
    if (vocabulary.attributes.length > 0) lines.push("    attributes", ...vocabulary.attributes.map(attributeLine));
    for (const child of vocabulary.children ?? []) {
      lines.push(`    child <${child.tag}> (${child.cardinality})  ${child.summary}`, ...(child.attributes ?? []).map(attributeLine));
    }
    if (vocabulary.ports !== undefined && vocabulary.ports.length > 0) {
      lines.push("    ports", ...vocabulary.ports.map(portLine));
    }
    lines.push("    example", ...vocabulary.example.split("\n").map((line) => `      ${line}`));
    for (const note of vocabulary.notes ?? []) lines.push(`    note: ${note}`);
  }
  if (surface.readme !== undefined) lines.push(`    README ${surface.readme}`);
  return lines.join("\n");
}

export function writeVocabularyHelp(io: CliIo): void {
  io.write([
    "hypit vocabulary",
    "What a Source may write. Prints installed package manifests; no Runtime Profile, no request, no state.",
    "",
    "  hypit vocabulary                         every installed package with its tags and models",
    "  hypit vocabulary <package…> [--tag <tag>] the Surfaces a package declares: module, import, attributes, children, ports, example",
    "  hypit vocabulary --visual [<shape>]      the value shapes and rules a drawing Producer must emit",
    "",
    "Read the package README the listing names before writing its elements. Add --json for a machine view.",
    "",
  ].join("\n"));
}

export async function runVocabularyCli(
  argv: readonly string[],
  io: CliIo,
  cwd = process.cwd(),
  distributionRoot?: string,
): Promise<void> {
  const rest = argv.slice(1);
  if (rest.includes("--help")) { writeVocabularyHelp(io); return; }
  const json = rest.includes("--json");
  const words = rest.filter((item) => item !== "--json" && item !== "--debug" && item !== "--verbose" && item !== "--no-color");
  const projectRoot = await findProjectRoot({ cwd }) ?? distributionRoot ?? resolve(cwd);

  if (words[0] === "--visual") {
    const shape = words[1];
    assert(words.length <= 2, "hypit vocabulary --visual takes at most one shape name");
    const schema = visualSchema(shape);
    if (json) { io.write(`${JSON.stringify(schema, null, 2)}\n`); return; }
    io.write(`${schema.shapes.map((item) => `${item.shape}\n${item.describes.split("\n").map((line) => `  ${line}`).join("\n")}`).join("\n\n")}\n\n`
      + `animatable local styles: ${schema.animatableLocalStyles.join(", ")}\nstyle names: ${schema.styleNames.join(", ")}\n\nrules\n${schema.rules.map((rule) => `  ${rule}`).join("\n")}\n`);
    return;
  }

  const tags: string[] = [];
  const packages: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    if (word === "--tag") {
      const value = words[index + 1];
      assert(value !== undefined && !value.startsWith("--"), "--tag requires a value");
      tags.push(value);
      index += 1;
    } else {
      assert(!word.startsWith("--"), `unknown option ${word}`);
      packages.push(word);
    }
  }

  if (packages.length === 0) {
    assert(tags.length === 0, "--tag narrows a named package; name the package first");
    const listing = await listPackages(projectRoot, distributionRoot);
    if (json) { io.write(`${JSON.stringify({ projectRoot, packages: listing }, null, 2)}\n`); return; }
    assert(listing.length > 0, `no Hypit packages installed under ${projectRoot} or the Distribution`);
    io.write(`${listing.map((item) => {
      const parts = [item.name];
      if (item.tags.length > 0) parts.push(`tags: ${item.tags.join(", ")}`);
      if (item.models !== undefined) parts.push(`models: ${item.models.join(", ")}`);
      if (item.unreadable !== undefined) parts.push(`unreadable: ${item.unreadable}`);
      return `${parts.join("\n    ")}${item.description === undefined ? "" : `\n    ${item.description}`}`;
    }).join("\n")}\n`);
    return;
  }

  const surfaces = await listSurfaces(projectRoot, packages, tags.length === 0 ? undefined : tags, distributionRoot);
  if (json) { io.write(`${JSON.stringify({ projectRoot, packages, surfaces }, null, 2)}\n`); return; }
  assert(surfaces.length > 0, `${packages.join(", ")} ${packages.length === 1 ? "declares" : "declare"} no Markup Surface${tags.length === 0 ? "" : ` tagged ${tags.join(", ")}`}`);
  io.write(`${surfaces.map(surfaceText).join("\n\n")}\n`);
}
