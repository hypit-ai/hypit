import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypedModule,
  start,
} from "@narratage/core";
import type {
  BuildState,
  CapabilityRef,
  CompiledGraph,
  LinkedProgram,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";

export const moduleRef = { name: "example.greeting", version: "0.0.0" } as const;

export const types = {
  intent: { module: moduleRef, name: "GreetingIntent" },
  prompt: { module: moduleRef, name: "TextPrompt" },
  generated: { module: moduleRef, name: "GeneratedText" },
  document: { module: moduleRef, name: "GreetingDocument" },
} satisfies Record<string, TypeRef>;

export const capabilities = {
  generation: { module: moduleRef, name: "generate-greeting-text" },
} satisfies Record<string, CapabilityRef>;

export const producers = {
  makePrompt: { module: moduleRef, name: "make-prompt" },
  requestText: { module: moduleRef, name: "request-text" },
  placeholderText: { module: moduleRef, name: "placeholder-text" },
  assemble: { module: moduleRef, name: "assemble" },
} satisfies Record<string, ProducerRef>;

export const implementationDigests = {
  makePrompt: digestOf("example.greeting/make-prompt@0"),
  requestText: digestOf("example.greeting/request-text@0"),
  placeholderText: digestOf("example.greeting/placeholder-text@0"),
  assemble: digestOf("example.greeting/assemble@0"),
};

export const manifest: ModuleManifest = {
  format: "svml.module@1",
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
  capabilities: [{ name: capabilities.generation.name, returns: types.generated }],
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
      needs: [{
        name: "generation",
        capability: capabilities.generation,
        returns: types.generated,
      }],
      implementation: {
        kind: "registered",
        locator: "example.greeting/request-text",
        digest: implementationDigests.requestText,
      },
    },
    {
      name: producers.placeholderText.name,
      inputs: [{ name: "prompt", type: types.prompt }],
      outputs: [{ name: "generated", type: types.generated }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "example.greeting/placeholder-text",
        digest: implementationDigests.placeholderText,
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

export function greetingGraph(program: LinkedProgram, includeSide = false): CompiledGraph {
  return sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [
      {
        id: "prompt",
        type: types.prompt,
        primary: "make-prompt",
        semanticInputs: [{ kind: "record", id: "intent:root" }],
      },
      {
        id: "generated",
        type: types.generated,
        primary: "request-text",
        semanticInputs: [{ kind: "logical-output", id: "prompt" }],
      },
      {
        id: "document",
        type: types.document,
        primary: "assemble",
        semanticInputs: [{ kind: "logical-output", id: "generated" }],
      },
      ...(includeSide ? [{
        id: "side-generated",
        type: types.generated,
        primary: "side-placeholder",
        semanticInputs: [{ kind: "logical-output" as const, id: "prompt" }],
      }, {
        id: "side-document",
        type: types.document,
        primary: "side-assemble",
        semanticInputs: [{ kind: "logical-output" as const, id: "side-generated" }],
      }] : []),
    ],
    candidates: [
      { id: "make-prompt", type: types.prompt, root: { kind: "operation", result: { kind: "operation-result", operation: "make-prompt" } } },
      { id: "request-text", type: types.generated, root: { kind: "operation", result: { kind: "operation-result", operation: "request-text" } } },
      { id: "placeholder-text", type: types.generated, root: { kind: "operation", result: { kind: "operation-result", operation: "placeholder-text" } } },
      { id: "assemble", type: types.document, root: { kind: "operation", result: { kind: "operation-result", operation: "assemble" } } },
      ...(includeSide ? [
        { id: "side-placeholder", type: types.generated, root: { kind: "operation" as const, result: { kind: "operation-result" as const, operation: "side-placeholder" } } },
        { id: "side-assemble", type: types.document, root: { kind: "operation" as const, result: { kind: "operation-result" as const, operation: "side-assemble" } } },
      ] : []),
    ],
    operations: [
      {
        id: "make-prompt",
        producer: producers.makePrompt,
        inputs: { intent: { kind: "record", id: "intent:root" } },
        result: { kind: "output", name: "prompt", record: "prompt:root" },
      },
      {
        id: "request-text",
        producer: producers.requestText,
        inputs: { prompt: { kind: "logical-output", id: "prompt" } },
        result: { kind: "need", name: "generation", id: "need:generation", record: "generated:root", accepts: "exact" },
      },
      {
        id: "placeholder-text",
        producer: producers.placeholderText,
        inputs: { prompt: { kind: "logical-output", id: "prompt" } },
        result: { kind: "output", name: "generated", record: "generated:placeholder" },
      },
      {
        id: "assemble",
        producer: producers.assemble,
        inputs: { generated: { kind: "logical-output", id: "generated" } },
        result: { kind: "output", name: "document", record: "document:root" },
      },
      ...(includeSide ? [{
        id: "side-placeholder",
        producer: producers.placeholderText,
        inputs: { prompt: { kind: "logical-output" as const, id: "prompt" } },
        result: { kind: "output" as const, name: "generated", record: "generated:side" },
      }, {
        id: "side-assemble",
        producer: producers.assemble,
        inputs: { generated: { kind: "logical-output" as const, id: "side-generated" } },
        result: { kind: "output" as const, name: "document", record: "document:side" },
      }] : []),
    ],
  });
}

export function createGreetingBuild(options?: {
  readonly generationRealization?: "primary" | "placeholder";
  readonly goalAccepts?: "exact" | "substitute";
  readonly implementationClosure?: import("@narratage/protocol").Digest;
  readonly includeSideTarget?: boolean;
}): BuildState {
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
  const program = link(closure, [typedModule]);
  const graph = greetingGraph(program, options?.includeSideTarget ?? false);
  const request = sealBuildRequest({
    graph: graph.id,
    ...(options?.implementationClosure === undefined
      ? {}
      : { implementationClosure: options.implementationClosure }),
    targets: [...(options?.includeSideTarget ? [{ output: "side-document", accepts: "exact" as const }] : []), {
      output: "document",
      accepts: options?.goalAccepts ?? "exact",
    }],
    satisfactions: options?.generationRealization === "placeholder"
      ? [{
          output: "generated",
          candidate: "placeholder-text",
          fidelity: "substitute",
        }]
      : [],
  });
  return start(program, graph, request);
}
