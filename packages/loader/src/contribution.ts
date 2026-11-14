import type {
  LoadedPackage,
  LogicalPackageAddress,
  PackageContribution,
} from "./types.js";

export function logicalPackageAddressKey(value: LogicalPackageAddress): string {
  return JSON.stringify([value.kind, value.name]);
}

/** Logical addresses are a projection of one contribution, not a second package catalog. */
export function packageContributionOffers(value: PackageContribution): readonly LogicalPackageAddress[] {
  return (value.facets ?? []).flatMap((facet) =>
    facet.address === undefined ? [] : [{ kind: facet.kind, name: facet.address }]);
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
  for (const facet of value.facets ?? []) {
    if (facet.kind.trim().length === 0) throw new Error("Package contribution has an empty Facet kind");
    if (facet.address !== undefined && facet.address.trim().length === 0) {
      throw new Error(`Package contribution has an empty logical name for Facet ${facet.kind}`);
    }
  }
}

/** Validate declarations and logical offers without interpreting any executable Facet. */
export function verifyPackageContributions(packages: readonly PackageContribution[]): void {
  const offers = new Set<string>();
  for (const item of packages) {
    assertPackage(item);
    for (const facet of item.facets ?? []) {
      if (facet.address === undefined) continue;
      const key = logicalPackageAddressKey({ kind: facet.kind, name: facet.address });
      if (offers.has(key)) throw new Error(`Packages repeat ${facet.kind} offer ${facet.address}`);
      offers.add(key);
    }
  }
}
