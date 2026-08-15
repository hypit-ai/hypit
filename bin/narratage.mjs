#!/usr/bin/env node

import { existsSync, realpathSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const builtCli = resolve(root, "packages/video-cli/dist/cli.js");
const ready = resolve(root, "dist/cli-ready");

if (!existsSync(resolve(root, "node_modules/typescript/bin/tsc"))) {
  process.stderr.write(`Narratage dependencies are not installed in ${root}; run: pnpm install --frozen-lockfile\n`);
  process.exitCode = 1;
  process.exit();
}

async function sourceChanged(directory, builtAt) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "test") continue;
      if (await sourceChanged(path, builtAt)) return true;
    } else if ((entry.name.endsWith(".ts") || entry.name === "package.json") && statSync(path).mtimeMs > builtAt) {
      return true;
    }
  }
  return false;
}

const builtAt = existsSync(ready) && existsSync(builtCli) ? statSync(ready).mtimeMs : 0;
const configurationChanged = ["package.json", "pnpm-lock.yaml", "tsconfig.json", "tsconfig.cli.json", "bin/build-cli.mjs"]
  .some((path) => statSync(resolve(root, path)).mtimeMs > builtAt);
if (builtAt === 0 || configurationChanged || await sourceChanged(resolve(root, "packages"), builtAt)) {
  process.stderr.write("Preparing Narratage CLI...\n");
  const result = spawnSync(process.execPath, [resolve(root, "bin/build-cli.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.env.NARRATAGE_CLI_LAUNCHER ??= fileURLToPath(import.meta.url);
await import("./compiled-loader.mjs");
await import(pathToFileURL(builtCli).href);
