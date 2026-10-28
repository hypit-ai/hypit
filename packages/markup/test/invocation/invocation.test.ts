import assert from "node:assert/strict";
import test from "node:test";

import type { CompiledSourceClosure } from "@hypit/author";
import { createResolvedClosure, link, sealAuthorGraph } from "@hypit/kernel";
import { parseInvocationSourceDocument, invocationMarkupFrontend } from "@hypit/markup/invocation";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import {
  compileInvocationSource,
  resolveInvocationSourceDocument,
  InvocationFrontendRegistry,
} from "@hypit/invocation";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";

const moduleRef = { name: "example.invocation", version: "1" } as const;
const promptType = { module: moduleRef, name: "Prompt" } satisfies TypeRef;
const mediaType = { module: moduleRef, name: "Media" } satisfies TypeRef;
const defaultProducer = { module: moduleRef, name: "default" } satisfies ProducerRef;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [promptType.name, mediaType.name],
  capabilities: [],
  producers: [{
    name: defaultProducer.name,
    inputs: [{ name: "prompt", type: promptType }],
    result: { kind: "output", name: "media", type: mediaType },
  }],
};

function fixture(): CompiledSourceClosure {
  const closure = createResolvedClosure([manifest]);
  const prompt = { id: "prompt:root", type: promptType, value: "A deliberate preview." };
  const accepted = { id: "media:accepted", type: mediaType, value: "Already accepted." };
  const program = link(closure, [prompt, accepted]);
  const graph = sealAuthorGraph({
    outputs: [{ id: "left", type: mediaType, primary: "default:candidate" }],
    candidates: [{
      id: "default:candidate",
      type: mediaType,
      root: { kind: "operation-result", operation: "default:operation" },
    }],
    operations: [{
      id: "default:operation",
      producer: defaultProducer,
      inputs: { prompt: { kind: "record", id: prompt.id } },
      result: { kind: "output", name: "media", record: "default:record" },
    }],
  });
  return {
    closure: { entry: "main.svml", units: [] },
    program,
    graph,
    realizations: [],
    exports: [
      { name: "accepted", type: mediaType, ref: { kind: "record", id: accepted.id } },
      { name: "left", type: mediaType, ref: { kind: "logical-output", id: "left" } },
    ],
    provenance: { format: "hypit.author-provenance@1", elements: [] },
  };
}

async function compileDocument(body: string) {
  const frontends = new InvocationFrontendRegistry();
  frontends.register(invocationMarkupFrontend);
  return await compileInvocationSource(resolveSelfDescribedTextSource({
    id: "/project/build.svrun",
    name: "build.svrun",
    text: `<?svml using="@hypit/markup/invocation@1"?>\n${body}`,
  }), frontends);
}

test("Invocation Source compilation consumes decode output without repeating discovery", async () => {
  const frontends = new InvocationFrontendRegistry();
  frontends.register({
    ...invocationMarkupFrontend,
    discover() {
      throw new Error("discovery must not run during compilation");
    },
  });
  const compiled = await compileInvocationSource(resolveSelfDescribedTextSource({
    id: "/project/build.svrun",
    name: "build.svrun",
    text: `<?svml using="@hypit/markup/invocation@1"?>\n<svrun version="1"><author source="./main.svml"/><target output="left"/></svrun>`,
  }), frontends);
  assert.deepEqual(compiled.targets, ["left"]);
});

test("Invocation Markup lowers primary and Record overrides to a source-neutral Invocation", async () => {
  const compilation = fixture();
  const primary = await resolveInvocationSourceDocument(await compileDocument(`<svrun version="1">
    <author source="./main.svml"/><target output="left"/>
    <override output="left" primary="true"/>
  </svrun>`), { compilation });
  assert.deepEqual(primary.invocation, {
    format: "hypit.invocation@1",
    targets: ["left"],
    overrides: [{ output: "left", choice: { kind: "primary" } }],
  });

  const record = await resolveInvocationSourceDocument(await compileDocument(`<svrun version="1">
    <author source="./main.svml"/><target output="left"/>
    <override output="left" record="accepted"/>
  </svrun>`), { compilation });
  assert.deepEqual(record.invocation.overrides, [{
    output: "left",
    choice: { kind: "record", record: "media:accepted" },
  }]);
});

test("Invocation Markup rejects ambiguous or repeated overrides", () => {
  assert.throws(() => parseInvocationSourceDocument("bad.svrun", `<svrun version="1">
    <author source="./main.svml"/><target output="left"/>
    <override output="left" primary="true" record="accepted"/>
  </svrun>`), /requires exactly one of primary or record/u);
  assert.throws(() => parseInvocationSourceDocument("bad.svrun", `<svrun version="1">
    <author source="./main.svml"/><target output="left"/>
    <override output="left" primary="true"/>
    <override output="left" record="accepted"/>
  </svrun>`), /repeats output left/u);
});

test("Invocation Markup accepts only invocation declarations", () => {
  assert.throws(() => parseInvocationSourceDocument("bad.svrun", `<svrun version="1">
    <author source="./main.svml"/><target output="left"/><provider name="images"/>
  </svrun>`), /does not accept <provider>/u);
});

test("a target-only Invocation Source resolves to one Invocation", async () => {
  const resolved = await resolveInvocationSourceDocument(
    await compileDocument(`<svrun version="1"><author source="./main.svml"/><target output="left"/></svrun>`),
    { compilation: fixture() },
  );
  assert.deepEqual(resolved.invocation, {
    format: "hypit.invocation@1",
    targets: ["left"],
    overrides: [],
  });
});
