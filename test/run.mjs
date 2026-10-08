/** Resolve test files without depending on platform-specific shell glob syntax. */
import { spawnSync } from "node:child_process";
import { accessSync, constants, globSync } from "node:fs";
import { delimiter, join } from "node:path";

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
  "runtime-scale": {
    files: ["packages/runtime-local/test/concurrency-process.test.ts"],
    env: { HYPIT_RUNTIME_SCALE_TESTS: "1" },
  },
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

/**
 * A test that waits forever otherwise stops the whole suite without saying which one it was: the
 * runner prints nothing more and the CI job holds its runner until the six-hour ceiling. This
 * bound turns that into an ordinary failure naming the test.
 */
const testTimeoutMs = 120_000;

/**
 * The media tests exercise the modern FFmpeg options used by the production
 * pipeline (`-fps_mode` and `-display_rotation`). A machine can have several
 * FFmpeg installations on PATH, and an older ffmpeg paired with a newer
 * ffprobe produces misleading test failures. Pick one compatible pair from
 * the existing PATH without downloading or mutating the host installation.
 */
function executable(directory, name) {
  const names = process.platform === "win32"
    ? [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`]
    : [name];
  for (const candidate of names) {
    const path = join(directory, candidate);
    try {
      accessSync(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
      return path;
    } catch {
      // Continue through PATH candidates.
    }
  }
  return undefined;
}

function compatibleMediaDirectory(pathValue) {
  const directories = [...new Set(pathValue.split(delimiter).filter((value) => value.length > 0))];
  for (const directory of directories) {
    const ffmpeg = executable(directory, "ffmpeg");
    const ffprobe = executable(directory, "ffprobe");
    if (ffmpeg === undefined || ffprobe === undefined) continue;
    const help = spawnSync(ffmpeg, ["-hide_banner", "-h", "full"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024,
    });
    if (help.status !== 0) continue;
    const helpText = `${help.stdout}\n${help.stderr}`;
    if (!/\bfps_mode\b/u.test(helpText) || !/\bdisplay_rotation\b/u.test(helpText)) continue;
    const probe = spawnSync(ffprobe, ["-version"], { stdio: "ignore" });
    if (probe.status === 0) return directory;
  }
  return undefined;
}

function testEnvironment() {
  const environment = { ...suite?.env, ...process.env };
  const pathValue = environment.PATH ?? "";
  const mediaDirectory = compatibleMediaDirectory(pathValue);
  if (mediaDirectory === undefined) return environment;
  const directories = pathValue.split(delimiter).filter((value) => value.length > 0);
  environment.PATH = [mediaDirectory, ...directories.filter((value) => value !== mediaDirectory)].join(delimiter);
  return environment;
}

const result = spawnSync(process.execPath, [
  "--import", "tsx", "--test", `--test-timeout=${testTimeoutMs}`, ...files,
], {
  stdio: "inherit",
  windowsHide: true,
  // What the caller already chose wins: these are defaults for running the suite, not a policy.
  env: testEnvironment(),
});
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
