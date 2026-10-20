import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import test from "node:test";
import { defineBuild } from "@hypit/kernel";
import { FileBuildResultRepository } from "@hypit/result/node";
import { installDistributionPackageResolution } from "@hypit/loader/node";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";
import { createGreetingBuild, manifest, capabilities, producers, types } from "../execution-scenario.js";
import { createRuntimeFromConfig, statePath } from "../../src/config.js";
import { superviseBuilds } from "../../src/supervisor.js";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const cli = join(repository, "bin/hypit.mjs");
installDistributionPackageResolution([repository]);
async function eventually<T>(read: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await pause(30);
  }
  throw new Error("Expected execution progress within 30 seconds");
}
async function exists(path: string): Promise<boolean> { return access(path).then(() => true, () => false); }

test("isolated Builds load fresh transitive code and Profile choices, share capacity, and retain failed attempts", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-build-scope-"));
  const dataRoot = join(root, "runtime");
  const project = join(root, "project-a");
  const otherProject = join(root, "project-b");
  const profile = join(root, "runtime.json");
  const abort = new AbortController();
  let supervision: Promise<void> | undefined;
  const state = new SqliteRuntimeState(statePath(dataRoot));
  const runtimes: Awaited<ReturnType<typeof createRuntimeFromConfig>>[] = [];
  const requests: string[] = [];
  async function packageAt(directory: string, revision: string) {
    const pkg = join(directory, "node_modules", "fixture-components");
    await mkdir(pkg, { recursive: true });
    await mkdir(join(directory, "node_modules", "@hypit"), { recursive: true });
    await symlink(join(repository, "packages", "runtime-local"), join(directory, "node_modules", "@hypit", "runtime-local"), process.platform === "win32" ? "junction" : "dir");
    await writeFile(join(directory, "package.json"), JSON.stringify({ private: true, hypit: { project: true } }));
    await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "fixture-components", version: "1.0.0", type: "module", hypit: { activation: "./activation.ts" } }));
    await writeFile(join(pkg, "revision.ts"), `export const revision: string = ${JSON.stringify(revision)};`);
    await writeFile(join(pkg, "activation.ts"), `
      import { revision } from './revision.js';
      import { access, writeFile, appendFile } from 'node:fs/promises';
      import { setTimeout as pause } from 'node:timers/promises';
      import { createRuntimeEndpointAdapterFacet } from '@hypit/runtime-local/extension';
      import { defineEndpoint } from '@hypit/endpoint';
      const producers = ${JSON.stringify(producers)};
      export default {
        format: 'hypit.package@1', modules: [{ manifest: ${JSON.stringify(manifest)} }],
        facets: [{ abi: 'hypit.producer-package@1', implementation: { producers: [
          { producer: producers.makePrompt, handler: () => ({ kind: 'output', value: revision }) },
          { producer: producers.requestText, handler: ({ inputs }) => ({ kind: 'need', constraints: { prompt: inputs.prompt.value } }) },
          { producer: producers.assemble, handler: ({ inputs }) => ({ kind: 'output', value: { text: inputs.generated.value, revision } }) },
        ] } }, createRuntimeEndpointAdapterFacet({ use: 'fixture-components', activate(context) {
          const config = context.config;
          return { endpoint: defineEndpoint({
            instance: context.instance, pool: context.pool, defaultConcurrency: 1,
            capabilities: [config.remote ? {
              lifecycle: 'asynchronous', capability: ${JSON.stringify(capabilities.generation)}, returns: ${JSON.stringify(types.generated)},
              endpoint: {
                async start({ operation }) {
                  await appendFile(config.entered, JSON.stringify({ pid: process.pid, operation }) + '\\n');
                  return { status: 'pending', handle: { task: operation }, receipt: { id: operation }, wakeAt: Date.now() + 100 };
                },
                async poll({ handle }) {
                  if (!await access(config.gate).then(() => true, () => false)) return { status: 'pending', handle, wakeAt: Date.now() + 100 };
                  return { status: 'completed', result: { value: revision + ':' + config.label } };
                },
                async cancel() { await writeFile(config.gate + '.cancelled', ''); return { status: 'confirmed' }; }
              }
            } : {
              lifecycle: 'immediate', capability: ${JSON.stringify(capabilities.generation)}, returns: ${JSON.stringify(types.generated)},
              async handler() {
                await writeFile(config.entered, JSON.stringify({ revision, label: config.label, pid: process.pid }));
                while (!await access(config.gate).then(() => true, () => false)) await pause(25);
                return { value: revision + ':' + config.label };
              }
            }]

          }) };
        } })]
      };
    `);
    return pkg;
  }
  async function submit(name: string, directory: string, label: string, remote = false) {
    const id = `bld_20260913T12000000${requests.length}Z_0000000001`;
    requests.push(id);
    await writeFile(profile, JSON.stringify({ format: "hypit.runtime-local@1", dataRoot, credentials: {},
      endpoints: {
        selected: { use: "fixture-components", pool: "shared", config: { label, remote, gate: join(root, name + ".gate"), entered: join(root, name + ".entered") } },
        unused: { use: "this-provider-is-not-installed" },
      }, bindings: {} }));
    const runtime = await createRuntimeFromConfig(profile, { packageRoot: directory, distributionPackageRoot: repository, endpoints: ["selected"] });
    runtimes.push(runtime);
    const initial = createGreetingBuild();
    await runtime.build({ id,
      definition: defineBuild({ program: initial.program, plan: initial.plan }),
      executionPackages: ["fixture-components"],
      catalog: { source: { path: join(directory, "main.svml") }, publication: { outputs: [{
        name: "document", output: "document", target: true, type: types.document, source: { kind: "current-record", record: "document:root" },
      }] } },
      result: { repository: { root: directory, path: "results" } },
    });
    return id;
  }
  const completed = (directory: string, id: string) => eventually(async () => {
    const value = await new FileBuildResultRepository(join(directory, "results")).read(id);
    return value?.outcome === undefined ? undefined : value;
  });
  const value = async (directory: string, id: string) => {
    const output = await new FileBuildResultRepository(join(directory, "results")).resolve(id, "document");
    assert.equal(output?.value.kind, "value");
    return output?.value.kind === "value" ? output.value.document.value : undefined;
  };
  try {
    const pkg = await packageAt(project, "old");
    await packageAt(otherProject, "other-project");
    await writeFile(profile, JSON.stringify({ format: "hypit.runtime-local@1", dataRoot }));
    let ready!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    supervision = superviseBuilds({ profile, dataRoot, readyFile: join(root, "ready"), owner: "test-supervisor",
      launch: { command: process.execPath, args: [cli] }, signal: abort.signal, ready: async () => ready() });
    await started;
    const a = await submit("a", project, "old-profile");
    const first = await eventually(async () => exists(join(root, "a.entered")).then(async (ok) => ok ? JSON.parse(await readFile(join(root, "a.entered"), "utf8")) : undefined));
    await writeFile(join(pkg, "revision.ts"), `export const revision: string = 'new';`);
    const b = await submit("b", project, "new-profile");
    await eventually(async () => {
      const execution = await state.execution.read(b);
      return execution?.startedAt !== undefined && execution.wakeAt === undefined ? true : undefined;
    });
    assert.equal(await exists(join(root, "b.entered")), false, "shared capacity must hold B while A is executing");
    await writeFile(join(root, "b.gate"), "");
    await writeFile(join(root, "a.gate"), "");
    const [resultA, resultB] = await Promise.all([completed(project, a), completed(project, b)]);
    assert.equal(resultA.outcome, "complete");
    assert.equal(resultB.outcome, "complete");
    assert.deepEqual(await value(project, a), { text: "old:old-profile", revision: "old" });
    assert.deepEqual(await value(project, b), { text: "new:new-profile", revision: "new" });
    const second = JSON.parse(await readFile(join(root, "b.entered"), "utf8"));
    assert.equal(first.pid, second.pid, "isolated Build modules share one asynchronous execution carrier");
    await writeFile(join(root, "c.gate"), "");
    const c = await submit("c", otherProject, "third-profile");
    assert.equal((await completed(otherProject, c)).outcome, "complete");
    assert.deepEqual(await value(otherProject, c), { text: "other-project:third-profile", revision: "other-project" });
    const d = await submit("d", project, "lost-executor");
    const lost = await eventually(async () => exists(join(root, "d.entered")).then(async (ok) => ok ? JSON.parse(await readFile(join(root, "d.entered"), "utf8")) : undefined));
    process.kill(lost.pid, "SIGKILL");
    const failed = await completed(project, d);
    assert.equal(failed.outcome, "failed");
    assert.match(failed.failure!, /executor exited/u);
    assert.equal((await state.execution.listCapacity()).length, 0);
    const e = await submit("e", project, "remote-job", true);
    const remote = await eventually(async () => {
      const [operation] = await state.operations.list({ build: e });
      const ended = await new FileBuildResultRepository(join(project, "results")).read(e);
      if (ended?.outcome !== undefined) throw new Error(JSON.stringify(ended));
      return operation?.receipt === undefined ? undefined : operation;
    });
    const remoteProcess = JSON.parse((await readFile(join(root, "e.entered"), "utf8")).trim());
    process.kill(remoteProcess.pid, "SIGKILL");
    const remoteFailed = await completed(project, e);
    assert.equal(remoteFailed.outcome, "failed");
    assert.deepEqual(remoteFailed.operations?.[0]?.receipt, remote.receipt);
    assert.equal((await readFile(join(root, "e.entered"), "utf8")).trim().split("\n").length, 1);
    const f = await submit("f", project, "cancel-job", true);
    await eventually(async () => (await state.operations.list({ build: f }))[0]?.receipt);
    await state.execution.requestStop(f, { cause: "user-cancelled", reason: "user cancelled" });
    assert.equal((await completed(project, f)).outcome, "cancelled");
    assert.equal(await exists(join(root, "f.gate.cancelled")), true);
    assert.equal((await state.execution.listCapacity()).length, 0);
  } finally {
    for (const name of ["a", "b", "c", "d", "e", "f"]) await writeFile(join(root, name + ".gate"), "").catch(() => undefined);
    abort.abort();
    await supervision;
    await Promise.all(runtimes.map((runtime) => runtime.close()));
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
