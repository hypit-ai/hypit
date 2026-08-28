import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { constants, chmod, copyFile, lstat, mkdir, readFile, readdir, readlink, rename, symlink, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { parseRunDocument } from "@hypit/run-markup";

export type VariantManifestEntry = {
  readonly path: string;
  readonly kind: "file" | "symlink";
  readonly digest: string;
  readonly size: number;
  readonly mode: number;
};

export type VariantProjectManifest = {
  readonly version: 1;
  readonly project_root: string;
  readonly base_project_root: string;
  readonly base_digest: string;
  readonly slate_entry_digest: string;
  readonly allowed_changes: readonly string[];
  readonly vocabulary_mode: "inherited" | "inspect";
  readonly vocabulary_packages: readonly string[];
  readonly vocabulary_digest?: string;
  readonly source_imports: readonly string[];
  readonly source_tags: readonly string[];
  readonly package_injections: readonly {
    readonly package_id: string;
    readonly destination: string;
    readonly digest: string;
  }[];
  readonly files: readonly VariantManifestEntry[];
  readonly digest: string;
  readonly created_at: string;
};

export type SlatePackageInjection = { readonly package_id: string; readonly destination: string };
export type SlateVariant = {
  readonly id?: string;
  readonly slug: string;
  readonly brief?: unknown;
  readonly component_class?: "svml-only" | "existing-component" | "composed-components" | "new-package";
  readonly allowed_changes: readonly string[];
  readonly vocabulary?: { readonly mode?: "inherited" | "inspect"; readonly packages?: readonly string[] };
  readonly inject_packages?: readonly SlatePackageInjection[];
  readonly [key: string]: unknown;
};
export type VariantSlate = { readonly variants: readonly SlateVariant[]; readonly [key: string]: unknown };

export type InitializedVariant = {
  readonly id: string;
  readonly slug: string;
  readonly project_root: string;
  readonly run: string;
  readonly manifest: string;
  readonly brief: string;
  readonly allowed_changes: string;
  readonly allowed_change_paths: readonly string[];
  readonly component_class: "svml-only" | "existing-component" | "composed-components" | "new-package";
  readonly vocabulary_mode: "inherited" | "inspect";
  readonly vocabulary_packages: readonly string[];
  readonly vocabulary_digest?: string;
  readonly package_injections: VariantProjectManifest["package_injections"];
  readonly status: "ready";
};

const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules", ".hypit", ".cache", ".turbo"]);
const EXCLUDED_TOP_LEVEL_DIRECTORIES = new Set([
  "coverage", "renders", "generated", "artifacts", "logs", "cache", "build-artifacts", "builds", "output", "outputs", "dist",
]);
const SECRET_FILE = /^(?:\.env(?:\..+)?|\.npmrc|\.yarnrc|credentials?(?:\..+)?\.json|secrets?(?:\..+)?\.json|service-account(?:\..+)?\.json)$/iu;

function normalizedRelative(path: string): string {
  return path.split(sep).join("/");
}

function exclusionReason(relativePath: string, directory: boolean, preserveTopLevelOutputs = false): string | undefined {
  const normalized = normalizedRelative(relativePath);
  const parts = normalized.split("/").filter(Boolean);
  const name = parts.at(-1) ?? "";
  if (parts.some((part) => EXCLUDED_DIRECTORIES.has(part))) return "generated or dependency directory";
  const insideProjectPackage = parts[0] === "packages" && parts.length > 2;
  if (!preserveTopLevelOutputs && !insideProjectPackage && parts.some((part) => EXCLUDED_TOP_LEVEL_DIRECTORIES.has(part))) {
    return "generated output directory";
  }
  if (directory) return undefined;
  if (SECRET_FILE.test(name) || /\.(?:pem|key)$/iu.test(name)) return "credential or secret file";
  if (/\.(?:log|tmp|tsbuildinfo)$/iu.test(name)) return "log or cache file";
  if (extname(name).toLowerCase() === ".svrun" && normalized !== "build.svrun") return "non-canonical preview/mock/accepted-material Run";
  return undefined;
}

async function fileDigest(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((fulfil, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", fulfil);
  });
  return `sha256:${hash.digest("hex")}`;
}

function manifestDigest(entries: readonly VariantManifestEntry[]): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}`;
}

function jsonDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

async function walkProject(root: string, preserveTopLevelOutputs = false): Promise<readonly VariantManifestEntry[]> {
  const entries: VariantManifestEntry[] = [];
  const visit = async (directory: string): Promise<void> => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = join(directory, child.name);
      const rel = normalizedRelative(relative(root, path));
      if (exclusionReason(rel, child.isDirectory(), preserveTopLevelOutputs) !== undefined) continue;
      const stats = await lstat(path);
      if (stats.isDirectory()) {
        await visit(path);
      } else if (stats.isSymbolicLink()) {
        const target = await readlink(path);
        entries.push({ path: rel, kind: "symlink", digest: `sha256:${createHash("sha256").update(target).digest("hex")}`, size: target.length, mode: stats.mode & 0o777 });
      } else if (stats.isFile()) {
        entries.push({ path: rel, kind: "file", digest: await fileDigest(path), size: stats.size, mode: stats.mode & 0o777 });
      }
    }
  };
  await visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export async function snapshotProject(projectRoot: string, options: { readonly preserveTopLevelOutputs?: boolean } = {}): Promise<{ readonly files: readonly VariantManifestEntry[]; readonly digest: string }> {
  const files = await walkProject(resolve(projectRoot), options.preserveTopLevelOutputs === true);
  return { files, digest: manifestDigest(files) };
}

async function copyOne(source: string, destination: string, mode: number): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  try { await copyFile(source, destination, constants.COPYFILE_FICLONE); }
  catch { await copyFile(source, destination); }
  await chmod(destination, mode);
}

async function copySelectedTree(sourceRoot: string, destinationRoot: string, preserveTopLevelOutputs = false): Promise<void> {
  const visit = async (sourceDirectory: string): Promise<void> => {
    const children = await readdir(sourceDirectory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const source = join(sourceDirectory, child.name);
      const rel = normalizedRelative(relative(sourceRoot, source));
      if (exclusionReason(rel, child.isDirectory(), preserveTopLevelOutputs) !== undefined) continue;
      const destination = join(destinationRoot, rel);
      const stats = await lstat(source);
      if (stats.isDirectory()) {
        await mkdir(destination, { recursive: true });
        await visit(source);
      } else if (stats.isSymbolicLink()) {
        await mkdir(dirname(destination), { recursive: true });
        await symlink(await readlink(source), destination);
      } else if (stats.isFile()) {
        await copyOne(source, destination, stats.mode & 0o777);
      }
    }
  };
  await mkdir(destinationRoot, { recursive: true });
  await visit(sourceRoot);
}

function attribute(text: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]+)"`, "u").exec(text)?.[1];
}

