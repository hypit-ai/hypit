#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";

const args = process.argv.slice(2);
if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log("usage: hypit-migrate-flat-results <result-root>");
  process.exit(0);
}
if (args.length !== 1) {
  console.error("usage: hypit-migrate-flat-results <result-root>");
  process.exit(2);
}

register();
const distributionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { installDistributionPackageResolution } = await import(
  "../packages/package-loader-node/src/distribution-resolution.ts"
);
installDistributionPackageResolution([distributionRoot]);
const { migrateFlatBuildResults } = await import("../packages/build-result-fs/src/migrate.ts");
const root = resolve(args[0]);
try {
  const moved = await migrateFlatBuildResults(root);
  console.log(`moved ${moved.length} flat Build Result${moved.length === 1 ? "" : "s"} under ${root}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
