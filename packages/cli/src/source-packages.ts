import {
  loadNodePackageSelection,
} from "@narratage/package-loader-node";
import type {
  LoadedPackage,
  LogicalPackageAddress,
  NodePackageSelectionRequest,
} from "@narratage/package-loader-node";
import { modulePackageAbi } from "@narratage/protocol";

import type { CliDistribution } from "./distribution.js";

type DiscoveryOptions = {
  readonly source: string;
  readonly workspaceRoot?: string;
  readonly packageRoot: string;
};

function mergePackages(
  ...groups: readonly (readonly LoadedPackage[])[]
): readonly LoadedPackage[] {
  return [...new Map(groups.flat().map((item) => [item.specifier, item])).values()];
}

async function discover(
  distribution: CliDistribution,
  options: DiscoveryOptions,
  packages: readonly LoadedPackage[],
) {
  const selection = await distribution.discoverSourcePackages?.(options.source, {
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
    packages,
  });
  if (selection === undefined) throw new Error("this Distribution cannot discover Source packages");
  return selection;
}

function offers(packages: readonly LoadedPackage[], address: LogicalPackageAddress): number {
  return packages.filter((item) => [
    ...(item.contribution.modules ?? []).flatMap((module) => [
      `${module.manifest.name}@${module.manifest.version}`,
      ...(module.specifiers ?? []),
    ].map((name) => ({ abi: modulePackageAbi, name }))),
    ...(item.contribution.hostFacets ?? []).flatMap((facet) =>
      (facet.offers ?? []).map((name) => ({ abi: facet.abi, name }))),
  ].some((offer) => offer.abi === address.abi && offer.name === address.name)).length;
}

function selectionSatisfied(
  selection: NodePackageSelectionRequest,
  packages: readonly LoadedPackage[],
): boolean {
  const installed = new Set(packages.map((item) => item.specifier));
  return selection.selected.every((item) => installed.has(item))
    && (selection.logical ?? []).every((address) => offers(packages, address) === 1);
}

/** Load only the installed packages reached by recursive Frontend discovery. */
export async function loadDiscoveredSourcePackages(
  distribution: CliDistribution,
  options: DiscoveryOptions,
): Promise<readonly LoadedPackage[]> {
  let packages = distribution.bootstrapPackages;
  while (true) {
    const selection = await discover(distribution, options, packages);
    if (selectionSatisfied(selection, packages)) return packages;
    const loaded = await loadNodePackageSelection(selection, options.packageRoot);
    const next = mergePackages(distribution.bootstrapPackages, loaded);
    if (next.map((item) => item.specifier).join("\u0000") === packages.map((item) => item.specifier).join("\u0000")) {
      throw new Error("Source package discovery did not satisfy its logical package requirements");
    }
    packages = next;
  }
}
