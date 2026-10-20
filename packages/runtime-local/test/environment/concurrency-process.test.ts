import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import test from "node:test";
import { defineBuild } from "@hypit/kernel";
import { FileBuildResultRepository } from "@hypit/result/node";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";
import { createGreetingBuild, manifest, capabilities, producers, types } from "../execution-scenario.js";
import { statePath } from "../../src/config.js";
import { superviseBuilds } from "../../src/supervisor.js";

const distribution = fileURLToPath(new URL("../../../../", import.meta.url));
async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Expected concurrency progress within 90 seconds");
    await pause(25);
  }
}

// Ordinary regressions exercise queueing and fully concurrent submissions without making
// every package test compete with a thousand-Build load experiment. The scale suite uses
// the same production path and assertions, and runs by itself through test/run.mjs.
const scenarios = process.env.HYPIT_RUNTIME_SCALE_TESTS === "1"
  ? [{ count: 1000, capacity: 1000 }]
  : [{ count: 24, capacity: 8 }, { count: 24, capacity: 24 }];

for (const scenario of scenarios) {
  test(`${scenario.count} Builds advance local work while remote capacity is ${scenario.capacity}`, { timeout: 120_000 }, async (t) => {
    const setupAt = Date.now();
    const root = await mkdtemp(join(tmpdir(), "hypit-many-builds-"));
    const dataRoot = join(root, "runtime");
    const profile = join(root, "profile.json");
    const state = new SqliteRuntimeState(statePath(dataRoot));
    const repository = new FileBuildResultRepository(join(root, "results"));
    const abort = new AbortController();
    let supervision: Promise<void> | undefined;
    let submitted = false, completed = false;
    const pending: ServerResponse[] = [];
    const local = new Set<string>(), starts = new Set<string>(), processes = new Set<number>();
    let peakRss = 0;
    const server = createServer(async (request, response) => {
      const parts: Buffer[] = [];
      for await (const chunk of request) parts.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(parts).toString()) as { name: string; pid: number; rss: number };
      const send = () => response.end(JSON.stringify({ complete: completed }));
      if (request.url === "/a") { local.add(body.name); send(); }
      else if (request.url === "/submit") {
        assert.ok(!starts.has(body.name), `Build ${body.name} must submit only once`);
        starts.add(body.name); processes.add(body.pid); peakRss = Math.max(peakRss, body.rss);
        if (submitted) send(); else pending.push(response);
      } else send();
    });
    server.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const endpoint = `http://127.0.0.1:${address.port}`;
    try {
      const pkg = join(root, "node_modules", "fixture-concurrency");
      await mkdir(pkg, { recursive: true });
    await mkdir(join(root, "node_modules", "@hypit"), { recursive: true });
    await symlink(join(distribution, "packages", "runtime-local"), join(root, "node_modules", "@hypit", "runtime-local"), process.platform === "win32" ? "junction" : "dir");
      await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "fixture-concurrency", version: "1.0.0", type: "module", hypit: { activation: "./activation.mjs" } }));
      await writeFile(join(pkg, "activation.mjs"), `
        import {createRuntimeEndpointAdapterFacet} from '@hypit/runtime-local/extension';
        import {defineEndpoint} from '@hypit/endpoint';
        const server=${JSON.stringify(endpoint)};
        async function call(path,name){const response=await fetch(server+path,{method:'POST',body:JSON.stringify({name,pid:process.pid,rss:process.memoryUsage().rss})});return response.json();}
        let localCount=0;
        export default {format:'hypit.package@1',modules:[{manifest:${JSON.stringify(manifest)}}],facets:[{abi:'hypit.producer-package@1',implementation:{producers:[
          {producer:${JSON.stringify(producers.makePrompt)},handler:async({inputs})=>{
            if(++localCount!==1)throw Error('Component state leaked between Builds');
            const name=inputs.intent.value.name;await call('/a',name);
            return {kind:'output',value:name};
          }},
          {producer:${JSON.stringify(producers.requestText)},handler:({inputs})=>({kind:'need',constraints:{prompt:inputs.prompt.value}})}
        ]}},createRuntimeEndpointAdapterFacet({use:'fixture-concurrency',activate(context){
          return {endpoint:defineEndpoint({instance:context.instance,pool:context.pool,
            defaultConcurrency:${scenario.capacity},actionLimits:{submit:{concurrency:${scenario.capacity}}},capabilities:[{lifecycle:'asynchronous',capability:${JSON.stringify(capabilities.generation)},returns:${JSON.stringify(types.generated)},endpoint:{
              async start({need,operation}){const name=need.constraints.prompt;await call('/submit',name);return {status:'pending',handle:{name},receipt:{id:operation},wakeAt:Date.now()+250};},
              async poll({handle}){const result=await call('/poll',handle.name);return result.complete?{status:'completed',result:{value:handle.name}}:{status:'pending',handle,wakeAt:Date.now()+1000};}
            }}]})};
        }})]};
      `);
      const profileValue = { format: "hypit.runtime-local@1", dataRoot, credentials: {},
        endpoints: { selected: { use: "fixture-concurrency", pool: "shared" } }, bindings: {} };
      await writeFile(profile, JSON.stringify(profileValue));
      const initial = createGreetingBuild({ targetOutputs: ["generated"] });
      const base = defineBuild({ program: initial.program, plan: initial.plan });
      const ids: string[] = [];
      for (let index = 0; index < scenario.count; index++) {
        const id = `bld_20260914T120000000Z_${String(index).padStart(10,"0")}`;
        ids.push(id);
        const request = { build: id, executionPackages: ["fixture-concurrency"],
          result: { root, path: "results" },
          context: { format: "hypit.local-execution@1", packageRoot: root, hostStateRoot: join(root,"host"), distributionPackageRoot: distribution, profile: profileValue },
        };
        await state.submissions.prepare(request);
        await repository.create({ id, source: { id: "main.svml" }, publication: { outputs: [{
          name: "generated", output: "generated", target: true, type: types.generated, source: { kind: "current-record", record: "generated:root" },
        }] } });
        await state.submissions.commit({ ...request,
          definition: { ...base, program: { ...base.program, records: base.program.records.map((record) => record.id === "intent:root"
            ? { ...record, value: ({ name: String(index) }) } : record) } },
          catalog: { source: { path: join(root,"main.svml") }, publication: { outputs: [{
            name:"generated",output:"generated",target:true,type:types.generated,source:{kind:"current-record",record:"generated:root"},
          }] } },
        });
      }
      const startedAt = Date.now();
      t.diagnostic(`prepared ${ids.length} Builds in ${startedAt-setupAt}ms`);
      supervision = superviseBuilds({ profile, dataRoot, readyFile: join(root,"ready"), owner:"concurrency-test", launch:{command:process.execPath,args:[join(distribution,"bin/hypit.mjs")]}, signal:abort.signal,ready:async()=>{} });
      await until(() => local.size === scenario.count && starts.size === scenario.capacity);
      assert.equal(processes.size, 1, "remote requests share one process, with private module bindings per Build");
      assert.equal((await state.execution.listCapacity()).length, scenario.capacity * 2, "each submitting operation owns its task and submit-action reservations");
      const allLocalAt = Date.now();
      submitted = true;
      for (const response of pending) response.end(JSON.stringify({complete:false}));
      await until(async () => (await state.operations.list({})).filter((item) => item.receipt !== undefined).length === scenario.capacity);
      assert.equal(local.size, scenario.count, "the remote wait must not prevent any local A step");
      completed = true;
      await until(async () => (await state.execution.list()).length === 0);
      assert.equal(starts.size, scenario.count);
      assert.equal((await state.execution.listCapacity()).length, 0);
      for (let index = 0; index < ids.length; index++) {
        const result = await repository.read(ids[index]!);
        assert.equal(result?.outcome, "complete", `Build ${index}`);
        const output = await repository.resolve(ids[index]!, "generated");
        assert.equal(output?.value.kind, "inline");
        assert.equal(output?.value.kind === "inline" ? output.value.value : undefined, String(index));
      }
      t.diagnostic(`local-ready=${allLocalAt-startedAt}ms total=${Date.now()-startedAt}ms executor-rss=${Math.round(peakRss/1024/1024)}MiB processes=${processes.size}`);
    } finally {
      const cleanupAt = Date.now();
      completed = true; submitted = true;
      for (const response of pending) if (!response.writableEnded) response.end(JSON.stringify({complete:true}));
      abort.abort(); await supervision;
      server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
      state.close(); await rm(root,{recursive:true,force:true});
      t.diagnostic(`executor shutdown and fixture cleanup=${Date.now()-cleanupAt}ms`);
    }
  });
}
