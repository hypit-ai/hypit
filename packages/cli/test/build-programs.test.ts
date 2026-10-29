import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { FileBuildResultRepository } from "@hypit/result/node";
import { createRunFrontendFacet } from "@hypit/run";
import { createProducerPackageFacet } from "@hypit/producer";

import { runCli as runCliEngine } from "../src/main.js";
import { commandHint } from "../src/command-hint.js";
import type { CliDistribution } from "../src/distribution.js";
import type { CliDiagnostic as RuntimeDoctorDiagnostic } from "../src/runtime-port.js";

const io = { write: () => {} };
const runCli: typeof runCliEngine = async (argv, output, selected) => await runCliEngine(argv, output, selected, {
  cwd: tmpdir(),
  resolveProjectRoot: async (explicit) => await realpath(explicit ?? tmpdir()),
});

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
  producerError?: string,
): CliDistribution {
  return {
    bootstrapPackages: [{
      specifier: "@example/run-frontend",
      contribution: {
        format: "hypit.package@1",
        facets: [createRunFrontendFacet({
        id: "@hypit/markup/run@1",
        discover: () => ({ author: { source: authorSource }, imports: [] }),
        decode: () => ({ document: {
          format: "hypit.run-document@1",
          author: { source: authorSource },
          imports: [],
          targets: [{ output: "result" }],
          candidates: [],
          satisfactions: [],
        } }),
        }), ...(producerError === undefined ? [] : [createProducerPackageFacet({
          producers: [{
            producer: { module: { name: "example.value", version: "1" }, name: "produce" },
            handler() { throw new Error(producerError); },
          }],
        })])],
      },
    }],
    createCompiler: () => ({
      openEntry: async (path: string) => {
        const source = async (name: string) => ({
          unit: { id: name, name, bytes: new TextEncoder().encode(await readFile(name, "utf8")) },
          frontend: name.endsWith(".svrun") ? "@hypit/markup/run@1" : "@hypit/markup@1",
        });
        return {
          entry: await source(path),
          resolveSource: async (_importer: unknown, request: { readonly from: string }) =>
            await source(join(path, "..", request.from)),
          attachments: async () => [],
        };
      },
      supportsFrontend: () => false,
      compileResolvedSource: async (entry: { readonly unit: { readonly id: string } }) => ({
        closure: { entry: entry.unit.id, units: [] },
        provenance: { format: "hypit.author-provenance@1", elements: [] },
        program: { closure: { format: "hypit.closure@1", modules: [{ manifest: {
          format: "hypit.module@1",
          name: "example.value",
          version: "1",
          dependencies: [],
          types: [{ name: "Value" }],
          capabilities: [],
          producers: producerError === undefined ? [] : [{
            name: "produce", inputs: [], needs: [],
            outputs: [{ name: "result", type: { module: { name: "example.value", version: "1" }, name: "Value" } }],
          }],
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
            root: producerError === undefined ? { kind: "value", value: {
              id: "record-result",
              value: { kind: "inline", value: "ready" },
            } } : { kind: "operation", result: { kind: "operation-result", operation: "produce-result" } },
          }],
          operations: producerError === undefined ? [] : [{
            id: "produce-result",
            producer: { module: { name: "example.value", version: "1" }, name: "produce" },
            inputs: {}, result: { kind: "output", name: "result", record: "record-result" },
          }],
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
      ensureExecution: async () => ({ state: "running" as const }),
      executionStatus: async () => ({ state: "running" as const }),
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
      pricing: async () => [],
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
  await writeFile(path, '<?svml using="@hypit/markup/run@1"?>\n<svrun/>\n', "utf8");
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

test("Build without a Runtime does not execute project build inputs", async () => {
  const source = await runSource();
  const projectRoot = dirname(source);
  const marker = join(projectRoot, "hook-ran.txt");
  await writeFile(join(projectRoot, "package.json"), JSON.stringify({
    hypit: { buildInputs: [{
      id: "fixture",
      command: `node -e "require('node:fs').writeFileSync('${marker}', 'ran')"`,
      inputs: ["main.svml"],
      outputs: ["generated.txt"],
    }] },
  }));

  try {
    await assert.rejects(
      runCli(["build", source], io, distribution([], [])),
      /build requires a Runtime/u,
    );
    await assert.rejects(readFile(marker, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("Build validates the selected Runtime before executing project build inputs", async () => {
  const source = await runSource();
  const projectRoot = dirname(source);
  const marker = join(projectRoot, "hook-ran.txt");
  await writeFile(join(projectRoot, "package.json"), JSON.stringify({
    hypit: { buildInputs: [{
      id: "fixture",
      command: `node -e "require('node:fs').writeFileSync('${marker}', 'ran')"`,
      inputs: ["main.svml"],
      outputs: ["generated.txt"],
    }] },
  }));
  const invalid = {
    ...distribution([], []),
    openRuntimeHost: async () => { throw new Error("invalid Runtime profile"); },
  } as CliDistribution;

  try {
    await assert.rejects(
      runCli(["build", source, "--runtime", "/invalid/runtime.json"], io, invalid),
      /invalid Runtime profile/u,
    );
    await assert.rejects(readFile(marker, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("Build resolves the Runtime profile before executing project build inputs", async () => {
  const source = await runSource();
  const projectRoot = dirname(source);
  const marker = join(projectRoot, "hook-ran.txt");
  await writeFile(join(projectRoot, "package.json"), JSON.stringify({
    hypit: { buildInputs: [{
      id: "fixture",
      command: `node -e "require('node:fs').writeFileSync('${marker}', 'ran')"`,
      inputs: ["main.svml"],
      outputs: ["generated.txt"],
    }] },
  }));
  const invalid = distribution([], []);
  invalid.openRuntimeHost = async () => ({
    ...await distribution([], []).openRuntimeHost("/invalid/runtime.json", { packageRoot: projectRoot }),
    resolvePaths: async () => { throw new Error("invalid Runtime profile"); },
  });

  try {
    await assert.rejects(
      runCli(["build", source, "--runtime", "/invalid/runtime.json"], io, invalid),
      /invalid Runtime profile/u,
    );
    await assert.rejects(readFile(marker, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
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

  output = "";
  let progress = "";
  const projectRoot = await realpath(dirname(source));
  const runtimeProfile = resolve("/p/a selected runtime.json");
  await runCli([
    "build", source, "--project", projectRoot, "--runtime", runtimeProfile,
    "--follow", "--max-wait-ms", "0", "--json",
  ], {
    write(text) { output += text; }, writeProgress(text) { progress += text; },
  }, distribution(calls, [], "./main.svml", execution));
  const build = JSON.parse(output).build;
  assert.equal(build.work.state, "working");
  assert.match(progress, /Working/u);

  output = "";
  await runCli([
    "build", source, "--project", projectRoot, "--runtime", runtimeProfile,
  ], { write(text) { output += text; } }, distribution(calls, [], "./main.svml", execution));
  const id = /Watch\s+hypit status (\S+)/u.exec(output)?.[1];
  assert.ok(id);
  assert.ok(output.includes(commandHint(["status", id, "--watch"], { projectRoot, runtimeProfile })));
  assert.ok(output.includes(commandHint(["cancel", id], { projectRoot, runtimeProfile })));
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
  assert.equal("steps" in value, false);
  assert.equal(exitCode, 1);
});

test("pricing reports a Producer failure with no external Need and exits non-zero in human and JSON modes", async () => {
  const source = await runSource();
  for (const json of [false, true]) {
    for (const producerError of [undefined, "Timeline end must be after its start"]) {
      let output = "";
      let exitCode = 0;
      await runCli([
        "pricing", source, "--runtime", "/p/hypit.runtime.json", "--limit", "1",
        ...(json ? ["--json"] : []),
      ], {
        write(text) { output += text; },
        setExitCode(code) { exitCode = code; },
      }, distribution([], [], "./main.svml", undefined, producerError));
      assert.equal(exitCode, producerError === undefined ? 0 : 1);
      if (producerError !== undefined) assert.ok(output.includes(producerError));
      if (json) {
        const value = JSON.parse(output);
        assert.equal(value.requestCount, 0);
        assert.deepEqual(value.groups, []);
        assert.equal(value.producerFailureCount, producerError === undefined ? 0 : 1);
        assert.equal(value.producerFailures.length, value.producerFailureCount);
      }
    }
  }
});