export async function removeGeneratedRunBindings(runPath: string): Promise<{ readonly removed_build_records: readonly string[]; readonly removed_satisfactions: readonly string[] }> {
  const original = await readFile(runPath, "utf8");
  const runBody = (source: string): string => source.replace(/^\s*<\?svml\s+using="[^"]+"\?>\s*/u, "");
  parseRunDocument(runPath, runBody(original));
  const buildIds = new Set<string>();
  for (const match of original.matchAll(/<build-record\b[^>]*\/\s*>/gsu)) {
    const id = attribute(match[0], "id");
    if (id !== undefined) buildIds.add(id);
  }
  if (buildIds.size === 0) return { removed_build_records: [], removed_satisfactions: [] };
  const satisfactions: string[] = [];
  let cleaned = original.replace(/<build-record\b[^>]*\/\s*>\s*/gsu, "");
  cleaned = cleaned.replace(/<satisfy\b[^>]*\/\s*>\s*/gsu, (element) => {
    const candidate = attribute(element, "candidate");
    if (candidate === undefined || !buildIds.has(candidate)) return element;
    satisfactions.push(candidate);
    return "";
  });
  parseRunDocument(runPath, runBody(cleaned));
  const temporary = `${runPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, cleaned, "utf8");
  await rename(temporary, runPath);
  return { removed_build_records: [...buildIds], removed_satisfactions: satisfactions };
}

function safeSlug(value: string): string {
  const slug = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  if (slug.length === 0) throw new Error(`variant slug ${JSON.stringify(value)} has no filesystem-safe characters`);
  return slug.slice(0, 64);
}

function assertSlate(value: unknown, path: string): asserts value is VariantSlate {
  if (value === null || typeof value !== "object" || !Array.isArray((value as { variants?: unknown }).variants)) throw new Error(`${path} must contain a variants array`);
  const variants = (value as { variants: unknown[] }).variants;
  if (variants.length === 0) throw new Error(`${path} must contain at least one variant`);
  const slugs = new Set<string>();
  const ids = new Set<string>();
  for (const [index, item] of variants.entries()) {
    if (item === null || typeof item !== "object") throw new Error(`${path} variants[${index}] must be an object`);
    const variant = item as Partial<SlateVariant>;
    if (typeof variant.slug !== "string" || variant.slug.trim().length === 0) throw new Error(`${path} variants[${index}] has no slug`);
    const slug = safeSlug(variant.slug);
    if (slugs.has(slug)) throw new Error(`${path} repeats variant slug ${slug}`);
    slugs.add(slug);
    if (variant.id !== undefined) {
      if (typeof variant.id !== "string" || variant.id.trim().length === 0) throw new Error(`${path} variants[${index}] has an invalid id`);
      if (ids.has(variant.id.trim())) throw new Error(`${path} repeats variant id ${variant.id.trim()}`);
      ids.add(variant.id.trim());
    }
    if (!Array.isArray(variant.allowed_changes) || variant.allowed_changes.length === 0 || variant.allowed_changes.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
      throw new Error(`${path} variants[${index}] must declare non-empty allowed_changes`);
    }
    for (const allowed of variant.allowed_changes) {
      const normalized = normalizedRelative(allowed).replace(/^\.\//u, "");
      if (isAbsolute(allowed) || normalized === ".." || normalized.startsWith("../") || normalized === ".hypit" || normalized.startsWith(".hypit/")) {
        throw new Error(`${path} variants[${index}] has unsafe allowed_changes entry ${allowed}`);
      }
    }
    const componentClass = variant.component_class;
    if (componentClass !== undefined && componentClass !== "svml-only" && componentClass !== "existing-component"
      && componentClass !== "composed-components" && componentClass !== "new-package") {
      throw new Error(`${path} variants[${index}] has invalid component_class`);
    }
    if ((componentClass ?? "svml-only") === "svml-only") {
      const normalizedAllowed = variant.allowed_changes.map((entry) => normalizedRelative(entry).replace(/^\.\//u, ""));
      if (normalizedAllowed.length !== 1 || normalizedAllowed[0] !== "main.svml") {
        throw new Error(`${path} variants[${index}] is svml-only and must allow exactly main.svml`);
      }
    }
    if (variant.vocabulary?.mode !== undefined && variant.vocabulary.mode !== "inherited" && variant.vocabulary.mode !== "inspect") {
      throw new Error(`${path} variants[${index}] has invalid vocabulary.mode`);
    }
    if (variant.vocabulary?.packages !== undefined && (!Array.isArray(variant.vocabulary.packages)
      || variant.vocabulary.packages.some((entry) => typeof entry !== "string" || entry.trim().length === 0))) {
      throw new Error(`${path} variants[${index}] has invalid vocabulary.packages`);
    }
    if ((componentClass === "existing-component" || componentClass === "composed-components" || componentClass === "new-package")
      && (variant.vocabulary?.mode !== "inspect" || (variant.vocabulary.packages?.length ?? 0) === 0)) {
      throw new Error(`${path} variants[${index}] changes components and must inspect at least one assigned package`);
    }
    const injections = variant.inject_packages ?? [];
    if (!Array.isArray(injections) || injections.some((entry) => entry === null || typeof entry !== "object"
      || typeof entry.package_id !== "string" || entry.package_id.trim().length === 0
      || typeof entry.destination !== "string" || entry.destination.trim().length === 0)) {
      throw new Error(`${path} variants[${index}] has invalid inject_packages`);
    }
    if ((componentClass ?? "svml-only") === "new-package" && injections.length === 0) {
      throw new Error(`${path} variants[${index}] is new-package but declares no package injection`);
    }
    if ((componentClass ?? "svml-only") !== "new-package" && injections.length > 0) {
      throw new Error(`${path} variants[${index}] may inject packages only when component_class is new-package`);
    }
    const injectionIds = injections.map((entry) => entry.package_id.trim());
    if (new Set(injectionIds).size !== injectionIds.length) throw new Error(`${path} variants[${index}] repeats an injected package id`);
    const injectionDestinations = injections.map((entry) => normalizedRelative(entry.destination).replace(/^\.\//u, ""));
    if (new Set(injectionDestinations).size !== injectionDestinations.length) throw new Error(`${path} variants[${index}] repeats an injection destination`);
    for (const destination of injectionDestinations) {
      if (isAbsolute(destination) || destination === "packages" || !destination.startsWith("packages/")
        || destination.includes("/../") || destination.endsWith("/..")) {
        throw new Error(`${path} variants[${index}] has unsafe package injection destination ${destination}`);
      }
    }
  }
}

export async function writeVariantJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel.length === 0 || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export type ApprovedVariantPackage = {
  readonly id: string;
  readonly package_root: string;
  readonly digest: string;
};

async function injectPackages(
  projectRoot: string,
  injections: readonly SlatePackageInjection[] | undefined,
  approvedPackages: ReadonlyMap<string, ApprovedVariantPackage>,
): Promise<VariantProjectManifest["package_injections"]> {
  const injected: VariantProjectManifest["package_injections"][number][] = [];
  for (const injection of injections ?? []) {
    if (typeof injection?.package_id !== "string" || typeof injection.destination !== "string") throw new Error("inject_packages entries require package_id and destination");
    const approved = approvedPackages.get(injection.package_id);
    if (approved === undefined) throw new Error(`package injection ${injection.package_id} is not a ready frozen batch package`);
    const source = resolve(approved.package_root);
    const destination = resolve(projectRoot, injection.destination);
    if (!inside(projectRoot, destination) || !normalizedRelative(relative(projectRoot, destination)).startsWith("packages/")) {
      throw new Error(`package injection destination must stay under packages/: ${injection.destination}`);
    }
    const present = await lstat(destination).then(() => true, () => false);
    if (present) throw new Error(`package injection would overwrite ${destination}`);
    const sourceStats = await lstat(source).catch(() => undefined);
    if (sourceStats?.isDirectory() !== true) throw new Error(`package injection source is not a directory: ${source}`);
    const sourceDigest = (await snapshotProject(source, { preserveTopLevelOutputs: true })).digest;
    if (sourceDigest !== approved.digest) throw new Error(`package injection ${injection.package_id} changed after it was frozen: expected ${approved.digest}, found ${sourceDigest}`);
    await copySelectedTree(source, destination, true);
    const destinationDigest = (await snapshotProject(destination, { preserveTopLevelOutputs: true })).digest;
    if (destinationDigest !== approved.digest) throw new Error(`package injection ${injection.package_id} did not copy byte-for-byte into ${destination}`);
    injected.push({ package_id: injection.package_id, destination: normalizedRelative(relative(projectRoot, destination)), digest: approved.digest });
  }
  return injected;
}

export async function inspectSourceVocabularyUsage(runPath: string): Promise<{ readonly imports: readonly string[]; readonly tags: readonly string[] }> {
  const visited = new Set<string>();
  const imports = new Set<string>();
  const tags = new Set<string>();
  const visit = async (path: string): Promise<void> => {
    const absolute = resolve(path);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    const source = await readFile(absolute, "utf8");
    for (const match of source.matchAll(/\bfrom="([^"]+)@\d+"/gu)) if (match[1]!.startsWith("@")) imports.add(match[1]!);
    for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_.:-]*)\b/gu)) tags.add(match[1]!);
    for (const match of source.matchAll(/\bsource="([^"#]+)"/gu)) {
      const child = match[1]!;
      if (child.startsWith("@") || child.startsWith("http://") || child.startsWith("https://")) continue;
      await visit(resolve(dirname(absolute), child));
    }
  };
  await visit(runPath);
  return { imports: [...imports].sort(), tags: [...tags].sort() };
}

export async function initializeVariantProjects(input: {
  readonly projectRoot: string;
  readonly outputRoot: string;
  readonly slatePath: string;
  readonly expectedBaseDigest?: string;
  readonly expectedCount?: number;
  readonly approvedPackages?: readonly ApprovedVariantPackage[];
}): Promise<{ readonly slate: VariantSlate; readonly base_digest: string; readonly variants: readonly InitializedVariant[] }> {
  const projectRoot = resolve(input.projectRoot);
  const outputRoot = resolve(input.outputRoot);
  if (inside(projectRoot, outputRoot)) throw new Error("variant output root must not be inside the base project");
  const slatePath = resolve(input.slatePath);
  let slateValue: unknown;
  try { slateValue = JSON.parse(await readFile(slatePath, "utf8")); }
  catch (error) { throw new Error(`cannot read slate ${slatePath}: ${error instanceof Error ? error.message : String(error)}`); }
  assertSlate(slateValue, slatePath);
  const slate = slateValue;
  if (input.expectedCount !== undefined && slate.variants.length !== input.expectedCount) {
    throw new Error(`slate has ${slate.variants.length} variants, expected ${input.expectedCount}`);
  }
  const approvedPackages = new Map((input.approvedPackages ?? []).map((pack) => [pack.id, pack]));
  for (const variant of slate.variants) {
    for (const injection of variant.inject_packages ?? []) {
      if (!approvedPackages.has(injection.package_id)) throw new Error(`slate references package ${injection.package_id}, which is not ready and frozen in batch state`);
    }
  }
  const base = await snapshotProject(projectRoot);
  if (input.expectedBaseDigest !== undefined && input.expectedBaseDigest !== base.digest) {
    throw new Error(`base project digest changed: expected ${input.expectedBaseDigest}, found ${base.digest}`);
  }
  await mkdir(outputRoot, { recursive: true });
  const width = Math.max(3, String(slate.variants.length).length);
  const currentRoute = await readFile(join(projectRoot, ".hypit", "route-state.json"), "utf8")
    .then((text) => JSON.parse(text) as { artifacts?: { vocabulary?: unknown } }, () => undefined)
    .catch(() => undefined);
  const inheritedVocabulary = typeof currentRoute?.artifacts?.vocabulary === "string"
    ? currentRoute.artifacts.vocabulary
    : join(projectRoot, ".hypit", "vocabulary.json");
  const initialized: InitializedVariant[] = [];
  const assignedIds = new Set<string>();
  for (const [index, variant] of slate.variants.entries()) {
    const number = String(index + 1).padStart(width, "0");
    const slug = safeSlug(variant.slug);
    const id = typeof variant.id === "string" && variant.id.trim().length > 0 ? variant.id.trim() : number;
    const slateEntryDigest = jsonDigest(variant);
    if (assignedIds.has(id)) throw new Error(`slate resolves more than one variant to id ${id}`);
    assignedIds.add(id);
    const variantRoot = join(outputRoot, `${number}-${slug}`);
    const manifestPath = join(variantRoot, ".hypit", "variant-baseline-manifest.json");
    const alreadyInitialized = await readFile(manifestPath, "utf8").then(() => true, () => false);
    if (alreadyInitialized) {
      let manifest: VariantProjectManifest;
      let brief: { id?: unknown; slug?: unknown; slate_entry_digest?: unknown };
      let allowed: { allowed_changes?: unknown };
      try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8")) as VariantProjectManifest;
        brief = JSON.parse(await readFile(join(variantRoot, ".hypit", "variant-brief.json"), "utf8")) as { id?: unknown; slug?: unknown; slate_entry_digest?: unknown };
        allowed = JSON.parse(await readFile(join(variantRoot, ".hypit", "allowed-changes.json"), "utf8")) as { allowed_changes?: unknown };
      } catch (error) {
        throw new Error(`existing variant ${variantRoot} has unreadable initialization evidence: ${error instanceof Error ? error.message : String(error)}`);
      }
      const diff = await inspectVariantDiff(variantRoot);
      if (manifest.base_digest !== base.digest || manifest.slate_entry_digest !== slateEntryDigest
        || brief.id !== id || brief.slug !== slug || brief.slate_entry_digest !== slateEntryDigest
        || JSON.stringify(allowed.allowed_changes) !== JSON.stringify(variant.allowed_changes)
        || diff.passed !== true) {
        throw new Error(`existing variant ${variantRoot} conflicts with the current base or slate`);
      }
    } else {
      const occupied = await readdir(variantRoot).then((items) => items.length > 0, () => false);
      if (occupied) throw new Error(`variant destination already exists without a manifest: ${variantRoot}`);
      await copySelectedTree(projectRoot, variantRoot);
      const run = join(variantRoot, "build.svrun");
      const hasRun = await lstat(run).then((stats) => stats.isFile(), () => false);
      if (!hasRun) throw new Error(`base project has no canonical top-level build.svrun`);
      await removeGeneratedRunBindings(run);
      const packageInjections = await injectPackages(variantRoot, variant.inject_packages, approvedPackages);
      const vocabularyMode = variant.vocabulary?.mode ?? "inherited";
      let vocabularyDigest: string | undefined;
      if (vocabularyMode === "inherited") {
        const evidence = await readFile(inheritedVocabulary).catch(() => undefined);
        if (evidence === undefined) throw new Error(`variant ${id} inherits vocabulary but ${inheritedVocabulary} is missing`);
        vocabularyDigest = `sha256:${createHash("sha256").update(evidence).digest("hex")}`;
        await mkdir(join(variantRoot, ".hypit"), { recursive: true });
        await writeFile(join(variantRoot, ".hypit", "vocabulary.json"), evidence);
      }
      const briefPath = join(variantRoot, ".hypit", "variant-brief.json");
      const allowedPath = join(variantRoot, ".hypit", "allowed-changes.json");
      await writeVariantJson(briefPath, { ...variant, id, slug, slate_entry_digest: slateEntryDigest, index: index + 1, batch_root: outputRoot, base_project_root: projectRoot });
      await writeVariantJson(allowedPath, { allowed_changes: variant.allowed_changes });
      const copied = await snapshotProject(variantRoot);
      const sourceUsage = await inspectSourceVocabularyUsage(join(variantRoot, "build.svrun"));
      const manifest: VariantProjectManifest = {
        version: 1, project_root: variantRoot, base_project_root: projectRoot, base_digest: base.digest,
        slate_entry_digest: slateEntryDigest, allowed_changes: variant.allowed_changes,
        vocabulary_mode: vocabularyMode, vocabulary_packages: variant.vocabulary?.packages ?? [],
        ...(vocabularyDigest === undefined ? {} : { vocabulary_digest: vocabularyDigest }),
        source_imports: sourceUsage.imports, source_tags: sourceUsage.tags, package_injections: packageInjections,
        files: copied.files, digest: copied.digest, created_at: new Date().toISOString(),
      };
      await writeVariantJson(manifestPath, manifest);
    }
    const componentClass = variant.component_class === "existing-component" || variant.component_class === "composed-components" || variant.component_class === "new-package"
      ? variant.component_class : "svml-only";
    const persistedManifest = JSON.parse(await readFile(manifestPath, "utf8")) as VariantProjectManifest;
    initialized.push({
      id, slug, project_root: variantRoot, run: join(variantRoot, "build.svrun"), manifest: manifestPath,
      brief: join(variantRoot, ".hypit", "variant-brief.json"), allowed_changes: join(variantRoot, ".hypit", "allowed-changes.json"),
      allowed_change_paths: persistedManifest.allowed_changes,
      component_class: componentClass, vocabulary_mode: variant.vocabulary?.mode ?? "inherited",
      vocabulary_packages: variant.vocabulary?.packages ?? [],
      ...(persistedManifest.vocabulary_digest === undefined ? {} : { vocabulary_digest: persistedManifest.vocabulary_digest }),
      package_injections: persistedManifest.package_injections,
      status: "ready",
    });
  }
  return { slate, base_digest: base.digest, variants: initialized };
}

function globExpression(pattern: string): RegExp {
  const normalized = normalizedRelative(pattern).replace(/^\.\//u, "");
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (character === "*") {
      if (normalized[index + 1] === "*") { source += ".*"; index += 1; }
      else source += "[^/]*";
    } else if (character === "?") source += "[^/]";
    else source += character.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
  }
  return new RegExp(`${source}$`, "u");
}

export async function inspectVariantDiff(projectRoot: string): Promise<Record<string, unknown>> {
  const root = resolve(projectRoot);
  const manifestPath = join(root, ".hypit", "variant-baseline-manifest.json");
  let manifest: VariantProjectManifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")) as VariantProjectManifest; }
  catch (error) { return { passed: false, manifest: manifestPath, errors: [`BASELINE_MANIFEST_UNREADABLE: ${error instanceof Error ? error.message : String(error)}`] }; }
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !Array.isArray(manifest.allowed_changes)) {
    return { passed: false, manifest: manifestPath, errors: ["BASELINE_MANIFEST_INVALID"] };
  }
  const allowedPath = join(root, ".hypit", "allowed-changes.json");
  const allowedChanges = manifest.allowed_changes;
  try {
    const currentAllowed = JSON.parse(await readFile(allowedPath, "utf8")) as { allowed_changes?: unknown };
    if (!Array.isArray(currentAllowed.allowed_changes) || currentAllowed.allowed_changes.some((item) => typeof item !== "string" || item.trim().length === 0)) {
      return { passed: false, manifest: manifestPath, allowed_changes: allowedPath, errors: ["ALLOWED_CHANGES_INVALID"] };
    }
    if (JSON.stringify(currentAllowed.allowed_changes) !== JSON.stringify(manifest.allowed_changes)) {
      return { passed: false, manifest: manifestPath, allowed_changes: allowedPath, errors: ["ALLOWED_CHANGES_CHANGED_OUTSIDE_BATCH_STATE"], outside_allowed_changes: [] };
    }
  } catch (error) {
    return { passed: false, manifest: manifestPath, allowed_changes: allowedPath, errors: [`ALLOWED_CHANGES_UNREADABLE: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const current = await snapshotProject(root);
  const before = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const after = new Map(current.files.map((entry) => [entry.path, entry]));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((path) => {
    const left = before.get(path); const right = after.get(path);
    return left?.digest !== right?.digest || left?.kind !== right?.kind || left?.mode !== right?.mode;
  }).sort();
  const allowed = allowedChanges.map(globExpression);
  const outside = changed.filter((path) => !allowed.some((pattern) => pattern.test(path)));
  return {
    passed: outside.length === 0,
    manifest: manifestPath,
    baseline_digest: manifest.digest,
    current_digest: current.digest,
    allowed_changes: allowedChanges,
    changed,
    outside_allowed_changes: outside,
  };
}

export async function findGeneratedLeakage(projectRoot: string, runPath: string): Promise<Record<string, unknown>> {
  const root = resolve(projectRoot);
  const leaks: { path: string; reason: string }[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const child of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const path = join(directory, child.name);
      const rel = normalizedRelative(relative(root, path));
      if (rel === ".hypit" || rel.startsWith(".hypit/") || rel === "node_modules" || rel.startsWith("node_modules/") || rel === ".git" || rel.startsWith(".git/")) continue;
      const reason = exclusionReason(rel, child.isDirectory());
      if (reason !== undefined) { leaks.push({ path: rel, reason }); continue; }
      if (child.isDirectory()) await visit(path);
    }
  };
  await visit(root);
  const run = await readFile(resolve(runPath), "utf8").catch(() => "");
  const generatedCandidates = [...run.matchAll(/<build-record\b[^>]*\bid="([^"]+)"[^>]*\/\s*>/gsu)].map((match) => match[1]!);
  return { passed: leaks.length === 0 && generatedCandidates.length === 0, leaks, generated_build_candidates: generatedCandidates };
}
