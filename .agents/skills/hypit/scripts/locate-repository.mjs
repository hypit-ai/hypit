#!/usr/bin/env node
/**
 * Report the Hypit checkout every route runs against, cloning one when this machine has none.
 *
 * Usage:  node scripts/locate-repository.mjs
 *
 * This is the one script that runs from the skill's own copy rather than from the checkout, so it
 * depends on nothing but Node. It writes the report to stdout and leaves git's progress on stderr.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const remote = "https://github.com/hypit-ai/hypit.git";
const target = join(homedir(), "hypit");

const fail = (message) => { console.error(`locate-repository: ${message}`); process.exit(1); };

function isCheckout(directory) {
  try {
    return JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).name === "@hypit/repository";
  } catch { return false; }
}

function nearestCheckout(start) {
  let directory = resolve(start);
  while (true) {
    if (isCheckout(directory)) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function clone() {
  if (existsSync(target)) fail(`${target} exists and is not a Hypit checkout; move it or set HYPIT_REPOSITORY`);
  try {
    execFileSync("git", ["clone", remote, target], { stdio: ["ignore", "inherit", "inherit"], windowsHide: true });
  } catch (error) {
    if (error?.code === "ENOENT") fail("git is not installed");
    fail(`git clone ${remote} ${target} failed`);
  }
  if (!isCheckout(target)) fail(`git clone ${remote} ${target} produced no checkout`);
  return target;
}

function locate() {
  const override = process.env.HYPIT_REPOSITORY?.trim();
  if (override) {
    const directory = resolve(override);
    if (!isCheckout(directory)) fail(`HYPIT_REPOSITORY is not a Hypit checkout: ${directory}`);
    return ["env", directory];
  }
  const fromWorkingDirectory = nearestCheckout(process.cwd());
  if (fromWorkingDirectory !== undefined) return ["cwd", fromWorkingDirectory];
  const fromSkill = nearestCheckout(dirname(fileURLToPath(import.meta.url)));
  if (fromSkill !== undefined) return ["skill", fromSkill];
  if (isCheckout(target)) return ["home", target];
  return ["cloned", clone()];
}

const [source, repository] = locate();
console.log(`repository\t${repository}`);
console.log(`source\t${source}`);
console.log(`installed\t${existsSync(join(repository, "node_modules", "@hypit")) ? "yes" : "no"}`);
