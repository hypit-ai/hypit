/** Resolve test files without depending on platform-specific shell glob syntax. */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { join } from "node:path";

const patterns = [
  "packages/*/test/**/*.test.ts",
  "services/*/test/**/*.test.ts",
  "test/**/*.test.ts",
  // Project-package behavior is part of ordinary authoring and belongs in the suite.
  "examples/*/packages/*/test/**/*.test.ts",
];

/** `node --test` exits successfully for an empty file list, so require an actual suite. */
const minimumFiles = 1;

/** The managed virtual-environment interpreter on this platform. */
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
