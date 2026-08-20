/**
 * Run the repository's test suite.
 *
 * This exists because a glob in a package script passes through a shell, and which shell is not
 * the same everywhere: pnpm hands the script body to `/bin/sh` on POSIX and to `cmd.exe` on
 * Windows. `cmd.exe` neither strips the quotes nor expands the pattern, so patterns written for
 * `sh` arrive at `node --test` as literal text and match nothing.
 *
 * Matching nothing is the dangerous half. `node --test` reports "tests 0" and exits 0, so a suite
 * that ran not one test is indistinguishable from a suite that passed. Expanding the patterns here
 * takes the shell out of the question, and gives the count somewhere to be checked.
 */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";

const patterns = [
  "packages/*/test/**/*.test.ts",
  "services/*/test/**/*.test.ts",
  "test/**/*.test.ts",
  // tsconfig type checks these, so they can be written and compile without ever being run.
  "examples/*/packages/*/test/**/*.test.ts",
];

/** A suite that ran nothing is not a suite that passed. Today the patterns find 104. */
const minimumFiles = 100;

const files = [...new Set(patterns.flatMap((pattern) => globSync(pattern)))].sort();
if (files.length < minimumFiles) {
  console.error(`expected at least ${minimumFiles} test files, found ${files.length}:`);
  for (const pattern of patterns) console.error(`  ${pattern} matched ${globSync(pattern).length}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  windowsHide: true,
});
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
