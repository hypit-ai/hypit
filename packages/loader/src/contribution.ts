import { moduleKey, modulePackageAbi } from "@hypit/protocol";

import type {
  ModuleContribution,
  LoadedPackage,
  LogicalPackageAddress,
  PackageContribution,
} from "./types.js";

export function logicalPackageAddressKey(value: LogicalPackageAddress): string {
  return JSON.stringify([value.abi, value.name]);
}

/** Logical addresses are a projection of one contribution, not a second package catalog. */
export function packageContributionOffers(value: PackageContribution): readonly LogicalPackageAddress[] {
  return [
    ...(value.modules ?? []).flatMap((item) => [
      moduleKey(item.manifest),
      ...(item.specifiers ?? []),
    ].map((name) => ({ abi: modulePackageAbi, name }))),
    ...(value.facets ?? []).flatMap((facet) =>
      facet.address === undefined ? [] : [{ abi: facet.abi, name: facet.address }]),
  ];
}

/** Whether the current physical selection uniquely owns every requested logical address. */
export function packageSelectionSatisfied(
  selection: { readonly selected: readonly string[]; readonly logical?: readonly LogicalPackageAddress[] },
  packages: readonly LoadedPackage[],
): boolean {
  const installed = new Set(packages.map((item) => item.specifier));
  if (!selection.selected.every((item) => installed.has(item))) return false;
  const owners = new Map<string, Set<string>>();
  for (const item of packages) {
    for (const offer of packageContributionOffers(item.contribution)) {
      const key = logicalPackageAddressKey(offer);
      const current = owners.get(key) ?? new Set<string>();
      current.add(item.specifier);
      owners.set(key, current);
    }
  }
  return (selection.logical ?? []).every((address) => owners.get(logicalPackageAddressKey(address))?.size === 1);
}

function assertPackage(value: PackageContribution): void {
  if (value.format !== "hypit.package@1") {
    throw new Error("Package contribution has an unsupported format");
  }
  for (const facet of value.facets ?? []) {
    if (facet.abi.trim().length === 0) throw new Error("Package contribution has an empty Facet ABI");
    if (facet.address !== undefined && facet.address.trim().length === 0) {
      throw new Error(`Package contribution has an empty logical name for Facet ${facet.abi}`);
    }
  }
}

/** Validate declarations and logical offers without interpreting any executable Facet. */
export function verifyPackageContributions(packages: readonly PackageContribution[]): void {
  const manifests = new Map<string, ModuleContribution>();
  const moduleSpecifiers = new Map<string, string>();
  const offers = new Set<string>();
  for (const item of packages) {
    assertPackage(item);
    for (const module of item.modules ?? []) {
      const key = moduleKey(module.manifest);
      if (manifests.has(key)) throw new Error(`Packages repeat Module ${key}`);
      for (const specifier of new Set([key, ...(module.specifiers ?? [])])) {
        if (specifier.trim().length === 0) throw new Error(`${key} declares an empty Module specifier`);
        const owner = moduleSpecifiers.get(specifier);
        if (owner !== undefined) throw new Error(`Module specifier ${specifier} is already bound to ${owner}`);
        moduleSpecifiers.set(specifier, key);
      }
      manifests.set(key, module);
    }
    for (const facet of item.facets ?? []) {
      if (facet.address === undefined) continue;
      const key = logicalPackageAddressKey({ abi: facet.abi, name: facet.address });
      if (offers.has(key)) throw new Error(`Packages repeat ${facet.abi} offer ${facet.address}`);
      offers.add(key);
    }
  }
}
