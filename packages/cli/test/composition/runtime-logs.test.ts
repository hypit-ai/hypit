import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import type { CliDistribution } from "../../src/distribution.js";
import { runCliApplication } from "../../src/application.js";
import type { CliIo } from "../../src/output.js";
import { createLocalCredentialControl } from "@hypit/runtime-local";
import { createLocalRuntimeCliCommandModules } from "../../../runtime-local/src/cli.js";
import type { LocalRuntimeHost } from "../../../runtime-local/src/host-api.js";
import { commandHint } from "../../src/command-hint.js";
import { cliDistribution } from "../distribution-scenario.js";
import { credentialControl, runtimeControl } from "../control-scenario.js";
import { runCli } from "./control-command-scenario.js";

test("runtime logs returns only the requested tail and hides its path by default", async () => {
  const distribution = cliDistribution({
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
