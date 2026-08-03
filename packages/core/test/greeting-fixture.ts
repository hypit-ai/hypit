import {
  createResolvedClosure,
  digestOf,
  link,
  sealRecord,
  sealTypedModule,
  start,
} from "@svml/core";
import type {
  BuildPlan,
  BuildState,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";

export const moduleRef = { name: "example.greeting", version: "0.0.0" } as const;

export const types = {
  intent: { module: moduleRef, name: "GreetingIntent" },
  prompt: { module: moduleRef, name: "TextPrompt" },
  generated: { module: moduleRef, name: "GeneratedText" },
  document: { module: moduleRef, name: "GreetingDocument" },
} satisfies Record<string, TypeRef>;

export const producers = {
  makePrompt: { module: moduleRef, name: "make-prompt" },
  requestText: { module: moduleRef, name: "request-text" },
  assemble: { module: moduleRef, name: "assemble" },
} satisfies Record<string, ProducerRef>;

export const implementationDigests = {
  makePrompt: digestOf("example.greeting/make-prompt@0"),
  requestText: digestOf("example.greeting/request-text@0"),
  assemble: digestOf("example.greeting/assemble@0"),
};

export const manifest: ModuleManifest = {
  format: "svml.module@0",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [
    {
      name: types.intent.name,
      schema: {
        kind: "object",
        fields: {
          name: { schema: { kind: "string", minLength: 1 } },
        },
      },
    },
    { name: types.prompt.name, schema: { kind: "string", minLength: 1 } },
    { name: types.generated.name, schema: { kind: "string", minLength: 1 } },
    {
      name: types.document.name,
      schema: {
        kind: "object",
        fields: {
          text: { schema: { kind: "string", minLength: 1 } },
        },
      },
    },
  ],
  surfaces: [],
  producers: [
    {
      name: producers.makePrompt.name,
      inputs: [{ name: "intent", type: types.intent }],
      outputs: [{ name: "prompt", type: types.prompt }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.greeting/make-prompt",
        digest: implementationDigests.makePrompt,
      },
    },
    {
      name: producers.requestText.name,
      inputs: [{ name: "prompt", type: types.prompt }],
      outputs: [],
      needs: [{ name: "generation", wants: types.generated }],
      implementation: {
        kind: "registered",
        locator: "example.greeting/request-text",
        digest: implementationDigests.requestText,
      },
    },
    {
      name: producers.assemble.name,
      inputs: [{ name: "generated", type: types.generated }],
      outputs: [{ name: "document", type: types.document }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.greeting/assemble",
        digest: implementationDigests.assemble,
      },
    },
  ],
};

export function greetingPlan(options?: {
  readonly needAccepts?: "exact" | "substitute";
  readonly goalAccepts?: "exact" | "substitute";
}): BuildPlan {
  return {
    format: "svml.plan@0",
    id: "greeting",
    steps: [
      {
        id: "make-prompt",
        producer: producers.makePrompt,
        inputs: { intent: "intent:root" },
        outputs: { prompt: "prompt:root" },
        needs: {},
      },
      {
        id: "request-text",
        producer: producers.requestText,
        inputs: { prompt: "prompt:root" },
        outputs: {},
        needs: {
          generation: {
            id: "need:generation",
            result: "generated:root",
            accepts: options?.needAccepts ?? "exact",
          },
        },
      },
      {
        id: "assemble",
        producer: producers.assemble,
        inputs: { generated: "generated:root" },
        outputs: { document: "document:root" },
        needs: {},
      },
    ],
    goals: [
      {
        record: "document:root",
        type: types.document,
        accepts: options?.goalAccepts ?? "exact",
      },
    ],
  };
}

export function createGreetingBuild(options?: Parameters<typeof greetingPlan>[0]): BuildState {
  const closure = createResolvedClosure([manifest]);
  const authored = sealRecord({
    id: "intent:root",
    type: types.intent,
    value: { kind: "inline", value: { name: "Ada" } },
    conformance: "exact",
    origin: {
      kind: "authored",
      sourceDigest: digestOf("source:greeting"),
      frontendClosureDigest: digestOf("frontend:test"),
      sourceName: "greeting.test",
    },
  });
  const typedModule = sealTypedModule({
    id: "author:greeting",
    closureDigest: closure.digest,
    records: [authored],
  });
  return start(link(closure, [typedModule]), greetingPlan(options));
}
