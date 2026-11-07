import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { authorFrontendsFromFacets } from "@hypit/author";
import type { AuthorFrontend } from "@hypit/author";
import { physicalPackageName, resolveNodePackageSource } from "@hypit/loader/node";
import { logicalPackageAddressKey } from "@hypit/loader";
import type { LogicalPackageAddress, LoadedPackage } from "@hypit/loader";
import { compareCodeUnits, moduleKey, modulePackageAbi } from "@hypit/protocol";
import { sourceFrontendPackageAbi } from "@hypit/source";
import type { ResolvedSource, SourceUnit } from "@hypit/source";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function selectedPackage(request: string): string {
  const version = request.lastIndexOf("@");
  if (version <= 0) throw new Error(`Package request ${request} must end in @version`);
  return physicalPackageName(request);
}

/**
 * Discover the package requirements reachable from a Host-resolved Source closure.
 * A Distribution supplies only its bootstrap Frontends; every further language,
 * Module is resolved from package-owned logical offers. Self-described text is only the explicit
 * legacy fallback when a Host does not supply `sourceAdapter`.
 */
export async function discoverSourcePackages(
  sourcePath: string,
  options: {
    readonly workspaceRoot?: string;
    readonly packageRoot?: string;
    readonly distributionPackageRoot?: string;
    readonly packages?: readonly LoadedPackage[];
    readonly bootstrapAuthorFrontends?: readonly AuthorFrontend[];
    /** Host-owned canonical Source association. Omit only for explicit legacy self-described Sources. */
    readonly sourceAdapter?: (source: SourceUnit) => ResolvedSource;
  } = {},
): Promise<{ readonly selected: readonly string[]; readonly logical: readonly LogicalPackageAddress[] }> {
  const canonicalSource = await realpath(resolve(sourcePath));
  const root = await realpath(resolve(options.workspaceRoot ?? dirname(canonicalSource)));
  const packageRoot = resolve(options.packageRoot ?? root);
  if (!isWithin(root, canonicalSource)) throw new Error(`Source ${canonicalSource} is outside workspace root ${root}`);

  const packages = options.packages ?? [];
  const authorFrontends = [
    ...(options.bootstrapAuthorFrontends ?? []).map((frontend) => ({ frontend, physical: undefined as string | undefined })),
    ...packages.flatMap((item) => authorFrontendsFromFacets(item.contribution.facets ?? [])
      .map((frontend) => ({ frontend, physical: item.specifier as string | undefined }))),
  ];
  const selected = new Set<string>();
  const logical = new Map<string, LogicalPackageAddress>();
  const visited = new Set<string>();
  const moduleOwners = new Map<string, string>();
  for (const item of packages) {
    for (const module of item.contribution.modules ?? []) {
      for (const request of [moduleKey(module.manifest), ...(module.specifiers ?? [])]) {
        moduleOwners.set(request, item.specifier);
      }
    }
  }

  const requireLogical = (address: LogicalPackageAddress, physical: string | undefined): void => {
    logical.set(logicalPackageAddressKey(address), address);
    selected.add(physical ?? selectedPackage(address.name));
  };
  const resolveImportedSource = (
    importer: string,
    importerRoot: string,
    request: string,
  ): { readonly source: string; readonly root: string } => {
    if (request.startsWith("./") || request.startsWith("../")) {
      return { source: resolve(dirname(importer), request), root: importerRoot };
    }
    const located = resolveNodePackageSource(request, {
      from: importer,
      workspaceRoots: [packageRoot],
      ...(options.distributionPackageRoot === undefined
        ? {}
        : { distributionRoots: [options.distributionPackageRoot] }),
    });
    return { source: located.source, root: located.root };
  };
  const discover = async (path: string, sourceRoot: string): Promise<void> => {
    const canonical = await realpath(path);
    const canonicalRoot = await realpath(sourceRoot);
    if (!isWithin(canonicalRoot, canonical)) {
      throw new Error(`Source ${canonical} is outside its source root ${canonicalRoot}`);
    }
    if (visited.has(canonical)) return;
    visited.add(canonical);
    const name = relative(canonicalRoot, canonical);
    const bytes = await readFile(canonical);
    const unit: SourceUnit = { id: canonical, name, bytes };
    const resolved = options.sourceAdapter?.(unit)
      ?? resolveSelfDescribedTextSource({ id: canonical, name, text: bytes.toString("utf8") });
    const authors = authorFrontends.filter((item) => item.frontend.id === resolved.frontend);
    if (authors.length > 1) throw new Error(`Source Frontend ${resolved.frontend} is ambiguously provided`);
    if (authors.length === 0) {
      requireLogical({ abi: sourceFrontendPackageAbi, name: resolved.frontend }, undefined);
      return;
    }
    const owner = authors[0]!;
    if (owner.physical !== undefined) {
      requireLogical({ abi: sourceFrontendPackageAbi, name: owner.frontend.id }, owner.physical);
    }
    const discovery = await owner.frontend.discover(resolved.unit);
    for (const request of discovery.modules) {
      requireLogical({ abi: modulePackageAbi, name: request }, moduleOwners.get(request));
    }
    for (const child of discovery.sources) {
      const imported = resolveImportedSource(canonical, canonicalRoot, child.from);
      await discover(imported.source, imported.root);
    }
  };

  await discover(canonicalSource, root);
  return {
    selected: [...selected].sort(),
    logical: [...logical.values()].sort((left, right) =>
      compareCodeUnits(logicalPackageAddressKey(left), logicalPackageAddressKey(right))),
  };
}
