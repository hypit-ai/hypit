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

const environments = {
  "browser-capture": {
    files: ["packages/browser-capture/test/environment/**/*.test.ts"],
  },
  "caption-layout": {
    files: ["packages/caption-fine/test/environment/layout-browser.test.ts"],
  },
  "cli-network": {
    files: ["packages/cli/test/environment/**/*.test.ts"],
  },
  "html-browser": {
    files: [
      "packages/provider-html-local/test/environment/**/*.test.ts",
      "packages/provider-html-local/test/frames.test.ts",
      "packages/provider-html-local/test/provider.test.ts",
      "packages/provider-html-local/test/range.test.ts",
    ],
    env: { HYPIT_BROWSER_TESTS: "1" },
  },
  "studio-host": {
    files: ["packages/studio/test/environment/**/*.test.ts"],
  },
  "whisperx-local": {
    files: ["packages/provider-whisperx-local/test/environment/**/*.test.ts"],
  },
  "runtime-scale": {
    files: ["packages/runtime-local/test/environment/concurrency-process.test.ts"],
    env: { HYPIT_RUNTIME_SCALE_TESTS: "1" },
  },
  "runtime-process": {
    files: ["packages/runtime-local/test/environment/**/*.test.ts"],
  },
  "image-opencv": {
    files: ["packages/provider-image-opencv-local/test/environment/**/*.test.ts"],
    env: {
      HYPIT_OPENCV_TESTS: "1",
      HYPIT_OPENCV_PYTHON: managedPython("packages/provider-image-opencv-local/runtime"),
    },
  },
  "media-local": {
    files: ["packages/media-local/test/environment/**/*.test.ts"],
  },
};

function failUsage(message) {
  console.error(message);
  console.error("usage: node test/run.mjs [package <name> | workflow <name> | environment <name>]");
  process.exit(2);
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
let environment;
if (kind === undefined) {
  files = [...new Set(patterns.flatMap((pattern) => globSync(pattern)))]
    .filter((file) => !file.includes("/test/environment/"))
    .sort();
} else if (kind === "package") {
  const name = exactName(selected, "package");
  files = globSync(`packages/${name}/test/**/*.test.ts`)
    .filter((file) => !file.includes("/test/environment/"))
    .sort();
} else if (kind === "workflow") {
  const name = exactName(selected, "workflow");
  files = [
    ...globSync(`test/workflows/${name}.test.ts`),
    ...globSync(`test/workflows/${name}/**/*.test.ts`),
  ].sort();
} else if (kind === "environment") {
  const name = exactName(selected, "environment");
  environment = environments[name];
  if (environment === undefined) {
    failUsage(`unknown environment ${name}; expected one of ${Object.keys(environments).join(", ")}`);
  }
  files = environment.files.flatMap((pattern) => globSync(pattern)).sort();
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
  // What the caller already chose wins: these are defaults for running the suite, not a policy.
  env: { ...environment?.env, ...process.env },
});
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
