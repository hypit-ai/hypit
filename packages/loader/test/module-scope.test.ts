import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { NodeModuleScope } from "../src/node/module-scope.js";
import { installDistributionPackageResolution } from "../src/node/distribution-resolution.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("an official project extension keeps Build-local module state", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hypit-official-extension-scope-")));
  installDistributionPackageResolution([process.cwd()]);
  const a = new NodeModuleScope(); const b = new NodeModuleScope();
  try {
    const extension = join(root, "node_modules", "@hypit", "fixture-state");
    await mkdir(extension, { recursive: true });
    await writeFile(join(extension, "package.json"), JSON.stringify({
      name: "@hypit/fixture-state", version: "1.0.0", type: "module", exports: "./index.mjs",
    }));
    await writeFile(join(extension, "index.mjs"), "let count=0;export const next=()=>++count;");
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(join(root, "entry.mjs"), 'export {next} from "@hypit/fixture-state";');
    const url = pathToFileURL(join(root, "entry.mjs")).href;
    const first = await a.import(url) as { next: () => number };
    const second = await b.import(url) as { next: () => number };
    assert.equal(first.next(), 1);
    assert.equal(second.next(), 1);
    assert.equal(first.next(), 2);
  } finally { a.close(); b.close(); await rm(root, { recursive: true, force: true }); }
});

test("Build module scopes preserve captured bindings while loading later ESM and CommonJS dependencies", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hypit-module-scope-")));
  const a = new NodeModuleScope(); const b = new NodeModuleScope();
  try {
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(join(root, "entry.ts"), `
      import {revision} from './nested.mjs';
      import cjs, {next} from './state.cjs';
      import {readFileSync} from 'node:fs';
      enum Label { Name='count' }
      export const inspect=(): Record<string,unknown>=>({revision,cjs:cjs.revision,[Label.Name]:next(),
        file:import.meta.filename,dir:import.meta.dirname,url:import.meta.url,
        resolved:import.meta.resolve('./nested.mjs'),cjsFile:cjs.file,
        text:readFileSync(new URL('./data.txt',import.meta.url),'utf8')});
    `);
    await writeFile(join(root, "state.cjs"), `const dep=require('./dep.cjs');let n=0;
      exports.revision=dep.revision;exports.file=__filename;exports.next=()=>++n;`);
    await writeFile(join(root, "nested.mjs"), "export const revision='old';");
    await writeFile(join(root, "dep.cjs"), "exports.revision='old';");
    await writeFile(join(root, "typed.cts"), "enum Value { Answer=42 }; module.exports={value:Value.Answer};");
    const jsxPackage = join(root, 'node_modules', 'fixture-jsx');
    await mkdir(jsxPackage, {recursive:true});
    await writeFile(join(jsxPackage,'package.json'), '{"name":"fixture-jsx","type":"module","exports":{"./jsx-runtime":"./runtime.js"}}');
    await writeFile(join(jsxPackage,'runtime.js'), 'export const jsx=(tag,props)=>({tag,props});');
    await writeFile(join(root,'view.tsx'), `/** @jsxImportSource fixture-jsx */
      import {revision} from './nested.mjs';
      export const view=<card label={revision}/>;`);
    await writeFile(join(root, "data.txt"), "old data");
    const url = pathToFileURL(join(root, "entry.ts")).href;
    type Entry = { inspect: () => Record<string, unknown> };
    const old = await a.import(url) as Entry;
    assert.equal((await a.import(pathToFileURL(join(root, "typed.cts")).href) as {default:{value:number}}).default.value, 42);
    type View = {view: {tag:string,props:{label:string}}};
    const oldView = await a.import(pathToFileURL(join(root,'view.tsx')).href) as View;
    assert.equal(oldView.view.props.label,'old');
    assert.equal(old.inspect().count, 1);
    await writeFile(join(root, "nested.mjs"), "export const revision='new';");
    await writeFile(join(root, "dep.cjs"), "exports.revision='new';");
    await writeFile(join(root, "data.txt"), "new data");
    const next = await b.import(url) as Entry;
    assert.equal(await a.import(url), old);
    assert.deepEqual(old.inspect(), {revision:'old',cjs:'old',count:2,file:join(root,'entry.ts'),dir:root,url,
      resolved:pathToFileURL(join(root,'nested.mjs')).href,cjsFile:join(root,'state.cjs'),text:'new data'});
    assert.equal(next.inspect().count, 1);
    assert.equal(next.inspect().revision, "new");
    assert.equal(next.inspect().cjs, "new");
    const newView = await b.import(pathToFileURL(join(root,'view.tsx')).href) as View;
    assert.equal(newView.view.props.label,'new');
    assert.equal(oldView.view.props.label,'old');
  } finally { a.close(); b.close(); await rm(root,{recursive:true,force:true}); }
});

test("execution entry point keeps mixed module imports, top-level await, and circular CommonJS local to the Build", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-module-interop-"));
  try {
    await writeFile(join(root, "esm.mjs"), "export const value=42;");
    await writeFile(join(root, "async.mjs"), "await Promise.resolve(); export const value=43;");
    await writeFile(join(root, "circle.cjs"), "exports.ready=true;exports.entry=require('./entry.cjs');");
    await writeFile(join(root, "entry.cjs"), "exports.value=require('./esm.mjs').value;exports.circle=require('./circle.cjs');exports.dynamic=()=>import('./async.mjs');");
    await writeFile(join(root, "reexport.cjs"), "module.exports=require('./esm.mjs');");
    const loader = new URL("../src/node/module-scope.ts", import.meta.url).href;
    await writeFile(join(root, "check.mjs"), `
      import {register} from ${JSON.stringify(import.meta.resolve("tsx/esm/api"))};
      register();
      const {NodeModuleScope}=await import(${JSON.stringify(loader)});
      const {writeFile}=await import('node:fs/promises');
      const {default:assert}=await import('node:assert/strict');
      const a=new NodeModuleScope(),b=new NodeModuleScope();
      const entry=new URL('./entry.cjs',import.meta.url).href;
      try {
        const old=await a.import(entry);
        assert.equal((await a.import(new URL('./reexport.cjs',import.meta.url).href)).default.value,42);
        assert.equal(old.default.circle.entry,old.default);
        assert.equal((await old.default.dynamic()).value,43);
        await writeFile(new URL('./esm.mjs',import.meta.url),'export const value=44;');
        await writeFile(new URL('./async.mjs',import.meta.url),'export const value=45;');
        const next=await b.import(entry);
        assert.equal(old.default.value,42);assert.equal(next.default.value,44);
        assert.equal((await old.default.dynamic()).value,43);
        assert.equal((await next.default.dynamic()).value,45);
      }finally{a.close();b.close();}
    `);
    await promisify(execFile)(process.execPath, ["--experimental-vm-modules", join(root, "check.mjs")]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
