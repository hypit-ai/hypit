#!/usr/bin/env node

import { register } from "tsx/esm/api";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Keep author-relative paths anchored to the caller even though Studio itself
// is executed from the replaceable Hypit Distribution checkout.
process.env.INIT_CWD ??= process.cwd();
const distributionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.HYPIT_DISTRIBUTION_ROOT ??= distributionRoot;
register();
const {
  installDistributionPackageResolution,
  installExternalPackageResolution,
} = await import("../packages/package-loader-node/src/distribution-resolution.ts");
installDistributionPackageResolution([distributionRoot]);
const {
  hypitHostPackageRoot,
  prepareHostPackages,
} = await import("../packages/runtime-host-node/src/index.ts");
const machinePackages = hypitHostPackageRoot();
installExternalPackageResolution([machinePackages]);
await prepareHostPackages(["vite@5.4.21"], {
  root: machinePackages,
  onProgress(event) {
    if (event.phase === "installing") process.stderr.write(`Installing ${event.specifier} for Studio...\n`);
  },
});
await import("../packages/studio/start.ts");
