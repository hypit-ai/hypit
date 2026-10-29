import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { CliIo } from "@hypit/hypit/cli";
import { authorDeclarationFacetAbi } from "@hypit/hypit/author";
import type {
  AuthorDeclarationCompiler,
  AuthorDeclarationFieldShape,
} from "@hypit/hypit/author";
import { visualCompositionVocabulary } from "@hypit/composition";
import { markupDeclarationFacetAbi } from "@hypit/hypit/markup";
import type { RegisteredMarkupDeclaration } from "@hypit/hypit/markup";
import { loadNodePackageSelection, locateNodePackage, distributionPackageRoots } from "@hypit/hypit/loader/node";
import type { NodePackageLoadOptions } from "@hypit/hypit/loader/node";
import { compareCodeUnits, moduleKey, typeKey } from "@hypit/hypit/protocol";
import type { ModuleManifest, ValueSchema } from "@hypit/hypit/protocol";
import { findProjectRoot } from "@hypit/hypit/project";

/**
 * What a Source may write: installed packages, their Module Capabilities and author Declarations.
 *
 * The manifest is the authority; this prints it. A system you never inspected is a system you are
 * about to invent, so the listing shows every scope and the project's own `packages/`, and a named
 * package answers with its own Declarations only, not with everything it happens to depend on.
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

export type CapabilityListing = {
  readonly module: string;
  readonly name: string;
  readonly returns: string;
};

function manifestCapabilities(manifest: ModuleManifest): readonly CapabilityListing[] {
  return manifest.capabilities.map((capability) => ({
    module: moduleKey(manifest),
    name: capability.name,
    returns: typeKey(capability.returns),
  }));
}

// ---------------------------------------------------------------------------------------------------
// Listing

export type PackageListing = {
  readonly name: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly capabilities?: readonly CapabilityListing[];
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
    const capabilities: CapabilityListing[] = [];
    let unreadable: string | undefined;
    try {
      for (const pack of await loadNodePackageSelection([name], projectRoot, loading(distributionRoot))) {
        if (pack.specifier !== name) continue;
        for (const module of pack.contribution.modules ?? []) capabilities.push(...manifestCapabilities(module.manifest));
        for (const facet of pack.contribution.facets ?? []) {
          if (facet.abi === markupDeclarationFacetAbi) tags.push((facet.implementation as RegisteredMarkupDeclaration).tag);
        }
      }
    } catch (error) { unreadable = error instanceof Error ? error.message : String(error); }
    listing.push({
      name,
      ...(manifest.description === undefined ? {} : { description: manifest.description }),
      tags: [...new Set(tags)].sort(),
      ...(capabilities.length === 0 ? {} : { capabilities: capabilities.toSorted((left, right) =>
        compareCodeUnits(`${left.module}#${left.name}`, `${right.module}#${right.name}`)) }),
      ...(unreadable === undefined ? {} : { unreadable }),
    });
  }
  return listing;
}

// ---------------------------------------------------------------------------------------------------
// Declarations

export type DeclarationListing = {
  readonly package: string;
  readonly module: RegisteredMarkupDeclaration["module"];
  readonly declaration: string;
  readonly tag: string;
  readonly body?: RegisteredMarkupDeclaration["body"];
  readonly outputs: AuthorDeclarationCompiler["outputs"];
  readonly shape: AuthorDeclarationCompiler["shape"];
  readonly readme?: string;
};

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

export async function listDeclarations(
  projectRoot: string,
  packages: readonly string[],
  tags?: readonly string[],
  distributionRoot?: string,
): Promise<readonly DeclarationListing[]> {
  assert(packages.length > 0, "name at least one package");
  const loaded = await loadNodePackageSelection(packages, projectRoot, loading(distributionRoot));
  const named = new Set(packages);
  const wanted = tags === undefined ? undefined : new Set(tags);
  const declarations: DeclarationListing[] = [];
  for (const pack of loaded) {
    // Loading a package brings its dependencies with it; the answer is about the ones named.
    if (!named.has(pack.specifier)) continue;
    const facets = pack.contribution.facets ?? [];
    const compilers = facets
      .filter((facet) => facet.abi === authorDeclarationFacetAbi)
      .map((facet) => facet.implementation as AuthorDeclarationCompiler);
    for (const facet of facets) {
      if (facet.abi !== markupDeclarationFacetAbi) continue;
      const syntax = facet.implementation as RegisteredMarkupDeclaration;
      if (wanted !== undefined && !wanted.has(syntax.tag) && !wanted.has(syntax.declaration)) continue;
      const compiler = compilers.find((candidate) => moduleKey(candidate.module) === moduleKey(syntax.module)
        && candidate.declaration === syntax.declaration);
      if (compiler === undefined) throw new Error(`${moduleKey(syntax.module)}#${syntax.declaration} has Markup spelling but no Author Declaration compiler.`);
      const readme = readmePath(pack.specifier, projectRoot, distributionRoot);
      declarations.push({
        package: pack.specifier,
        module: syntax.module,
        declaration: syntax.declaration,
        tag: syntax.tag,
        ...(syntax.body === undefined ? {} : { body: syntax.body }),
        outputs: compiler.outputs,
        shape: compiler.shape,
        ...(readme === undefined ? {} : { readme }),
      });
    }
  }
  return declarations;
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
      if (schema.allowUnknown === true) lines.push(`${indent}… further fields are accepted`);
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
  readonly rules: readonly string[];
} {
  const asked = shape?.trim();
  const shapes = visualCompositionVocabulary.shapes;
  assert(asked === undefined || asked.length === 0 || Object.hasOwn(shapes, asked), `shape must be one of ${Object.keys(shapes).join(", ")}`);
  const chosen = asked === undefined || asked.length === 0 ? Object.keys(shapes) : [asked];
  return {
    shapes: chosen.map((name) => ({ shape: name, describes: describeSchema(shapes[name]!).join("\n") })),
    rules: visualCompositionVocabulary.rules,
  };
}

// ---------------------------------------------------------------------------------------------------
// Command

function fieldLine(field: AuthorDeclarationFieldShape): string {
  const shape = field.values !== undefined ? field.values.join(" | ")
    : field.accepts !== undefined ? field.accepts.map((type) => type.name).join(" | ")
    : field.kind;
  return `      ${field.name}${field.required ? "" : "?"}  ${shape}  ${field.summary}`;
}

function moduleSpecifier(declaration: DeclarationListing): string {
  return `${declaration.module.name}@${declaration.module.version}`;
}

function declarationText(declaration: DeclarationListing): string {
  const lines = [
    `  <${declaration.tag}>  ${declaration.body ?? "structured"}`,
    `    package  ${declaration.package}`,
    `    module   ${moduleSpecifier(declaration)}`,
    `    import   <import from="${moduleSpecifier(declaration)}"/>`,
    `    ${declaration.shape.summary}`,
  ];
  if (declaration.shape.fields.length > 0) lines.push("    fields", ...declaration.shape.fields.map(fieldLine));
  if (Array.isArray(declaration.shape.children)) {
    for (const child of declaration.shape.children) {
      lines.push(`    child <${child.name}> (${child.cardinality})  ${child.summary}`,
        ...child.fields.map(fieldLine));
    }
  }
  if (declaration.outputs.length > 0) lines.push("    outputs", ...declaration.outputs.map((type) =>
    `      ${type.name} (${type.module.name}@${type.module.version})`));
  if (declaration.readme !== undefined) lines.push(`    README ${declaration.readme}`);
  return lines.join("\n");
}

export function writeVocabularyHelp(io: CliIo): void {
  io.write([
    "hypit vocabulary",
    "What a Source may write. Prints installed package manifests; no Runtime Profile, no request, no state.",
    "",
    "  hypit vocabulary                         every installed package with its tags and capabilities",
    "  hypit vocabulary <package…> [--tag <tag>] the author Declarations a package contributes",
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
    io.write(`${schema.shapes.map((item) => `${item.shape}\n${item.describes.split("\n").map((line) => `  ${line}`).join("\n")}`).join("\n\n")}\n\nrules\n${schema.rules.map((rule) => `  ${rule}`).join("\n")}\n`);
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
      if (item.capabilities !== undefined) parts.push(`capabilities: ${item.capabilities.map((capability) =>
        `${capability.module}#${capability.name} -> ${capability.returns}`).join(", ")}`);
      if (item.unreadable !== undefined) parts.push(`unreadable: ${item.unreadable}`);
      return `${parts.join("\n    ")}${item.description === undefined ? "" : `\n    ${item.description}`}`;
    }).join("\n")}\n`);
    return;
  }

  const declarations = await listDeclarations(projectRoot, packages, tags.length === 0 ? undefined : tags, distributionRoot);
  if (json) { io.write(`${JSON.stringify({ projectRoot, packages, declarations }, null, 2)}\n`); return; }
  assert(declarations.length > 0, `${packages.join(", ")} ${packages.length === 1 ? "declares" : "declare"} no author Declaration${tags.length === 0 ? "" : ` tagged ${tags.join(", ")}`}`);
  io.write(`${declarations.map(declarationText).join("\n\n")}\n`);
}
