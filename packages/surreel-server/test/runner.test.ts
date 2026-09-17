import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { createCodegraffRunner } from "../src/runner.js";
import { loadConfig } from "../src/config.js";
import { ProjectStore } from "../src/store.js";

// This executable speaks only the SDK's stdio protocol. It never calls a model or provider.
const protocolFixture = `#!${process.execPath}
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
let seq = 0;
const emit = (event) => process.stdout.write(JSON.stringify({seq:++seq,...event})+'\\n');
const mode = process.argv[process.argv.indexOf('--model') + 1];
createInterface({input:process.stdin}).on('line', (line) => {
 const request = JSON.parse(line);
 if(request.type === 'user') {
  writeFileSync('protocol-capture.json',JSON.stringify({request,args:process.argv,hasSessionToken:'SURREEL_SESSION_TOKEN' in process.env}));
  emit({type:'started',provider:'fixture',model:mode});
  if(mode === 'fixture-error') { emit({type:'error',message:'Provider authentication is missing.'}); return; }
  if(mode === 'fixture-ask') { emit({type:'ask_user',call_id:'fixture-question',question:'Which narration voice?',input:{}}); return; }
  emit({type:'text',text:'Creating the title sequence.\\n'});
  emit({type:'tool_call',name:'write_file',input:{path:'title.svml'}});
  if(mode === 'fixture-wait') return;
  emit({type:'turn',text:'The fixture turn finished.',complete:true,context_tokens:0,cost_usd:0,input_tokens:0,uncached_input_tokens:0,cache_read_tokens:0,output_tokens:0,api_calls:0,subscription_calls:0,unpriced_calls:0});
 } else if(request.type === 'cancel' || request.type === 'answer') {
  emit({type:'error',message:'turn cancelled'});
 }
}).on('close',()=>process.exit(0));
`;

async function fixture(t: TestContext, model = "fixture-success") {
  const root = await mkdtemp(join(tmpdir(), "surreel-sdk-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binary = join(root, "graff-fixture.mjs");
  await writeFile(binary, protocolFixture);
  await chmod(binary, 0o700);
  const distribution = join(root, "distribution");
  await mkdir(join(distribution, "bin"), { recursive: true });
  await mkdir(join(distribution, "skills", "hypit"), { recursive: true });
  await writeFile(join(distribution, "bin", "hypit.mjs"), "// Fixture only\n");
  await writeFile(join(distribution, "skills", "hypit", "SKILL.md"), "# Fixture production skill\n");
  const config = loadConfig({ SURREEL_PROJECTS_DIR: join(root, "data"), SURREEL_HYPIT_DIR: distribution,
    SURREEL_GRAFF_BINARY: binary, SURREEL_AGENT_MODEL: model });
  const store = new ProjectStore(config.projectsDir);
  await store.initialize();
  const project = await store.create({ title: "Fixture", prompt: "Make a simple title animation.", aspectRatio: "9:16", duration: 15, style: "Talking-head UGC", format: "talking-head" });
  const workspace = store.workspacePath(project.id);
  const outputDir = join(workspace, "outputs", "fixture-run");
  const events: { type: string; message: string }[] = [];
  const controller = new AbortController();
  const runner = createCodegraffRunner(config);
  const input = { project, workspace, outputDir, signal: controller.signal,
    emit: async (type: string, message: string) => { events.push({ type, message }); } };
  return { runner, input, events, workspace, controller, root };
}

test("the production adapter drives the real SDK and retains its default permission policy", { skip: process.platform === "win32" }, async (t) => {
  const value = await fixture(t);
  const previousToken = process.env.SURREEL_SESSION_TOKEN;
  process.env.SURREEL_SESSION_TOKEN = "fixture-session-token-must-not-reach-agent";
  try {
    assert.equal(await value.runner.available(), true);
    await value.runner.run(value.input);
  } finally {
    if (previousToken === undefined) delete process.env.SURREEL_SESSION_TOKEN;
    else process.env.SURREEL_SESSION_TOKEN = previousToken;
  }
  const capture = JSON.parse(await readFile(join(value.workspace, "protocol-capture.json"), "utf8")) as {
    request: { type: string; text: string }; args: string[]; hasSessionToken: boolean;
  };
  assert.equal(capture.request.type, "user");
  assert.ok(capture.args.includes("--json"));
  assert.equal(capture.args.includes("--yolo"), false);
  assert.equal(capture.hasSessionToken, false);
  assert.ok(value.events.some((event) => event.type === "tool" && event.message.includes("write file")));
  assert.ok(value.events.some((event) => event.message === "The fixture turn finished."));
  const brief = await readFile(join(value.workspace, "SURREEL_BRIEF.json"), "utf8");
  assert.match(brief, /Make a simple title animation/);
  assert.match(brief, /talking-head\.md/);
  assert.match(brief, /image-direction/);
});

test("the SDK adapter surfaces provider errors and questions instead of declaring success", { skip: process.platform === "win32" }, async (t) => {
  const failed = await fixture(t, "fixture-error");
  await assert.rejects(failed.runner.run(failed.input), /Provider authentication is missing/);
  const question = await fixture(t, "fixture-ask");
  await assert.rejects(question.runner.run(question.input), /agent needs input: Which narration voice/);
});

test("AbortSignal stops the active SDK turn", { skip: process.platform === "win32" }, async (t) => {
  const value = await fixture(t, "fixture-wait");
  const pending = value.runner.run({ ...value.input, emit: async (type, message) => {
    value.events.push({ type, message });
    if (type === "tool") value.controller.abort(new Error("Stopped by test."));
  } });
  await assert.rejects(pending, /cancelled|Stopped by test/);
  assert.equal(value.controller.signal.aborted, true);
});

test("the adapter refuses a brief symlink left by a prior run", { skip: process.platform === "win32" }, async (t) => {
  const value = await fixture(t);
  const outside = join(value.root, "outside.txt");
  await writeFile(outside, "preserve");
  await symlink(outside, join(value.workspace, "SURREEL_BRIEF.json"));
  await assert.rejects(value.runner.run(value.input));
  assert.equal(await readFile(outside, "utf8"), "preserve");
});
