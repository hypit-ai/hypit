import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { CliIo } from "@hypit/cli";
import {
  animatableLocalStyles,
  visualBoxSchema, visualElementSchema, visualImageSchema, visualMaskSchema, visualPathCommandSchema,
  visualSurfaceSchema, visualTextDocumentSchema, visualTextFlowSchema, visualTextPaintSchema,
  visualTextSchema, visualTextTypographySchema, visualTrackSchema, visualVideoSchema,
} from "@hypit/composition";
import { markupSurfaceHostFacetAbi } from "@hypit/markup";
import type { RegisteredSurface, SurfaceAttributeVocabulary, SurfaceVocabulary } from "@hypit/markup";
import { exactModelHostAbi } from "@hypit/model-kit";
import { loadNodePackageSelection, locateNodePackage } from "@hypit/package-loader-node";
import type { NodePackageLoadOptions } from "@hypit/package-loader-node";
import type { ValueSchema } from "@hypit/protocol";
import { VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "@hypit/visual-ir";

import { videoCliDistribution } from "./distribution.js";

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

async function nearestPackageRoot(start: string): Promise<string> {
  let directory = resolve(start);
  while (true) {
    if (await stat(resolve(directory, "package.json")).then((item) => item.isFile(), () => false)) return directory;
    const parent = dirname(directory);
    if (parent === directory) return resolve(start);
    directory = parent;
  }
}

function loading(): NodePackageLoadOptions {
  return videoCliDistribution.packageRoot === undefined ? {} : { fallbackRoots: [videoCliDistribution.packageRoot] };
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

export async function listPackages(projectRoot: string): Promise<readonly PackageListing[]> {
  // Every scope, and the project's own directory, from both the project's node_modules and the
  // Distribution's: the packages a project does not carry are in the Distribution, and the ones it
  // does are beside it.
  const roots = [...new Set([
    join(projectRoot, "node_modules"),
    ...(videoCliDistribution.packageRoot === undefined ? [] : [join(videoCliDistribution.packageRoot, "node_modules")]),
  ])];
  const candidates: { readonly name: string; readonly directory: string }[] = [];
  for (const modules of roots) {
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
  // A project's own packages are its `packages/<name>/`, where the loader finds them by name whether
  // or not a package manager linked them.
  for (const entry of (await readdir(join(projectRoot, "packages")).catch(() => [] as string[])).sort()) {
    const directory = join(projectRoot, "packages", entry);
    const own = await readJson<{ readonly name?: string }>(join(directory, "package.json"));
    if (own?.name !== undefined && !candidates.some((item) => item.name === own.name)) candidates.push({ name: own.name, directory });
  }
  const listing: PackageListing[] = [];
  for (const { name, directory } of candidates) {
    const manifest = await readJson<{ readonly hypit?: { readonly activation?: string }; readonly description?: string }>(join(directory, "package.json"));
    if (manifest?.hypit?.activation === undefined) continue;
    const tags: string[] = [];
    const models: string[] = [];
    let unreadable: string | undefined;
    try {
      for (const pack of await loadNodePackageSelection([name], projectRoot, loading())) {
        for (const facet of pack.contribution.hostFacets ?? []) {
          if (facet.abi === markupSurfaceHostFacetAbi) tags.push((facet.implementation as RegisteredSurface).tag);
          else if (facet.abi === exactModelHostAbi) models.push(...(facet as { readonly offers?: readonly string[] }).offers ?? []);
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

function readmePath(name: string, projectRoot: string): string | undefined {
  try {
    const located = locateNodePackage(name, {
      from: join(projectRoot, "__hypit_vocabulary__.mjs"),
      workspaceRoots: [projectRoot],
      ...(videoCliDistribution.packageRoot === undefined ? {} : { distributionRoots: [videoCliDistribution.packageRoot] }),
    });
    return join(located.root, "README.md");
  } catch { return undefined; }
}

export async function listSurfaces(projectRoot: string, packages: readonly string[], tags?: readonly string[]): Promise<readonly SurfaceListing[]> {
  assert(packages.length > 0, "name at least one package");
  const loaded = await loadNodePackageSelection(packages, projectRoot, loading());
  const named = new Set(packages);
  const wanted = tags === undefined ? undefined : new Set(tags);
  const surfaces: SurfaceListing[] = [];
  for (const pack of loaded) {
    // Loading a package brings its dependencies with it; the answer is about the ones named.
    if (!named.has(pack.specifier)) continue;
    for (const facet of pack.contribution.hostFacets ?? []) {
      if (facet.abi !== markupSurfaceHostFacetAbi) continue;
      const surface = facet.implementation as RegisteredSurface;
      if (wanted !== undefined && !wanted.has(surface.tag) && !wanted.has(surface.surface)) continue;
      const readme = readmePath(pack.specifier, projectRoot);
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

const VISUAL_SHAPES: Readonly<Record<string, ValueSchema>> = {
  "visual-track": visualTrackSchema,
  "visual-element": visualElementSchema,
  box: visualBoxSchema,
  mask: visualMaskSchema,
  text: visualTextSchema,
  image: visualImageSchema,
  video: visualVideoSchema,
  surface: visualSurfaceSchema,
  "text-flow": visualTextFlowSchema,
  "text-typography": visualTextTypographySchema,
  "text-paint": visualTextPaintSchema,
  "text-document": visualTextDocumentSchema,
  "path-command": visualPathCommandSchema,
};

// Each of these is refused somewhere in composition, or follows from how the emitted CSS is written.
const VISUAL_RULES = [
  "A Present holds exactly one element with no `parent`; every other element names one, and it must be a box or a mask.",
  "`order` is unique across the whole Present, not among siblings.",
  "A child's position is measured from its parent's box, not from the Canvas.",
  "An animation carries at least two keyframes, and every keyframe of one animation declares the same properties; `atFrame` is Present-relative.",
  "A plain text element provides exact ordered font artifacts and cannot combine them with raw `font`, `font-family`, `font-style`, `font-synthesis` or `font-weight` styles.",
  "A text element using glyph Paint cannot also declare raw stroke or paint-order styles.",
  "A media element's artifact media type must match image/video, and still images cannot carry sampling.",
  "A Surface with still timing cannot carry sampling; frame-based Surface sampling must match its typed timing.",
  "Mask roots must be direct children of one Present and both mask/content references must resolve to owned elements.",
] as const;

export function visualSchema(shape?: string): {
  readonly shapes: readonly { readonly shape: string; readonly describes: string }[];
  readonly animatableLocalStyles: readonly string[];
  readonly styleNames: readonly string[];
  readonly styleEnumValues: typeof VISUAL_STYLE_ENUM_VALUES_V1;
  readonly rules: readonly string[];
} {
  const asked = shape?.trim();
  assert(asked === undefined || asked.length === 0 || Object.hasOwn(VISUAL_SHAPES, asked), `shape must be one of ${Object.keys(VISUAL_SHAPES).join(", ")}`);
  const chosen = asked === undefined || asked.length === 0 ? Object.keys(VISUAL_SHAPES) : [asked];
  return {
    shapes: chosen.map((name) => ({ shape: name, describes: describeSchema(VISUAL_SHAPES[name]!).join("\n") })),
    animatableLocalStyles: [...animatableLocalStyles],
    styleNames: [...VISUAL_STYLE_NAMES_V1],
    styleEnumValues: VISUAL_STYLE_ENUM_VALUES_V1,
    rules: VISUAL_RULES,
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

function surfaceText(surface: SurfaceListing): string {
  const vocabulary = surface.vocabulary as SurfaceVocabulary | undefined;
  const lines = [`  <${surface.tag}>  ${surface.mode}  from ${surface.package}`];
  if (vocabulary !== undefined) {
    lines.push(`    ${vocabulary.summary}`);
    if (vocabulary.appearance !== undefined) lines.push(`    ${vocabulary.appearance}`);
    if (vocabulary.attributes.length > 0) lines.push("    attributes", ...vocabulary.attributes.map(attributeLine));
    for (const child of vocabulary.children ?? []) {
      lines.push(`    child <${child.tag}> (${child.cardinality})  ${child.summary}`, ...(child.attributes ?? []).map(attributeLine));
    }
    if (vocabulary.ports !== undefined && vocabulary.ports.length > 0) {
      lines.push("    ports", ...vocabulary.ports.map((port) => `      ${JSON.stringify(port)}`));
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
    "  hypit vocabulary <package…> [--tag <tag>] the Surfaces a package declares: attributes, children, example",
    "  hypit vocabulary --visual [<shape>]      the value shapes and rules a drawing Producer must emit",
    "",
    "Read the package README the listing names before writing its elements. Add --json for a machine view.",
    "",
  ].join("\n"));
}

export async function runVocabularyCli(argv: readonly string[], io: CliIo, cwd = process.cwd()): Promise<void> {
  const rest = argv.slice(1);
  if (rest.includes("--help")) { writeVocabularyHelp(io); return; }
  const json = rest.includes("--json");
  const words = rest.filter((item) => item !== "--json" && item !== "--debug" && item !== "--verbose" && item !== "--no-color");
  const projectRoot = await nearestPackageRoot(cwd);

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
    const listing = await listPackages(projectRoot);
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

  const surfaces = await listSurfaces(projectRoot, packages, tags.length === 0 ? undefined : tags);
  if (json) { io.write(`${JSON.stringify({ projectRoot, packages, surfaces }, null, 2)}\n`); return; }
  assert(surfaces.length > 0, `${packages.join(", ")} ${packages.length === 1 ? "declares" : "declare"} no Markup Surface${tags.length === 0 ? "" : ` tagged ${tags.join(", ")}`}`);
  io.write(`${surfaces.map(surfaceText).join("\n\n")}\n`);
}
