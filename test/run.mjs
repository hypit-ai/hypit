/**
 * Run one of the repository's test suites.
 *
 * This exists because a package script passes through a shell, and which shell is not the same
 * everywhere: pnpm hands the script body to `/bin/sh` on POSIX and to `cmd.exe` on Windows. What
 * `sh` reads as syntax, `cmd.exe` reads as text. A quoted glob arrives with its quotes still
 * attached and matches nothing; a leading `VAR=1` is looked up as the name of a program to run.
 *
 * Matching nothing is the dangerous half. `node --test` reports "tests 0" and exits 0, so a suite
 * that ran not one test is indistinguishable from a suite that passed. Deciding the files and the
 * environment here takes the shell out of the question, and gives the count somewhere to be
 * checked.
 *
 *   node test/run.mjs                  every unit test
 *   node test/run.mjs image-opencv     the OpenCV suite, which needs the service's interpreter
 */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { join } from "node:path";

const patterns = [
  "packages/*/test/**/*.test.ts",
  "services/*/test/**/*.test.ts",
  "test/**/*.test.ts",
  // tsconfig type checks these, so they can be written and compile without ever being run.
  "examples/*/packages/*/test/**/*.test.ts",
];

/** A suite that ran nothing is not a suite that passed. Keep this a non-zero guard, not a rubric. */
const minimumFiles = 1;

/**
 * The venv layout Python chose for this platform.
 *
 * `provider-image-opencv-local` already branches on this to find the interpreter it manages; the
 * script that runs its tests used to spell the POSIX half and only that.
 */
function managedPython(project) {
  return process.platform === "win32"
    ? join(project, ".venv", "Scripts", "python.exe")
    : join(project, ".venv", "bin", "python");
}

const suites = {
  "image-opencv": {
    files: ["packages/provider-image-opencv-local/test/provider.test.ts"],
    env: {
      HYPIT_OPENCV_TESTS: "1",
      HYPIT_OPENCV_PYTHON: managedPython("services/image-opencv"),
    },
  },
};

const name = process.argv[2];
if (name !== undefined && !Object.hasOwn(suites, name)) {
  console.error(`unknown suite ${name}; expected one of ${Object.keys(suites).join(", ")}`);
  process.exit(2);
}

const suite = name === undefined ? undefined : suites[name];
let files;
if (suite === undefined) {
  files = [...new Set(patterns.flatMap((pattern) => globSync(pattern)))].sort();
  if (files.length < minimumFiles) {
    console.error(`expected at least ${minimumFiles} test files, found ${files.length}:`);
    for (const pattern of patterns) console.error(`  ${pattern} matched ${globSync(pattern).length}`);
    process.exit(1);
  }
} else {
  files = suite.files;
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  windowsHide: true,
  // What the caller already chose wins: these are defaults for running the suite, not a policy.
  env: { ...suite?.env, ...process.env },
});
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
