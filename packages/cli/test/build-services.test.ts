import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../src/main.js";
import type { CliDistribution, ExternalServiceResult } from "../src/distribution.js";

const io = { write: () => {} };

/**
 * Enough of a Distribution to reach the build handler: a Run Frontend the
 * source header names, and a compiler that hands back that source and claims no
 * Author Frontend, so the CLI takes the Run path.
 */
function distribution(
  calls: string[],
  services: ExternalServiceResult["services"],
): CliDistribution {
  return {
    name: "test",
    builtInPackageContributions: [],
    runFrontends: [{ id: "@narratage/run-markup@1" }],
    createCompiler: () => ({
      openFile: async (path: string) => ({
        entry: { name: path, text: '<?svml using="@narratage/run-markup@1"?>\n<svrun/>\n' },
      }),
      supportsFrontend: () => false,
    }),
    externalServices: {
      up: async (path: string) => {
        calls.push(`up ${path}`);
        return { root: "/tmp", services };
      },
      down: async () => ({ root: "/tmp", services: [] }),
      report: async () => ({ root: "/tmp", services: [] }),
    },
  } as unknown as CliDistribution;
}

async function runSource(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "svml-build-services-"));
  const path = join(root, "build.svrun");
  await writeFile(path, '<?svml using="@narratage/run-markup@1"?>\n<svrun/>\n', "utf8");
  return path;
}

test("a declared service that is not ready stops the Build before it spends anything", async () => {
  const calls: string[] = [];
  const source = await runSource();
  await assert.rejects(
    async () => await runCli(
      ["build", source, "--runtime", "/p/svml.runtime.json"],
      io,
      distribution(calls, [{
        id: "whisperx",
        instances: ["whisperx.local"],
        action: "unchanged",
        state: { state: "down", detail: "nothing is answering at http://127.0.0.1:8765" },
        detail: "uv failed: no such project",
      }]),
    ),
    // Both reasons reach the operator: what the probe saw, and why the attempt
    // to fix it fell short. Each names a different repair.
    (error: Error) => /1 external service is not ready/u.test(error.message)
      && /whisperx: down/u.test(error.message)
      && /nothing is answering/u.test(error.message)
      && /uv failed: no such project/u.test(error.message)
      && /--no-services/u.test(error.message),
  );
  assert.deepEqual(calls, ["up /p/svml.runtime.json"]);
});

test("--no-services leaves the declared programs alone", async () => {
  const calls: string[] = [];
  const source = await runSource();
  // Reaching the Runtime is the boundary just past the gate: the stub has no
  // createRuntimeFromConfig, so arriving there proves the down service was
  // never consulted rather than merely tolerated.
  await assert.rejects(
    async () => await runCli(
      ["build", source, "--runtime", "/p/svml.runtime.json", "--no-services"],
      io,
      distribution(calls, [{
        id: "whisperx",
        instances: ["whisperx.local"],
        state: { state: "down", detail: "nothing is answering" },
      }]),
    ),
    /createRuntimeFromConfig/u,
  );
  assert.deepEqual(calls, []);
});

test("a Build whose services are all ready proceeds to compile", async () => {
  const calls: string[] = [];
  const source = await runSource();
  await assert.rejects(
    async () => await runCli(
      ["build", source, "--runtime", "/p/svml.runtime.json"],
      io,
      distribution(calls, [{
        id: "whisperx",
        instances: ["whisperx.local"],
        action: "already-running",
        state: { state: "ready" },
      }]),
    ),
    /createRuntimeFromConfig/u,
  );
  assert.deepEqual(calls, ["up /p/svml.runtime.json"]);
});

test("--no-services belongs to build, the only command that starts a program", async () => {
  await assert.rejects(
    async () => await runCli(
      ["plan", "/p/build.svrun", "--no-services"],
      io,
      distribution([], []),
    ),
    /--no-services is only valid for build/u,
  );
});
