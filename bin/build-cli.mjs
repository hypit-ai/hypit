#!/usr/bin/env node

import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staging = resolve(repository, "dist/cli/packages");
const compiler = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const result = spawnSync(process.execPath, [compiler, "-p", resolve(repository, "tsconfig.cli.json"), "--pretty", "false"], {
  cwd: repository,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

for (const entry of await readdir(staging, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const source = resolve(staging, entry.name, "src");
  if (!existsSync(source)) continue;
  const target = resolve(repository, "packages", entry.name, "dist");
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
}

await writeFile(resolve(repository, "dist/cli-ready"), `${Date.now()}\n`, "utf8");
