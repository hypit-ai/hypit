#!/usr/bin/env node
import { register } from "tsx/esm/api";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distributionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
process.env.HYPIT_DISTRIBUTION_ROOT ??= distributionRoot;
register();
const {
  installDistributionPackageResolution,
  installExternalPackageResolution,
} = await import("../../package-loader-node/src/distribution-resolution.ts");
installDistributionPackageResolution([distributionRoot]);
const { hypitHostPackageRoot } = await import("../../runtime-host-node/src/index.ts");
installExternalPackageResolution([hypitHostPackageRoot()]);
await import("../src/cli.ts");
