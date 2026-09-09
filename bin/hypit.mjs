#!/usr/bin/env node

import { register } from "tsx/esm/api";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const distributionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.env.HYPIT_CLI_LAUNCHER ??= import.meta.filename;
process.env.HYPIT_DISTRIBUTION_ROOT ??= distributionRoot;
register();
const {
  installDistributionPackageResolution,
  installExternalPackageResolution,
} = await import("../packages/package-loader-node/src/distribution-resolution.ts");
installDistributionPackageResolution([distributionRoot]);
const { hypitHostPackageRoot } = await import("../packages/runtime-host-node/src/index.ts");
installExternalPackageResolution([hypitHostPackageRoot()]);
const args = process.argv.slice(2);
if (args[0] === "studio" || (args[0] === "help" && args[1] === "studio")) {
  const { runStudio } = await import("../packages/studio/start.ts");
  try {
    await runStudio(args[0] === "help" ? ["--help"] : args.slice(1).filter((arg) => arg !== "--debug"), {
      write: (text) => process.stdout.write(text),
    });
  } catch (error) {
    const { renderCliError } = await import("../packages/cli/src/index.ts");
    process.stderr.write(renderCliError(error, { debug: args.includes("--debug") }));
    process.exitCode = 1;
  }
} else {
  await import("../packages/video-cli/src/cli.ts");
}
