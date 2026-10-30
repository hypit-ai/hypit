/** Resolve test files without depending on platform-specific shell glob syntax. */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { sep } from "node:path";

const patterns = [
  "scripts/test/*.test.mjs",
  "packages/*/test/**/*.test.ts",
  "services/*/test/**/*.test.ts",
  "test/**/*.test.ts",
  // Project-package behavior is part of ordinary authoring and belongs in the suite.
  "examples/*/packages/*/test/**/*.test.ts",
];

/** `node --test` exits successfully for an empty file list, so require an actual suite. */
const minimumFiles = 1;

function failUsage(message) {
  console.error(message);
  console.error("usage: node test/run.mjs [package <name> | workflow <name> | environment <package>[/<test>]]");
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
  files = [...new Set(patterns.flatMap((pattern) => globSync(pattern)))]
    .filter((file) => !file.includes(`${sep}test${sep}environment${sep}`))
    .sort();
} else if (kind === "package") {
  const name = exactName(selected, "package");
  files = globSync(`packages/${name}/test/**/*.test.ts`)
    .filter((file) => !file.includes(`${sep}test${sep}environment${sep}`))
    .sort();
} else if (kind === "workflow") {
  const name = exactName(selected, "workflow");
  files = [
    ...globSync(`test/workflows/${name}.test.ts`),
    ...globSync(`test/workflows/${name}/**/*.test.ts`),
  ].sort();
} else if (kind === "environment") {
  const [owner, test] = environmentPath(selected);
  files = globSync(test === undefined
    ? `packages/${owner}/test/environment/**/*.test.ts`
    : `packages/${owner}/test/environment/${test}.test.ts`).sort();
} else {
  failUsage(`unknown test selection ${kind}`);
}

if (files.length < minimumFiles) {
  console.error(`test selection matched ${files.length} files`);
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
