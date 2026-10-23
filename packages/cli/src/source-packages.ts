import {
  loadNodePackageSelection,
} from "@hypit/loader/node";
import type {
  LoadedPackage,
} from "@hypit/loader";
import { packageSelectionSatisfied } from "@hypit/loader";

import type { CliDistribution } from "./distribution.js";

type CliSourcePackageDiscovery = Pick<
  CliDistribution,
  "bootstrapPackages" | "discoverSourcePackages"
>;

type DiscoveryOptions = {
  readonly source: string;
  readonly workspaceRoot?: string;
  readonly packageRoot: string;
  readonly distributionPackageRoot?: string;
};

function mergePackages(
  ...groups: readonly (readonly LoadedPackage[])[]
): readonly LoadedPackage[] {
  return [...new Map(groups.flat().map((item) => [item.specifier, item])).values()];
}

async function discover(
  distribution: CliSourcePackageDiscovery,
  options: DiscoveryOptions,
  packages: readonly LoadedPackage[],
) {
  const selection = await distribution.discoverSourcePackages?.(options.source, {
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
    packageRoot: options.packageRoot,
    ...(options.distributionPackageRoot === undefined
      ? {}
      : { distributionPackageRoot: options.distributionPackageRoot }),
    packages,
  });
  if (selection === undefined) throw new Error("this Distribution cannot discover Source packages");
  return selection;
}

/** Load only the installed packages reached by recursive Frontend discovery. */
export async function loadDiscoveredSourcePackages(
  distribution: CliSourcePackageDiscovery,
  options: DiscoveryOptions,
): Promise<readonly LoadedPackage[]> {
  let packages = distribution.bootstrapPackages;
  while (true) {
    const selection = await discover(distribution, options, packages);
    if (packageSelectionSatisfied(selection, packages)) return packages;
    const loaded = await loadNodePackageSelection(selection, options.packageRoot, {
      ...(options.distributionPackageRoot === undefined
        ? {}
        : { fallbackRoots: [options.distributionPackageRoot] }),
    });
    const next = mergePackages(distribution.bootstrapPackages, loaded);
    if (next.map((item) => item.specifier).join("\u0000") === packages.map((item) => item.specifier).join("\u0000")) {
      throw new Error("Source package discovery did not satisfy its logical package requirements");
    }
    packages = next;
  }
}
