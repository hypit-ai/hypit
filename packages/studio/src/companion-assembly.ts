import { installDistributionPackageResolution, loadNodePackageSelection } from "@hypit/package-loader-node";
import type { LoadedPackage } from "@hypit/package-loader-node";
import { studioContributionFromPackage } from "@hypit/studio-adapter";

import { fallbackStudioTrackCompanions } from "./fallback-companions.js";
import { StudioCompanionRegistry } from "./studio-registry.js";

/**
 * Assemble the immutable Companion Registry for one Source closure.
 *
 * The distribution contributes its normal video vocabulary. Every package
 * actually selected by the Source may contribute its own Companion through the
 * same package host-facet boundary. There is no second project profile and no
 * replacement table.
 */
export async function loadStudioCompanionRegistry(input: {
  readonly distributionPackageRoot: string;
  readonly distributionPackages: readonly string[];
  readonly sourcePackages: readonly LoadedPackage[];
}): Promise<StudioCompanionRegistry> {
  installDistributionPackageResolution([input.distributionPackageRoot]);
  const distribution = await loadNodePackageSelection(
    input.distributionPackages,
    input.distributionPackageRoot,
  );
  const selected = new Map<string, LoadedPackage>();
  for (const item of [...distribution, ...input.sourcePackages]) {
    if (!selected.has(item.specifier)) selected.set(item.specifier, item);
  }
  const contributions = [...selected.values()].map((item) =>
    studioContributionFromPackage(item.specifier, item.contribution.hostFacets ?? []));
  return new StudioCompanionRegistry(
    [...fallbackStudioTrackCompanions, ...contributions.flatMap((item) => item.tracks)],
    {
      films: contributions.flatMap((item) => item.films),
      scripts: contributions.flatMap((item) => item.scripts),
    },
  );
}
