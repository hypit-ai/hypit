import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
} from "@hypit/kernel";
import type {
  BuildState,
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
  ProducerStep,
  TypeRef,
} from "@hypit/protocol";

export const moduleRef = { name: "example.runtime-scenario", version: "0.0.0" } as const;

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

export const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: Object.values(types).map((type) => ({ name: type.name })),
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

const outputRecords = {
  prompt: "prompt:root",
  generated: "generated:root",
  document: "document:root",
} as const;

export function createGreetingBuild(options?: {
  readonly generationRealization?: "primary" | "placeholder";
  readonly targetOutputs?: readonly (keyof typeof outputRecords)[];
}): BuildState {
  const targets = options?.targetOutputs ?? ["document"];
  const unknown = targets.find((target) => outputRecords[target] === undefined);
  if (unknown !== undefined) throw new Error(`unknown Runtime scenario target ${unknown}`);
  const demandGenerated = targets.includes("generated") || targets.includes("document");
  const generatedRecord = options?.generationRealization === "placeholder"
    ? "generated:placeholder"
    : outputRecords.generated;
  const steps: ProducerStep[] = [{
    id: "make-prompt",
    producer: producers.makePrompt,
    inputs: { intent: "intent:root" },
    result: { kind: "output", name: "prompt", record: outputRecords.prompt },
  }];
  if (demandGenerated) {
    steps.push(options?.generationRealization === "placeholder"
      ? {
          id: "placeholder-text",
          producer: producers.placeholderText,
          inputs: { prompt: outputRecords.prompt },
          result: { kind: "output", name: "generated", record: generatedRecord },
        }
      : {
          id: "request-text",
          producer: producers.requestText,
          inputs: { prompt: outputRecords.prompt },
          result: {
            kind: "need",
            name: "generation",
            id: "need:generation",
            record: outputRecords.generated,
          },
        });
  }
  if (targets.includes("document")) {
    steps.push({
      id: "assemble",
      producer: producers.assemble,
      inputs: { generated: generatedRecord },
      result: { kind: "output", name: "document", record: outputRecords.document },
    });
  }
  const definition = defineBuild({
    program: link(createResolvedClosure([manifest]), [{
      id: "intent:root",
      type: types.intent,
      value: { name: "Ada" },
    }]),
    plan: {
      format: "hypit.plan@1",
      steps,
      goals: targets.map((target) => target === "generated" ? generatedRecord : outputRecords[target]),
    },
  });
  return materializeBuild(definition, []);
}

export function createParallelGreetingBuild(generationCount = 2): BuildState {
  const generations = ["a", "b", "c"].slice(0, generationCount);
  return materializeBuild(defineBuild({
    program: link(createResolvedClosure([manifest]), [{
      id: "intent:root",
      type: types.intent,
      value: { name: "Ada" },
    }]),
    plan: {
      format: "hypit.plan@1",
      steps: [{
        id: "make-prompt",
        producer: producers.makePrompt,
        inputs: { intent: "intent:root" },
        result: { kind: "output", name: "prompt", record: outputRecords.prompt },
      }, ...generations.map((suffix): ProducerStep => ({
        id: `generate-${suffix}`,
        producer: producers.requestText,
        inputs: { prompt: outputRecords.prompt },
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
