import {
  createNodePackageInventory,
  loadNodePackageSelection,
  selectNodePackageSpecifiers,
} from "@narratage/package-loader-node";
import type {
  LoadedNodePackageSet,
  NodePackageBinding,
} from "@narratage/package-loader-node";

import type { CliDistribution } from "./distribution.js";

type DiscoveryOptions = {
  readonly source: string;
  readonly workspaceRoot?: string;
  readonly packageRoot: string;
};

function selectedKey(value: LoadedNodePackageSet): string {
  return JSON.stringify(value.lock.selected);
}

function mergePackages(
  ...groups: readonly (readonly NodePackageBinding[])[]
): readonly NodePackageBinding[] {
  return [...new Map(groups.flat().map((item) => [item.specifier, item])).values()];
}

async function discover(
  distribution: CliDistribution,
  options: DiscoveryOptions,
  packages: readonly NodePackageBinding[],
) {
  const selection = await distribution.discoverSourcePackages?.(options.source, {
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
    packages,
  });
  if (selection === undefined) throw new Error("this Distribution cannot discover Source packages");
  return selection;
}

/** Select only the trusted inventory subset reached by recursive Frontend discovery. */
export async function loadDiscoveredSourcePackages(
  distribution: CliDistribution,
  options: DiscoveryOptions & { readonly packageLock: string },
): Promise<LoadedNodePackageSet> {
  let packages = distribution.bootstrapPackages;
  let previous = "";
  while (true) {
    const selection = await discover(distribution, options, packages);
    const loaded = await loadNodePackageSelection(options.packageLock, selection, options.packageRoot);
    const key = selectedKey(loaded);
    if (key === previous) return loaded;
    previous = key;
    packages = mergePackages(distribution.bootstrapPackages, loaded.packages);
  }
}

/**
 * Grow a project inventory until every package exposed by recursive Frontend discovery is trusted.
 * Unknown logical names use their conventional npm-looking spelling only for first enrollment.
 */
export async function createDiscoveredSourceInventory(
  distribution: CliDistribution,
  options: DiscoveryOptions & { readonly selected: readonly string[] },
): Promise<{
  readonly packages: LoadedNodePackageSet;
  readonly sourceSelection: Awaited<ReturnType<NonNullable<CliDistribution["discoverSourcePackages"]>>>;
}> {
  let roots = [...new Set(options.selected)].sort();
  let inventory = await createNodePackageInventory(roots, options.packageRoot);
  while (true) {
    const sourceSelection = await discover(distribution, options,
      mergePackages(distribution.bootstrapPackages, inventory.packages));
    const next = [...new Set([...roots, ...sourceSelection.selected])].sort();
    if (JSON.stringify(next) === JSON.stringify(roots)) {
      // A conventional physical hint is not proof that the package actually offers the requested
      // logical ABI. Refuse a stable but invalid inventory before writing it.
      selectNodePackageSpecifiers(inventory.lock, sourceSelection);
      return { packages: inventory, sourceSelection };
    }
    roots = next;
    inventory = await createNodePackageInventory(roots, options.packageRoot);
  }
}
