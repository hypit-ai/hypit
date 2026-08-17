import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { authorFrontendsFromHostFacets, prepareAuthorSource } from "@narratage/elaborator";
import type { AuthorFrontend } from "@narratage/elaborator";
import { physicalPackageName } from "@narratage/package-loader-node";
import type { LogicalPackageAddress, LoadedPackage } from "@narratage/package-loader-node";
import { modulePackageAbi } from "@narratage/protocol";
import { prepareRunSource, runFragmentHostAbi, runFrontendsFromHostFacets } from "@narratage/run";
import type { RunFrontend } from "@narratage/run";
import { parseSourceHeader, sourceFrontendPackageAbi } from "@narratage/source";

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

function selectedPackage(request: string): string {
  const version = request.lastIndexOf("@");
  if (version <= 0) throw new Error(`Package request ${request} must end in @version`);
  return physicalPackageName(request);
}

function relativeSource(importer: string, request: string): string {
  if (!request.startsWith("./") && !request.startsWith("../")) {
    throw new Error(`Source import ${request} in ${importer} must be relative`);
  }
  return resolve(dirname(importer), request);
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
    readonly packages?: readonly LoadedPackage[];
    readonly bootstrapAuthorFrontends?: readonly AuthorFrontend[];
    readonly bootstrapRunFrontends?: readonly RunFrontend[];
  } = {},
): Promise<{ readonly selected: readonly string[]; readonly logical: readonly LogicalPackageAddress[] }> {
  const canonicalSource = await realpath(resolve(sourcePath));
  const root = await realpath(resolve(options.workspaceRoot ?? dirname(canonicalSource)));
  if (!isWithin(root, canonicalSource)) throw new Error(`Source ${canonicalSource} is outside workspace root ${root}`);

  const packages = options.packages ?? [];
  const authorFrontends = [
    ...(options.bootstrapAuthorFrontends ?? []).map((frontend) => ({ frontend, physical: undefined as string | undefined })),
    ...packages.flatMap((item) => authorFrontendsFromHostFacets(item.contribution.hostFacets ?? [])
      .map((frontend) => ({ frontend, physical: item.specifier as string | undefined }))),
  ];
  const runFrontends = [
    ...(options.bootstrapRunFrontends ?? []).map((frontend) => ({ frontend, physical: undefined as string | undefined })),
    ...packages.flatMap((item) => runFrontendsFromHostFacets(item.contribution.hostFacets ?? [])
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
    for (const facet of item.contribution.hostFacets ?? []) {
      if (facet.abi !== runFragmentHostAbi) continue;
      for (const request of facet.offers ?? []) fragmentOwners.set(request, item.specifier);
    }
  }

  const requireLogical = (address: LogicalPackageAddress, physical: string | undefined): void => {
    logical.set(addressKey(address), address);
    selected.add(physical ?? selectedPackage(address.name));
  };
  const discover = async (path: string): Promise<void> => {
    const canonical = await realpath(path);
    if (!isWithin(root, canonical)) throw new Error(`Source ${canonical} is outside workspace root ${root}`);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    const text = await readFile(canonical, "utf8");
    const name = relative(root, canonical);
    const header = parseSourceHeader(name, text);
    const authors = authorFrontends.filter((item) => item.frontend.id === header.using);
    const runs = runFrontends.filter((item) => item.frontend.id === header.using);
    if (authors.length + runs.length > 1) throw new Error(`Source Frontend ${header.using} is ambiguously provided`);
    if (authors.length + runs.length === 0) {
      requireLogical({ abi: sourceFrontendPackageAbi, name: header.using }, undefined);
      return;
    }
    if (authors.length === 1) {
      const owner = authors[0]!;
      if (owner.physical !== undefined) {
        requireLogical({ abi: sourceFrontendPackageAbi, name: owner.frontend.id }, owner.physical);
      }
      const discovery = await owner.frontend.discover(prepareAuthorSource({ id: canonical, name, text }));
      for (const request of discovery.modules) {
        requireLogical({ abi: modulePackageAbi, name: request }, moduleOwners.get(request));
      }
      for (const child of discovery.sources) await discover(relativeSource(canonical, child.from));
      return;
    }
    const owner = runs[0]!;
    if (owner.physical !== undefined) {
      requireLogical({ abi: sourceFrontendPackageAbi, name: owner.frontend.id }, owner.physical);
    }
    const discovery = await owner.frontend.discover(prepareRunSource({ id: canonical, name, text }));
    for (const item of discovery.imports) {
      requireLogical({ abi: runFragmentHostAbi, name: item.from }, fragmentOwners.get(item.from));
    }
    await discover(relativeSource(canonical, discovery.author.source));
  };

  await discover(canonicalSource);
  return {
    selected: [...selected].sort(),
    logical: [...logical.values()].sort((left, right) => addressKey(left).localeCompare(addressKey(right))),
  };
}
