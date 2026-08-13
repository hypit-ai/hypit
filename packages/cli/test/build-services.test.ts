import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { digestOf } from "@narratage/protocol";
import { createRunFrontendHostFacet } from "@narratage/run";

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
    bootstrapPackages: [{
      specifier: "@example/run-frontend",
      contribution: {
        format: "svml.node-package@1",
        hostFacets: [createRunFrontendHostFacet({
        id: "@narratage/run-markup@1",
        implementationDigest: digestOf("test-run-frontend"),
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

test("a Build that cannot construct its Runtime starts no declared external service", async () => {
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
    /createRuntimeFromConfig/u,
  );
  assert.deepEqual(calls, []);
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
