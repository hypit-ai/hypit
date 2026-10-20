import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { authorFrontendsFromFacets } from "@hypit/author";
import type { AuthorFrontend } from "@hypit/author";
import { physicalPackageName, resolveNodePackageSource } from "@hypit/loader/node";
import type { LogicalPackageAddress, LoadedPackage } from "@hypit/loader";
import { modulePackageAbi } from "@hypit/protocol";
import { runFragmentFacetAbi, runFrontendsFromFacets } from "@hypit/run";
import type { RunFrontend } from "@hypit/run";
import { sourceFrontendPackageAbi } from "@hypit/source";
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

function addressKey(value: LogicalPackageAddress): string {
  return `${value.abi}\u0000${value.name}`;
}

/**
 * Discover the package requirements reachable from a self-described Source closure.
 * A Distribution supplies only its bootstrap Frontends; every further language,
 * Module and Run Fragment is resolved from package-owned logical offers.
 */
export async function discoverSourcePackages(
  sourcePath: string,
  options: {
    readonly workspaceRoot?: string;
    readonly packageRoot?: string;
    readonly distributionPackageRoot?: string;
    readonly packages?: readonly LoadedPackage[];
    readonly bootstrapAuthorFrontends?: readonly AuthorFrontend[];
    readonly bootstrapRunFrontends?: readonly RunFrontend[];
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
  const runFrontends = [
    ...(options.bootstrapRunFrontends ?? []).map((frontend) => ({ frontend, physical: undefined as string | undefined })),
    ...packages.flatMap((item) => runFrontendsFromFacets(item.contribution.facets ?? [])
      .map((frontend) => ({ frontend, physical: item.specifier as string | undefined }))),
  ];
  const selected = new Set<string>();
  const logical = new Map<string, LogicalPackageAddress>();
  const visited = new Set<string>();
  const moduleOwners = new Map<string, string>();
  const fragmentOwners = new Map<string, string>();
  for (const item of packages) {
    for (const module of item.contribution.modules ?? []) {
      for (const request of [`${module.manifest.name}@${module.manifest.version}`, ...(module.specifiers ?? [])]) {
        moduleOwners.set(request, item.specifier);
      }
    }
    for (const facet of item.contribution.facets ?? []) {
      if (facet.abi !== runFragmentFacetAbi) continue;
      if (facet.address !== undefined) fragmentOwners.set(facet.address, item.specifier);
    }
  }

  const requireLogical = (address: LogicalPackageAddress, physical: string | undefined): void => {
    logical.set(addressKey(address), address);
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
    const text = await readFile(canonical, "utf8");
    const name = relative(canonicalRoot, canonical);
    const resolved = resolveSelfDescribedTextSource({ id: canonical, name, text });
    const authors = authorFrontends.filter((item) => item.frontend.id === resolved.frontend);
    const runs = runFrontends.filter((item) => item.frontend.id === resolved.frontend);
    if (authors.length + runs.length > 1) throw new Error(`Source Frontend ${resolved.frontend} is ambiguously provided`);
    if (authors.length + runs.length === 0) {
      requireLogical({ abi: sourceFrontendPackageAbi, name: resolved.frontend }, undefined);
      return;
    }
    if (authors.length === 1) {
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
      return;
    }
    const owner = runs[0]!;
    if (owner.physical !== undefined) {
      requireLogical({ abi: sourceFrontendPackageAbi, name: owner.frontend.id }, owner.physical);
    }
    const discovery = await owner.frontend.discover(resolved.unit);
    for (const item of discovery.imports) {
      requireLogical({ abi: runFragmentFacetAbi, name: item.from }, fragmentOwners.get(item.from));
    }
    const imported = resolveImportedSource(canonical, canonicalRoot, discovery.author.source);
    await discover(imported.source, imported.root);
  };

  await discover(canonicalSource, root);
  return {
    selected: [...selected].sort(),
    logical: [...logical.values()].sort((left, right) => addressKey(left).localeCompare(addressKey(right))),
  };
}
