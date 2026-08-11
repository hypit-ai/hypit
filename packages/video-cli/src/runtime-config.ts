import { createRuntimeFromConfig } from "@narratage/local";
import type { LoadedNodePackageSet } from "@narratage/package-loader-node";

/**
 * Video CLI assembly adds no privileged Provider registry. The Runtime Profile selects
 * locked Runtime Adapter packages, so installing a new adapter never changes this CLI.
 */
export async function createVideoRuntimeFromConfig(
  path: string,
  packageRoot = import.meta.dirname,
  implementationPackages?: LoadedNodePackageSet,
) {
  return await createRuntimeFromConfig(path, {
    packageRoot,
    ...(implementationPackages === undefined ? {} : { implementationPackages }),
  });
}
