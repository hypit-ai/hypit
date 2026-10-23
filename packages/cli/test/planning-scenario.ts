import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
} from "@hypit/kernel";
import type {
  BuildState,
  ModuleManifest,
  ProducerRef,
  ProducerStep,
  TypeRef,
} from "@hypit/protocol";

const moduleRef = { name: "example.greeting", version: "0.0.0" } as const;
const types = {
  intent: { module: moduleRef, name: "GreetingIntent" },
  prompt: { module: moduleRef, name: "TextPrompt" },
  generated: { module: moduleRef, name: "GeneratedText" },
  document: { module: moduleRef, name: "GreetingDocument" },
} satisfies Record<string, TypeRef>;
const capability = { module: moduleRef, name: "generate-greeting-text" } as const;

export const producers = {
  makePrompt: { module: moduleRef, name: "make-prompt" },
  requestText: { module: moduleRef, name: "request-text" },
  assemble: { module: moduleRef, name: "assemble" },
} satisfies Record<string, ProducerRef>;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: Object.values(types).map((type) => type.name),
  capabilities: [{ name: capability.name, returns: types.generated }],
  producers: [{
    name: producers.makePrompt.name,
    inputs: [{ name: "intent", type: types.intent }],
    result: { kind: "output", name: "prompt", type: types.prompt },
  }, {
    name: producers.requestText.name,
    inputs: [{ name: "prompt", type: types.prompt }],
    result: { kind: "need", name: "generation", capability },
  }, {
    name: producers.assemble.name,
    inputs: [{ name: "generated", type: types.generated }],
    result: { kind: "output", name: "document", type: types.document },
  }],
};

export function createGreetingBuild(options?: { readonly targetOutputs?: readonly ("prompt" | "document")[] }): BuildState {
  const targets = options?.targetOutputs ?? ["document"];
  const steps: ProducerStep[] = [{
    id: "make-prompt",
    producer: producers.makePrompt,
    inputs: { intent: "intent:root" },
    result: { kind: "output", name: "prompt", record: "prompt:root" },
  }];
  if (targets.includes("document")) {
    steps.push({
      id: "request-text",
      producer: producers.requestText,
      inputs: { prompt: "prompt:root" },
      result: { kind: "need", name: "generation", id: "need:generation", record: "generated:root" },
    }, {
      id: "assemble",
      producer: producers.assemble,
      inputs: { generated: "generated:root" },
      result: { kind: "output", name: "document", record: "document:root" },
    });
  }
  return materializeBuild(defineBuild({
    program: link(createResolvedClosure([manifest]), [({
      id: "intent:root",
      type: types.intent,
      value: { name: "Ada" },
    })]),
    plan: {
      format: "hypit.plan@1",
      steps,
      goals: targets.map((target) => target === "prompt" ? "prompt:root" : "document:root"),
    },
  }), []);
}
