import { moduleKey } from "@hypit/protocol";

import type {
  ModuleContribution,
  PackageContribution,
} from "./types.js";

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
      const key = `${facet.abi}\u0000${facet.address}`;
      if (offers.has(key)) throw new Error(`Packages repeat ${facet.abi} offer ${facet.address}`);
      offers.add(key);
    }
  }
}
