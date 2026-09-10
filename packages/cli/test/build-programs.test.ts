import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileBuildResultRepository } from "@hypit/build-result";
import { createRunFrontendHostFacet } from "@hypit/run";

import { runCli } from "../src/main.js";
import type { CliDistribution } from "../src/distribution.js";
import type { RuntimeDoctorDiagnostic } from "@hypit/runtime-kit";

const io = { write: () => {} };

/**
 * Enough of a Distribution to reach the build handler: a Run Frontend the
 * source header names, and a compiler that hands back that source and claims no
 * Author Frontend, so the CLI takes the Run path.
 */
function distribution(
  calls: string[],
  diagnostics: readonly RuntimeDoctorDiagnostic[],
  authorSource = "./main.svml",
  execution?: object,
): CliDistribution {
  return {
    bootstrapPackages: [{
      specifier: "@example/run-frontend",
      contribution: {
        format: "hypit.node-package@1",
        hostFacets: [createRunFrontendHostFacet({
        id: "@hypit/run-markup@1",
        discover: () => ({ author: { source: authorSource }, imports: [] }),
        decode: () => ({ document: {
          format: "hypit.run-document@1",
          author: { source: authorSource },
          imports: [],
          targets: [{ output: "result" }],
          candidates: [],
          satisfactions: [],
        } }),
        })],
      },
    }],
    createCompiler: () => ({
      openFile: async (path: string) => {
        const source = async (name: string) => ({ id: name, name, text: await readFile(name, "utf8") });
        return {
          entry: await source(path),
          resolveSource: async (_importer: unknown, request: { readonly from: string }) =>
            await source(join(path, "..", request.from)),
          attachments: async () => [],
        };
      },
      supportsFrontend: () => false,
      compileSource: async (entry: { readonly id: string }) => ({
        closure: { entry: entry.id, units: [] },
        provenance: { format: "hypit.author-provenance@1", elements: [] },
        program: { closure: { format: "hypit.closure@1", modules: [{ manifest: {
          format: "hypit.module@1",
          name: "example.value",
          version: "1",
          dependencies: [],
          types: [{ name: "Value" }],
          capabilities: [],
          producers: [],
        } }] }, records: [] },
        graph: {
          format: "hypit.graph@1",
          outputs: [{
            id: "result",
            type: { module: { name: "example.value", version: "1" }, name: "Value" },
            primary: "provided-result",
          }],
          candidates: [{
            id: "provided-result",
            type: { module: { name: "example.value", version: "1" }, name: "Value" },
            root: { kind: "value", value: {
              id: "record-result",
              value: { kind: "inline", value: "ready" },
            } },
          }],
          operations: [],
        },
        exports: [{
          name: "result",
          type: { module: { name: "example.value", version: "1" }, name: "Value" },
          ref: { kind: "logical-output", id: "result" },
        }],
        attachments: [],
      }),
      extendExecutionProgram: (program: unknown) => program,
    }),
    openProjectResults: async (projectRoot: string) => ({
      location: {
        root: projectRoot,
        selection: { use: "test.results", config: {} },
      },
      repository: new FileBuildResultRepository(join(projectRoot, ".hypit", "results")),
      close() {},
    }),
    diagnoseProjectResults: async () => ({ diagnostics: [] }),
    openRuntimeHost: async (path: string) => ({
      profile: path,
      resolvePaths: async () => ({}),
      controller: async () => ({
        profile: path,
        dataRoot: "/tmp",
        worker: {
          up: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }),
          status: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }),
          logs: async () => ({ path: "/tmp/worker.log", text: "" }),
          down: async () => ({ state: "stopped", profile: path, logPath: "/tmp/worker.log" }),
        },
        programs: {
          up: async () => {
            calls.push(`up ${path}`);
            return { dataRoot: "/tmp", programs: [] };
          },
          down: async () => ({ dataRoot: "/tmp", programs: [] }),
          report: async () => ({ dataRoot: "/tmp", programs: [] }),
        },
      }),
      preflight: async () => ({ dataRoot: "/tmp", diagnostics }),
      doctor: async () => ({ dataRoot: "/tmp", diagnostics: [] }),
      providers: async () => [],
      invoke: async () => { throw new Error("creation-time invocation is not part of this test"); },
      createRuntime: async () => {
        if (execution !== undefined) return execution;
        throw new Error("createRuntime is unavailable");
      },
      openControl: async () => ({ inspect: async () => undefined }),
    }),
  } as unknown as CliDistribution;
}

