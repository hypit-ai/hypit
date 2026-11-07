import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runCliApplication } from "@hypit/cli";
import type { CliIo } from "@hypit/cli";
import type { BuildCliServices } from "@hypit/build-cli";
import { createLocalRuntimeCliCommandModules } from "@hypit/runtime-local-cli";
import type { LocalRuntimeHost } from "@hypit/runtime-local";
import { buildCliServices } from "./services-scenario.js";

const runCli = async (argv: readonly string[], output: CliIo, selected: BuildCliServices) => await runCliApplication(
  argv,
  output,
  {
    commandModules: createLocalRuntimeCliCommandModules({
      ...(selected.packageRoot === undefined ? {} : { packageRoot: selected.packageRoot }),
      openLocalRuntimeHost: async (path, options) =>
        await selected.openRuntimeHost(path, options) as LocalRuntimeHost,
    }),
    cwd: tmpdir(),
    resolveProjectRoot: async (explicit) => await realpath(explicit ?? tmpdir()),
  },
);

test("runtime logs returns only the requested tail and hides its path by default", async () => {
  const distribution = buildCliServices({
    openRuntimeHost: async (path: string) => ({
      profile: path,
      controller: async () => ({
        worker: {
          logs: async () => ({ path: "/private/runtime.log", text: "one\ntwo\nthree\n" }),
        },
      }),
    }),
  });
  let output = "";
  await runCli([
    "runtime", "logs", "/tmp/runtime.json", "--lines", "2", "--json",
  ], { write: (text) => { output += text; } }, distribution);

  assert.deepEqual(JSON.parse(output), {
    format: "hypit.cli-runtime-logs@1",
    lines: ["two", "three"],
    totalLines: 3,
    omittedLines: 1,
  });
});
