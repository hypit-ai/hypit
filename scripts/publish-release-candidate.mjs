import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { selectReleasePackages } from "./release-candidate.mjs";

const arguments_ = process.argv.slice(2);
const knownOptions = new Set(["--preflight-only", "--independent-only"]);
const unknownOption = arguments_.find((value) => value.startsWith("--") && !knownOptions.has(value) && !value.startsWith("--package="));
if (unknownOption !== undefined) throw new Error(`Unknown option: ${unknownOption}`);
const preflightOnly = arguments_.includes("--preflight-only");
const independentOnly = arguments_.includes("--independent-only");
const packageNames = arguments_.filter((value) => value.startsWith("--package=")).map((value) => value.slice("--package=".length));
const planPath = resolve(arguments_.find((value) => !value.startsWith("--")) ?? "dist/release/release-plan.json");
const releaseDirectory = dirname(planPath);
const plan = JSON.parse(await readFile(planPath, "utf8"));
if (plan.format !== "hypit.release-plan@1" || !Array.isArray(plan.independent)
  || plan.distribution === null || typeof plan.distribution !== "object") {
  throw new Error(`${planPath} is not a Hypit release plan`);
}

function expectedFilename(name, version) {
  return `${name.replace(/^@/u, "").replaceAll("/", "-")}-${version}.tgz`;
}

function tarballPath(item) {
  if (typeof item.name !== "string" || typeof item.version !== "string" || typeof item.filename !== "string") {
    throw new Error("Release plan contains an incomplete package entry");
  }
  if (!/^\d+\.\d+\.\d+$/u.test(item.version)) {
    throw new Error(`${item.name}@${item.version} is not a stable npm release version`);
  }
  if (item.filename !== expectedFilename(item.name, item.version) || basename(item.filename) !== item.filename) {
    throw new Error(`${item.name}@${item.version} has an invalid tarball filename`);
  }
  const path = resolve(releaseDirectory, item.filename);
  if (path !== releaseDirectory && !path.startsWith(`${releaseDirectory}${sep}`)) {
    throw new Error(`${item.filename} escapes the release directory`);
  }
  return path;
}

function tarballManifest(path) {
  return JSON.parse(execFileSync("tar", ["-xOf", path, "package/package.json"], { encoding: "utf8" }));
}

async function registryVersion(name, version) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm lookup for ${name}@${version} failed: HTTP ${response.status}`);
  return await response.json();
}

async function inspect(item) {
  const path = tarballPath(item);
  const manifest = tarballManifest(path);
  if (manifest.name !== item.name || manifest.version !== item.version) {
    throw new Error(`${item.filename} contains ${manifest.name}@${manifest.version}, expected ${item.name}@${item.version}`);
  }
  const existing = await registryVersion(item.name, item.version);
  if (existing !== undefined) return { item, path, exists: true };
  return { item, path, exists: false };
}

const ordered = selectReleasePackages(plan, packageNames, independentOnly);
const identities = new Set();
for (const item of ordered) {
  const identity = `${item.name}@${item.version}`;
  if (identities.has(identity)) throw new Error(`Release plan repeats ${identity}`);
  identities.add(identity);
}

// Inspect every selected immutable package before the first external write. A conflict or registry
// outage late in the dependency order must not leave an avoidable partial publication behind.
const inspected = [];
for (const item of ordered) inspected.push(await inspect(item));
console.log(`Preflight passed for ${inspected.length} npm packages.`);

if (!preflightOnly) {
  for (const candidate of inspected) {
    if (candidate.exists) {
      console.log(`${candidate.item.name}@${candidate.item.version} already exists as an immutable npm version; skipping.`);
      continue;
    }
    execFileSync("npm", ["publish", candidate.path, "--access", "public", "--tag", "latest"], { stdio: "inherit" });
  }
}
