import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
} from "@hypit/kernel";
import type {
  BuildDefinition,
  CapabilityRef,
  CommandResult,
  InvokeProducerCommand,
  ModuleManifest,
  ProducerRef,
  ProducerStep,
  TypeRef,
} from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";

const moduleRef = { name: "example.executor-scenario", version: "0.0.0" } as const;

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

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: Object.values(types).map((type) => type.name),
  capabilities: [{ name: capabilities.generation.name, returns: types.generated }],
  producers: [
    {
      name: producers.makePrompt.name,
      inputs: [{ name: "intent", type: types.intent }],
      result: { kind: "output", name: "prompt", type: types.prompt },
    },
    {
      name: producers.requestText.name,
      inputs: [{ name: "prompt", type: types.prompt }],
      result: { kind: "need", name: "generation", capability: capabilities.generation },
    },
    {
      name: producers.placeholderText.name,
      inputs: [{ name: "prompt", type: types.prompt }],
      result: { kind: "output", name: "generated", type: types.generated },
    },
    {
      name: producers.assemble.name,
      inputs: [{ name: "generated", type: types.generated }],
      result: { kind: "output", name: "document", type: types.document },
    },
  ],
};

function greetingProgram() {
  return link(createResolvedClosure([manifest]), [({
    id: "intent:root",
    type: types.intent,
    value: { name: "Ada" },
  })]);
}

const promptStep: ProducerStep = {
  id: "make-prompt",
  producer: producers.makePrompt,
  inputs: { intent: "intent:root" },
  result: { kind: "output", name: "prompt", record: "prompt:root" },
};

function greetingDefinition(realization: "primary" | "placeholder" = "primary"): BuildDefinition {
  const generated: ProducerStep = realization === "primary"
    ? {
        id: "request-text",
        producer: producers.requestText,
        inputs: { prompt: "prompt:root" },
        result: {
          kind: "need",
          name: "generation",
          id: "need:generation",
          record: "generated:root",
        },
      }
    : {
        id: "placeholder-text",
        producer: producers.placeholderText,
        inputs: { prompt: "prompt:root" },
        result: { kind: "output", name: "generated", record: "generated:root" },
      };
  return defineBuild({
    program: greetingProgram(),
    plan: {
      format: "hypit.plan@1",
      steps: [promptStep, generated, {
        id: "assemble",
        producer: producers.assemble,
        inputs: { generated: "generated:root" },
        result: { kind: "output", name: "document", record: "document:root" },
      }],
      goals: ["document:root"],
    },
  });
}

export function createGreetingBuild(options?: {
  readonly generationRealization?: "primary" | "placeholder";
}): BuildView {
  return materializeBuild(greetingDefinition(options?.generationRealization), []);
}

export function createParallelGreetingBuild(generationCount = 2): BuildView {
  const generations = ["a", "b", "c"].slice(0, generationCount);
  return materializeBuild(defineBuild({
    program: greetingProgram(),
    plan: {
      format: "hypit.plan@1",
      steps: [promptStep, ...generations.map((suffix): ProducerStep => ({
        id: `generate-${suffix}`,
        producer: producers.requestText,
        inputs: { prompt: "prompt:root" },
        result: {
          kind: "need",
          name: "generation",
          id: `need:generation-${suffix}`,
          record: `generated:${suffix}`,
        },
      }))],
      goals: generations.map((suffix) => `generated:${suffix}`),
    },
  }), []);
}

const chainModule = { name: "example.executor-chain", version: "0.0.0" } as const;
const chainType: TypeRef = { module: chainModule, name: "Value" };
const advanceProducer: ProducerRef = { module: chainModule, name: "advance" };
const chainManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: chainModule.name,
  version: chainModule.version,
  dependencies: [],
  types: [chainType.name],
  capabilities: [],
  producers: [{
    name: advanceProducer.name,
    inputs: [{ name: "previous", type: chainType }],
    result: { kind: "output", name: "next", type: chainType },
  }],
};

export function createChainDefinition(length: number): BuildDefinition {
  if (!Number.isSafeInteger(length) || length < 1) throw new Error("chain length must be positive");
  return defineBuild({
    program: link(createResolvedClosure([chainManifest]), [({
      id: "record:0",
      type: chainType,
      value: 0,
    })]),
    plan: {
      format: "hypit.plan@1",
      steps: Array.from({ length }, (_, index): ProducerStep => ({
        id: `step:${index}`,
        producer: advanceProducer,
        inputs: { previous: `record:${index}` },
        result: { kind: "output", name: "next", record: `record:${index + 1}` },
      })),
      goals: [`record:${length}`],
    },
  });
}

export function completeChainStep(command: InvokeProducerCommand): CommandResult {
  const index = Number(command.step.slice("step:".length));
  return {
    kind: "producer-completed",
    command: command.id,
    result: { kind: "output", value: index + 1 },
  };
}
