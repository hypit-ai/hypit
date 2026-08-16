import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import { createRunFrontendHostFacet } from "@narratage/run";

import { runCli } from "../src/main.js";
import type { CliDistribution } from "../src/distribution.js";
import type { CliManagedProgramReport } from "../src/runtime-port.js";

const io = { write: () => {} };

/**
 * Enough of a Distribution to reach the build handler: a Run Frontend the
 * source header names, and a compiler that hands back that source and claims no
 * Author Frontend, so the CLI takes the Run path.
 */
function distribution(
  calls: string[],
  programs: readonly CliManagedProgramReport[],
): CliDistribution {
  return {
    name: "test",
    bootstrapPackages: [{
      specifier: "@example/run-frontend",
      digest: fixtureDigest("@example/run-frontend"),
      contribution: {
        format: "narratage.node-package@1",
        hostFacets: [createRunFrontendHostFacet({
        id: "@narratage/run-markup@1",
        discover() { throw new Error("createRuntimeFromConfig is unavailable"); },
        decode() { throw new Error("createRuntimeFromConfig is unavailable"); },
        })],
      },
    }],
    createCompiler: () => ({
      openFile: async (path: string) => ({
        entry: { name: path, text: '<?svml using="@narratage/run-markup@1"?>\n<svrun/>\n' },
      }),
      supportsFrontend: () => false,
    }),
    openRuntimeHost: async (path: string) => ({
      profile: path,
      resolvePaths: async () => ({}),
      controller: async () => ({
        profile: path,
        dataRoot: "/tmp",
        revision: async () => "test-revision",
        worker: {
          up: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }),
          status: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }),
          logs: async () => ({ path: "/tmp/worker.log", text: "" }),
          down: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }),
        },
        programs: {
          up: async () => {
            calls.push(`up ${path}`);
            return { dataRoot: "/tmp", programs };
          },
          down: async () => ({ dataRoot: "/tmp", programs: [] }),
          report: async () => ({ dataRoot: "/tmp", programs: [] }),
        },
      }),
      doctor: async () => ({ dataRoot: "/tmp", diagnostics: [] }),
      createRuntime: async () => { throw new Error("createRuntimeFromConfig is unavailable"); },
      openArchive: async () => ({ status: async () => ({}) }),
    }),
  } as unknown as CliDistribution;
}

async function runSource(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "narratage-build-programs-"));
  const path = join(root, "build.svrun");
  await writeFile(path, '<?svml using="@narratage/run-markup@1"?>\n<svrun/>\n', "utf8");
  return path;
}

test("a Build that cannot construct its Runtime starts no declared external program", async () => {
  const calls: string[] = [];
  const source = await runSource();
  await assert.rejects(
    async () => await runCli(
      ["build", source, "--runtime", "/p/narratage.runtime.json"],
      io,
      distribution(calls, [{
        id: "whisperx",
        instances: ["whisperx.local"],
        action: "unchanged",
        state: { state: "down", detail: "nothing is answering at http://127.0.0.1:8765" },
        detail: "uv failed: no such project",
      }]),
    ),
    /createRuntimeFromConfig/u,
  );
  assert.deepEqual(calls, []);
});

test("--no-programs leaves the declared programs alone", async () => {
  const calls: string[] = [];
  const source = await runSource();
  // Reaching the Runtime is the boundary just past the gate: the stub has no
  // createRuntimeFromConfig, so arriving there proves the down program was
  // never consulted rather than merely tolerated.
  await assert.rejects(
    async () => await runCli(
      ["build", source, "--runtime", "/p/narratage.runtime.json", "--no-programs"],
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

test("--no-programs belongs to build, the only command that starts a program", async () => {
  await assert.rejects(
    async () => await runCli(
      ["plan", "/p/build.svrun", "--no-programs"],
      io,
      distribution([], []),
    ),
    /--no-programs is only valid for build/u,
  );
});