async function runSource(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-programs-"));
  const path = join(root, "build.svrun");
  await writeFile(path, '<?svml using="@hypit/run-markup@1"?>\n<svrun/>\n', "utf8");
  await writeFile(join(root, "main.svml"), "author", "utf8");
  return path;
}

test("Build fails its cheap preflight before submitting or starting programs", async () => {
  const calls: string[] = [];
  const source = await runSource();
  await assert.rejects(
    async () => await runCli(
      ["build", source, "--runtime", "/p/hypit.runtime.json"],
      io,
      distribution(calls, [{
        severity: "error",
        code: "MANAGED_PROGRAM_DOWN",
        subject: "whisperx",
        message: "whisperx is not usable",
      }]),
    ),
    /Runtime preflight failed/u,
  );
  assert.deepEqual(calls, []);
});

test("Build accepts a Result title and never provisions programs after a clean preflight", async () => {
  const calls: string[] = [];
  const source = await runSource();
  await assert.rejects(
    async () => await runCli(
      ["build", source, "--title", "first-cut", "--runtime", "/p/hypit.runtime.json"],
      io,
      distribution(calls, []),
    ),
    /createRuntime is unavailable/u,
  );
  assert.deepEqual(calls, []);
});

test("Build confirms durable submission before following stable work progress", async () => {
  const calls: string[] = [];
  const source = await runSource();
  const execution = {
    async build(request: { readonly id: string }) {
      calls.push("build");
      return {
        id: request.id,
        state: {
          targets: [{ output: "result" }],
          plan: { outputBindings: [] },
          records: [],
        },
        view: {
          id: request.id,
          createdAt: Date.now(),
          activity: "ready",
          cancellationRequested: false,
          targets: ["result"],
          requests: { total: 0, completed: 0 },
          acceptedRecords: 0,
          outstandingCommands: 0,
          operations: [],
        },
      };
    },
    async close() {},
  };
  let output = "";

  await runCli(
    ["build", source, "--runtime", "/p/hypit.runtime.json", "--follow", "--max-wait-ms", "0"],
    { write(text) { output += text; } },
    distribution(calls, [], "./main.svml", execution),
  );

  assert.deepEqual(calls, ["build"]);
  const submitted = output.indexOf("Build submitted");
  const working = output.indexOf("· Working");
  const active = output.indexOf("Build still active");
  assert.ok(submitted >= 0 && working > submitted && active > working);
  assert.match(output, /Target\s+result/u);
  assert.match(output, /Work\s+0 requests/u);
  assert.match(output, /Ctrl-C stops watching; the Build continues\./u);
});

test("plan preserves the selected work summary but exits non-zero when cheap preflight fails", async () => {
  const source = await runSource();
  let output = "";
  let exitCode: number | undefined;
  await runCli(
    ["plan", source, "--runtime", "/p/hypit.runtime.json", "--json"],
    {
      write(text) { output += text; },
      setExitCode(code) { exitCode = code; },
    },
    distribution([], [{
      severity: "error",
      code: "RUNTIME_CREDENTIAL_MISSING",
      message: "credential is absent",
    }]),
  );
  const value = JSON.parse(output) as {
    readonly ok: boolean;
    readonly steps: number;
    readonly preflight: { readonly ok: boolean };
  };
  assert.equal(value.ok, false);
  assert.equal(value.preflight.ok, false);
  assert.equal(typeof value.steps, "number");
  assert.equal(exitCode, 1);
});
