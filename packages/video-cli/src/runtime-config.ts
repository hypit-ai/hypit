import { createRuntimeFromConfig } from "@narratage/local";

/**
 * Video CLI assembly adds no privileged Provider registry. The Runtime Profile selects
 * locked Runtime Adapter packages, so installing a new adapter never changes this CLI.
 */
export async function createVideoRuntimeFromConfig(path: string, packageRoot = import.meta.dirname) {
  return await createRuntimeFromConfig(path, { packageRoot });
}
