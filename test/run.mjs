/** Resolve test files without depending on platform-specific shell glob syntax. */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { sep } from "node:path";

const defaultPatterns = [
  "packages/*/test/**/*.test.ts",
  "services/*/test/**/*.test.ts",
  // Only current executable examples belong in the suite; historical production fixtures stay inert.
  "examples/provider-package/packages/*/test/**/*.test.ts",
  "examples/semantic-composition/packages/audiovisual-title-card/test/**/*.test.ts",
];

function failUsage(message) {
  console.error(message);
  console.error("usage: node test/run.mjs [package <name> | service <name> | workflow [name] | release [name] | environment <package>[/<test>]]");
  process.exit(2);
}

function environmentPath(value) {
  if (value === undefined || !/^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)?$/u.test(value)) {
    failUsage("environment must be a package name, optionally followed by one test name");
  }
  return value.split("/");
}

function exactName(value, subject) {
  if (value === undefined || !/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    failUsage(`${subject} must be a lowercase package or workflow name`);
  }
  return value;
}

const [kind, selected, ...extra] = process.argv.slice(2);
if (extra.length > 0) failUsage(`unexpected arguments: ${extra.join(" ")}`);

let files;
if (kind === undefined) {
  files = [...new Set(defaultPatterns.flatMap((pattern) => globSync(pattern)))]
    .filter((file) => !file.includes(`${sep}test${sep}environment${sep}`))
    .sort();
} else if (kind === "package") {
  const name = exactName(selected, "package");
  files = globSync(`packages/${name}/test/**/*.test.ts`)
    .filter((file) => !file.includes(`${sep}test${sep}environment${sep}`))
    .sort();
} else if (kind === "service") {
  const name = exactName(selected, "service");
  files = globSync(`services/${name}/test/**/*.test.ts`)
    .filter((file) => !file.includes(`${sep}test${sep}environment${sep}`))
    .sort();
} else if (kind === "workflow") {
  files = selected === undefined
    ? globSync("test/workflows/**/*.test.ts").sort()
    : [
        ...globSync(`test/workflows/${exactName(selected, "workflow")}.test.ts`),
        ...globSync(`test/workflows/${selected}/**/*.test.ts`),
      ].sort();
} else if (kind === "release") {
  files = selected === undefined
    ? globSync("scripts/test/*.test.mjs").sort()
    : globSync(`scripts/test/${exactName(selected, "release test")}.test.mjs`).sort();
} else if (kind === "environment") {
  const [owner, test] = environmentPath(selected);
  files = globSync(test === undefined
    ? `packages/${owner}/test/environment/**/*.test.ts`
    : `packages/${owner}/test/environment/${test}.test.ts`).sort();
} else {
  failUsage(`unknown test selection ${kind}`);
}

if (files.length === 0) {
  if (kind === "package" || kind === "service") {
    console.log(`${kind} ${selected} has no local behavior tests`);
    process.exit(0);
  }
  console.error("test selection matched 0 files");
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  "--import", "tsx", "--test", ...files,
], {
  stdio: "inherit",
  windowsHide: true,
});
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
