import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import type {
  CapabilityRef,
  AuthorGraph,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";
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

function initialState(program: Parameters<typeof planBuild>[0], graph: AuthorGraph, targets: readonly string[]): BuildView {
  const planned = planBuild(program, graph, targets);
  return materializeBuild(defineBuild({
    program,
    plan: planned.plan,
  }), []);
}

export const producers = {
  makePrompt: { module: moduleRef, name: "make-prompt" },
  requestText: { module: moduleRef, name: "request-text" },
  placeholderText: { module: moduleRef, name: "placeholder-text" },
  assemble: { module: moduleRef, name: "assemble" },
} satisfies Record<string, ProducerRef>;

export const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [
    types.intent.name,
    types.prompt.name,
    types.generated.name,
    types.document.name,
  ],
  capabilities: [{ name: capabilities.generation.name, returns: types.generated }],
  producers: [
    {
      name: producers.makePrompt.name,
      inputs: [{ name: "intent", type: types.intent }],
      result: { kind: "output" as const, name: "prompt", type: types.prompt },
    },
    {
      name: producers.requestText.name,
      inputs: [{ name: "prompt", type: types.prompt }],
      result: { kind: "need" as const, name: "generation", capability: capabilities.generation },
    },
    {
      name: producers.placeholderText.name,
      inputs: [{ name: "prompt", type: types.prompt }],
      result: { kind: "output" as const, name: "generated", type: types.generated },
    },
    {
      name: producers.assemble.name,
      inputs: [{ name: "generated", type: types.generated }],
      result: { kind: "output" as const, name: "document", type: types.document },
    },
  ],
};

export function greetingGraph(includeSide = false): AuthorGraph {
  return sealAuthorGraph({
    outputs: [
      {
        id: "prompt",
        type: types.prompt,
        result: { kind: "operation-result", operation: "make-prompt" },
      },
      {
        id: "generated",
        type: types.generated,
        result: { kind: "operation-result", operation: "request-text" },
      },
      {
        id: "document",
        type: types.document,
        result: { kind: "operation-result", operation: "assemble" },
      },
      ...(includeSide ? [{
        id: "side-generated",
        type: types.generated,
        result: { kind: "operation-result" as const, operation: "side-placeholder" },
      }, {
        id: "side-document",
        type: types.document,
        result: { kind: "operation-result" as const, operation: "side-assemble" },
      }] : []),
    ],
    operations: [
      {
        id: "make-prompt",
        producer: producers.makePrompt,
        inputs: { intent: { kind: "record", id: "intent:root" } },
        result: { kind: "output" as const, name: "prompt", record: "prompt:root" },
      },
      {
        id: "request-text",
        producer: producers.requestText,
        inputs: { prompt: { kind: "logical-output", id: "prompt" } },
        result: { kind: "need" as const, name: "generation", id: "need:generation", record: "generated:root" },
      },
      {
        id: "placeholder-text",
        producer: producers.placeholderText,
        inputs: { prompt: { kind: "logical-output", id: "prompt" } },
        result: { kind: "output" as const, name: "generated", record: "generated:placeholder" },
      },
      {
        id: "assemble",
        producer: producers.assemble,
        inputs: { generated: { kind: "logical-output", id: "generated" } },
        result: { kind: "output" as const, name: "document", record: "document:root" },
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
  readonly generationStep?: "remote" | "placeholder";
  readonly includeSideTarget?: boolean;
  readonly targetOutputs?: readonly string[];
}): BuildView {
  const closure = createResolvedClosure([manifest]);
  const authored = ({
    id: "intent:root",
    type: types.intent,
    value: ({ name: "Ada" }),
  });
  const program = link(closure, [authored]);
  const sourceGraph = greetingGraph(options?.includeSideTarget ?? false);
  const graph = options?.generationStep === "placeholder"
    ? sealAuthorGraph({
        outputs: sourceGraph.outputs.map((item) => item.id === "generated"
          ? { ...item, result: { kind: "operation-result" as const, operation: "placeholder-text" } }
          : item),
        operations: sourceGraph.operations,
      })
    : sourceGraph;
  const targets = options?.targetOutputs
    ?? [...(options?.includeSideTarget ? ["side-document"] : []), "document"];
  return initialState(program, graph, targets);
}

export function createParallelGreetingBuild(generationCount = 2) {
  const generations = ["a", "b", "c"].slice(0, generationCount);
  const closure = createResolvedClosure([manifest]);
  const authored = ({
    id: "intent:root",
    type: types.intent,
    value: ({ name: "Ada" }),
  });
  const program = link(closure, [authored]);
  const graph = sealAuthorGraph({
    outputs: [
      {
        id: "prompt",
        type: types.prompt,
        result: { kind: "operation-result", operation: "make-prompt" },
      },
      ...generations.map((suffix) => ({
        id: `generated-${suffix}`,
        type: types.generated,
        result: { kind: "operation-result" as const, operation: `generate-${suffix}` },
      })),
    ],
    operations: [
      {
        id: "make-prompt",
        producer: producers.makePrompt,
        inputs: { intent: { kind: "record", id: "intent:root" } },
        result: { kind: "output" as const, name: "prompt", record: "prompt:root" },
      },
      ...generations.map((suffix) => ({
        id: `generate-${suffix}`,
        producer: producers.requestText,
        inputs: { prompt: { kind: "logical-output" as const, id: "prompt" } },
        result: {
          kind: "need" as const,
          name: "generation",
          id: `need:generation-${suffix}`,
          record: `generated:${suffix}`,
        },
      })),
    ],
  });
  return initialState(program, graph, generations.map((suffix) => `generated-${suffix}`));
}
