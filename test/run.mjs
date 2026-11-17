/** Resolve test files without depending on platform-specific shell glob syntax. */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { join } from "node:path";

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

/** The managed virtual-environment interpreter on this platform. */
function managedPython(project) {
  return process.platform === "win32"
    ? join(project, ".venv", "Scripts", "python.exe")
    : join(project, ".venv", "bin", "python");
}

const suites = {
  "runtime-scale": {
    files: ["packages/runtime-local/test/concurrency-process.test.ts"],
    env: { HYPIT_RUNTIME_SCALE_TESTS: "1" },
  },
  "image-opencv": {
    files: ["packages/provider-image-opencv-local/test/provider.test.ts"],
    env: {
      HYPIT_OPENCV_TESTS: "1",
      HYPIT_OPENCV_PYTHON: managedPython("packages/provider-image-opencv-local/runtime"),
    },
  },
  /**
   * Tests that start the capture browser depend on a Chrome for Testing installation that pnpm
   * does not provide, so they are opt-in like the other environment-specific workloads. The
   * ordinary suite still loads their files but runs only their browser-free assertions, which is
   * exactly what CI does without a browser. Run this suite one file at a time: each file starts
   * its own full Chrome, and concurrent instances turn fixed per-test budgets into scheduling
   * lotteries. That matches the conditions each budget was measured under.
   */
  browser: {
    files: [
      "packages/browser-capture/test/capture.test.ts",
      "packages/browser-capture/test/cli.test.ts",
      "packages/caption-fine/test/layout.browser.test.ts",
    ],
    env: { HYPIT_CAPTURE_BROWSER_TESTS: "1" },
    concurrency: 1,
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

/**
 * A test that waits forever otherwise stops the whole suite without saying which one it was: the
 * runner prints nothing more and the CI job holds its runner until the six-hour ceiling. This
 * bound turns that into an ordinary failure naming the test.
 */
const testTimeoutMs = 120_000;

/** A suite may pin file concurrency when its files contend for the same external resource. */
const concurrency = suite?.concurrency === undefined ? [] : [`--test-concurrency=${suite.concurrency}`];

/**
 * The routine suite disables tests that need a prepared capture browser, so a developer machine
 * behaves like CI even when a browser happens to be installed. The browser suite enables them;
 * running a file directly leaves the variable unset and keeps its usual detection.
 */
const routineEnv = { HYPIT_CAPTURE_BROWSER_TESTS: "0" };

const result = spawnSync(process.execPath, [
  "--import", "tsx", "--test", `--test-timeout=${testTimeoutMs}`, ...concurrency, ...files,
], {
  stdio: "inherit",
  windowsHide: true,
  // What the caller already chose wins: these are defaults for running the suite, not a policy.
  env: { ...(suite?.env ?? routineEnv), ...process.env },
});
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
