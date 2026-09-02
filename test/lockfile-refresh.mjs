#!/usr/bin/env node
/**
 * Write a lockfile the repository can commit.
 *
 * `pnpm-workspace.yaml` globs `projects/*​/packages/*` so that a project-local author package is one
 * pnpm links — the authoring guide's convention depends on it. `.gitignore` excludes `projects/`,
 * because a project is working material. Both are right, and together they mean a local install
 * writes importers a clone will not have into a file the clone installs from.
 *
 * So the lockfile is written with that directory set aside, and put back afterwards. Dependencies
 * declared inside `packages/` resolve identically either way; only the importers differ.
 *
 * Run this after changing package dependencies to keep the committed lockfile reproducible.
 */
import { rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const projects = fileURLToPath(new URL("../projects", import.meta.url));
const aside = fileURLToPath(new URL("../.projects-aside-for-lockfile", import.meta.url));

const moved = existsSync(projects);
if (moved) {
  if (existsSync(aside)) {
    console.error(`${aside} already exists; a previous refresh did not finish. Move it back by hand.`);
    process.exit(2);
  }
  await rename(projects, aside);
}
try {
  const install = spawnSync("pnpm", ["install", "--lockfile-only"], {
    cwd: root, stdio: "inherit", shell: process.platform === "win32", windowsHide: true,
  });
  if (install.status !== 0) process.exitCode = install.status ?? 1;
} finally {
  if (moved) await rename(aside, projects);
}
console.log(moved
  ? "lockfile written with projects/ set aside; it is back where it was."
  : "lockfile written.");
