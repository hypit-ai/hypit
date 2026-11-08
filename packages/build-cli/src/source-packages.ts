import {
  loadNodePackageSelection,
} from "@hypit/loader/node";
import type {
  LoadedPackage,
} from "@hypit/loader";
import { packageSelectionSatisfied } from "@hypit/loader";

import type { SourceBuildCliServices } from "./services.js";

type BuildSourcePackageServices = Pick<
  SourceBuildCliServices,
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
  services: BuildSourcePackageServices,
  options: DiscoveryOptions,
  packages: readonly LoadedPackage[],
) {
  const selection = await services.discoverSourcePackages?.(options.source, {
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
    packageRoot: options.packageRoot,
    ...(options.distributionPackageRoot === undefined
      ? {}
      : { distributionPackageRoot: options.distributionPackageRoot }),
    packages,
  });
  if (selection === undefined) throw new Error("these Build CLI services cannot discover Source packages");
  return selection;
}

/** Load only the installed packages reached by recursive Frontend discovery. */
export async function loadDiscoveredSourcePackages(
  services: BuildSourcePackageServices,
  options: DiscoveryOptions,
): Promise<readonly LoadedPackage[]> {
  let packages = services.bootstrapPackages;
  while (true) {
    const selection = await discover(services, options, packages);
    if (packageSelectionSatisfied(selection, packages)) return packages;
    const loaded = await loadNodePackageSelection(selection, options.packageRoot, {
      ...(options.distributionPackageRoot === undefined
        ? {}
        : { fallbackRoots: [options.distributionPackageRoot] }),
    });
    const next = mergePackages(services.bootstrapPackages, loaded);
    if (next.map((item) => item.specifier).join("\u0000") === packages.map((item) => item.specifier).join("\u0000")) {
      throw new Error("Source package discovery did not satisfy its logical package requirements");
    }
    packages = next;
  }
}
