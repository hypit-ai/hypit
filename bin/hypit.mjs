#!/usr/bin/env node

import { register } from "tsx/esm/api";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.argv.length === 3 && ["--version", "-v"].includes(process.argv[2])) {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(manifest.version);
  process.exit(0);
}

const emitWarning = process.emitWarning;
process.emitWarning = function hypitWarning(warning, ...args) {
  const message = warning instanceof Error ? warning.message : String(warning);
  if (message === "SQLite is an experimental feature and might change at any time") return;
  return emitWarning.call(process, warning, ...args);
};

// Bootstrap and package activation must agree on the physical Distribution root. Windows short
// paths can survive Node's ordinary resolution while package lookup expands them through libuv.
const distributionRoot = realpathSync.native(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const distributionUrl = pathToFileURL(distributionRoot + sep);
register();
const { installDistributionPackageResolution } =
  await import(new URL("packages/loader/src/node/distribution-resolution.ts", distributionUrl).href);
installDistributionPackageResolution([distributionRoot]);
const args = process.argv.slice(2);
const { runInstalledCliApplication, runNodeCli } = await import(new URL("packages/cli/src/index.ts", distributionUrl).href);
const { createToolchainApplicationServices } = await import("@hypit/toolchain");
const { createSvmlToolchainApplicationServices } = await import("@hypit/svml-toolchain");
const { createSvmlToolchainCliCommandModules } = await import("@hypit/svml-toolchain/cli");
const {
  createBuildOperationsCliCommandModules,
  createSourceBuildCliCommandModules,
} = await import("@hypit/build-cli");
const { createGenerationGraphCliCommandModules } = await import("@hypit/generation-graph-cli");
const { createLocalRuntimeCliCommandModules } = await import("@hypit/runtime-local-cli");
const { createLocalMediaCliCommandModules } = await import("@hypit/media-local-cli");
const { createLocalNleCliCommandModules } = await import("@hypit/nle-local-cli");
const { createProjectCliCommandModules } = await import("@hypit/project-cli");
const { createSpeechEstimateCliCommandModules } = await import("@hypit/speech-estimate/cli");
const { createWhisperXCliCommandModules } = await import("@hypit/whisperx/cli");
const toolchainServices = createToolchainApplicationServices({
  packageRoot: distributionRoot,
  launcher: fileURLToPath(import.meta.url),
});
const svmlServices = createSvmlToolchainApplicationServices({
  packageRoot: distributionRoot,
  launcher: fileURLToPath(import.meta.url),
});
await runNodeCli(args, async (argv, io) => await runInstalledCliApplication(argv, io, {
  distributionRoot,
  commandModules: [
    ...createProjectCliCommandModules(),
    ...createGenerationGraphCliCommandModules(toolchainServices.generation),
    ...createLocalMediaCliCommandModules(),
    ...createLocalNleCliCommandModules({ distributionPackageRoot: distributionRoot }),
    ...createSourceBuildCliCommandModules(svmlServices),
    ...createBuildOperationsCliCommandModules(toolchainServices.buildOperations),
    ...createLocalRuntimeCliCommandModules(toolchainServices.localRuntime),
    ...createSvmlToolchainCliCommandModules({ distributionPackageRoot: distributionRoot }),
    ...createSpeechEstimateCliCommandModules(),
    ...createWhisperXCliCommandModules(toolchainServices.buildOperations),
  ],
  launcher: fileURLToPath(import.meta.url),
}));
