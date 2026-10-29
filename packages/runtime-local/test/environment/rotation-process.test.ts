import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
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

const distribution = fileURLToPath(new URL("../../../../", import.meta.url));
async function until(predicate: () => boolean | Promise<boolean>, detail: () => string): Promise<void> {
  const deadline = Date.now()+20_000;
  while (!await predicate()) {
    if (Date.now()>deadline) throw new Error(`Expected rotation progress: ${detail()}`);
    await pause(20);
  }
}
function alive(pid: number): boolean { try { process.kill(pid,0); return true; } catch { return false; } }

test("a draining carrier finishes its existing Build while a new carrier shares resource limits", {timeout:40_000}, async () => {
  const root=await mkdtemp(join(tmpdir(),"hypit-carrier-rotation-"));
  const dataRoot=join(root,"runtime"), profile=join(root,"profile.json");
  const state=new SqliteRuntimeState(statePath(dataRoot));
  const repository=new FileBuildResultRepository(join(root,"results"));
  const local=new Map<string,number>(), starts=new Map<string,number>(), finished=new Set<string>();
  let child: ChildProcess | undefined, exited: Promise<void> | undefined, log="", release=false;
  const server=createServer(async(req,res)=>{
    const chunks:Buffer[]=[]; for await(const chunk of req) chunks.push(Buffer.from(chunk));
    const {name,pid}=JSON.parse(Buffer.concat(chunks).toString()) as {name:string,pid:number};
    if(req.url==='/local') local.set(name,pid);
    if(req.url==='/start') { assert.ok(!starts.has(name),`duplicate submission ${name}`); starts.set(name,pid); }
    res.end(JSON.stringify({complete:release}));
  });
  server.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address(); assert.ok(address && typeof address==='object');
  const endpoint=`http://127.0.0.1:${address.port}`;
  try {
    const pkg=join(root,'node_modules','fixture-rotation'); await mkdir(pkg,{recursive:true});
    await mkdir(join(root, "node_modules", "@hypit"), { recursive: true });
    await symlink(join(distribution, "packages", "runtime-local"), join(root, "node_modules", "@hypit", "runtime-local"), process.platform === "win32" ? "junction" : "dir");
    await writeFile(join(root,'package.json'),'{"private":true,"hypit":{"project":true}}');
    await writeFile(join(pkg,'package.json'),JSON.stringify({name:'fixture-rotation',version:'1.0.0',type:'module',hypit:{activation:'./activation.mjs'}}));
    await writeFile(join(pkg,'activation.mjs'),`
      import {createRuntimeEndpointAdapterFacet} from '@hypit/runtime-local/extension';
      import {defineEndpoint} from '@hypit/endpoint';
      const server=${JSON.stringify(endpoint)};
      async function call(path,name){return (await fetch(server+path,{method:'POST',body:JSON.stringify({name,pid:process.pid})})).json();}
      let calls=0;
      export default {format:'hypit.package@1',modules:[{manifest:${JSON.stringify(manifest)}}],facets:[{abi:'hypit.producer-package@1',implementation:[
        {producer:${JSON.stringify(producers.makePrompt)},handler:async({inputs})=>{
          if(++calls!==1)throw Error('Build module state leaked');
          const name=inputs.intent.value.name;await call('/local',name);return {kind:'output',value:name};
        }},
        {producer:${JSON.stringify(producers.requestText)},handler:({inputs})=>({kind:'need',constraints:{prompt:inputs.prompt.value}})}
      ]},createRuntimeEndpointAdapterFacet({use:'fixture-rotation',activate(context){return {endpoint:defineEndpoint({
        instance:context.instance,pool:context.pool,defaultConcurrency:1,
        capabilities:[{lifecycle:'asynchronous',capability:${JSON.stringify(capabilities.generation)},returns:${JSON.stringify(types.generated)},endpoint:{
          async start({need,operation}){const name=need.constraints.prompt;await call('/start',name);return {status:'pending',handle:{name},receipt:{id:operation},wakeAt:Date.now()+50};},
          async poll({handle}){const result=await call('/poll',handle.name);return result.complete?{status:'completed',result:handle.name}:{status:'pending',handle,wakeAt:Date.now()+50};}
        }}]})};}})]};
    `);
    // A deliberately tiny soft budget exercises retirement without allocating large buffers.
    const profileValue={format:'hypit.runtime-local@1',dataRoot,worker:{executionMemoryMb:1},credentials:{},endpoints:{selected:{use:'fixture-rotation',pool:'shared'}},bindings:{}};
    await writeFile(profile,JSON.stringify(profileValue));
    const ids=new Map<string,string>();
    async function submit(name:string,target:'prompt'|'generated'){
      const id=`bld_20260914T120000000Z_${String(ids.size).padStart(10,'0')}`;ids.set(name,id);
      const initial=createGreetingBuild({targetOutputs:[target]});
      const base=defineBuild({program:initial.program,plan:initial.plan});
      const record=target==='prompt'?'prompt:root':'generated:root';
      const request={build:id,executionPackages:['fixture-rotation'],result:{root,path:'results'},
        context:{format:'hypit.local-execution@1',packageRoot:root,hostStateRoot:join(root,'host'),distributionPackageRoot:distribution,profile:profileValue}};
      await state.submissions.prepare(request);
      await repository.create({id,sourceId:'main.svml',publication:{outputs:[{
        name:target,output:target,target:true,type:types[target],record,
      }]}});
      await state.submissions.commit({...request,definition:{...base,program:{...base.program,records:base.program.records.map(r=>r.id==='intent:root'?{...r,value:({name})}:r)}}});
      return id;
    }
    child=spawn(process.execPath,[join(distribution,'bin/hypit.mjs'),'_worker',profile,'--package-root',root,'--ready-file',join(root,'ready'),'--worker-owner','rotation-test'],{cwd:root,stdio:['ignore','pipe','pipe']});
    child.stdout!.on('data',data=>{log+=String(data);}); child.stderr!.on('data',data=>{log+=String(data);});
    exited=new Promise<void>((resolve,reject)=>{child!.once('error',reject);child!.once('close',()=>resolve());});
    const a=await submit('A','generated');await until(()=>starts.has('A'),()=>log);
    const oldPid=local.get('A')!;
    const b=await submit('B','prompt');
    await until(()=>log.includes(`Executor ${oldPid}: draining`),()=>log);
    assert.equal(local.get('B'),oldPid);assert.equal((await repository.read(b))?.outcome,'complete');
    const c=await submit('C','generated');await until(()=>local.has('C'),()=>log);
    const newPid=local.get('C')!;assert.notEqual(newPid,oldPid);assert.ok(alive(oldPid));
    await until(async()=>{const current=await state.execution.read(c);return current?.startedAt!==undefined && current.turn===undefined && current.wakeAt===undefined;},()=>log);
    assert.deepEqual([...starts.keys()],['A'],'new carrier shares the occupied remote pool');
    assert.equal((await repository.read(a))?.outcome,undefined);
    release=true;
    await until(async()=>{for(const [name,id] of ids){if((await repository.read(id))?.outcome==='complete')finished.add(name);}return finished.size===3;},()=>log);
    await until(()=>!alive(oldPid)&&!alive(newPid),()=>log);
    assert.deepEqual([...starts.keys()],['A','C']);assert.equal(starts.get('A'),oldPid);assert.equal(starts.get('C'),newPid);
    assert.equal((await state.execution.listCapacity()).length,0);
    assert.ok(child.exitCode===null,'coordinator stays available after both carriers drain');
  } finally {
    release=true;child?.kill('SIGTERM');await exited;
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));state.close();await rm(root,{recursive:true,force:true});
  }
});
