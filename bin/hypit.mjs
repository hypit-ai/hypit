#!/usr/bin/env node

import { register } from "tsx/esm/api";

const emitWarning = process.emitWarning;
process.emitWarning = function hypitWarning(warning, ...args) {
  const message = warning instanceof Error ? warning.message : String(warning);
  if (message === "SQLite is an experimental feature and might change at any time") return;
  return emitWarning.call(process, warning, ...args);
};

process.env.HYPIT_CLI_LAUNCHER ??= import.meta.filename;
register();
await import("../packages/video-cli/src/cli.ts");
