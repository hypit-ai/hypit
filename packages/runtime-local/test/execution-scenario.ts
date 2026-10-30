import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
} from "@hypit/kernel";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
  ProducerStep,
  TypeRef,
} from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";

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

const outputRecords = {
  prompt: "prompt:root",
  generated: "generated:root",
  document: "document:root",
} as const;

export type RuntimeBuildFixture = {
  readonly state: BuildView;
  /** Logical Outputs and Records produced by this execution scenario. */
  readonly outputs: Readonly<Record<string, {
    readonly output: string;
    readonly type: TypeRef;
    readonly goal: boolean;
    readonly record: string;
  }>>;
};

export function createGreetingBuildFixture(options?: {
  readonly generationStep?: "remote" | "placeholder";
  readonly targetOutputs?: readonly (keyof typeof outputRecords)[];
}): RuntimeBuildFixture {
  const targets = options?.targetOutputs ?? ["document"];
  const selected = new Set<string>(targets);
  const unknown = targets.find((target) => outputRecords[target] === undefined);
  if (unknown !== undefined) throw new Error(`unknown Runtime scenario target ${unknown}`);
  const demandGenerated = targets.includes("generated") || targets.includes("document");
  const generatedRecord = options?.generationStep === "placeholder"
    ? "generated:placeholder"
    : outputRecords.generated;
  const steps: ProducerStep[] = [{
    id: "make-prompt",
    producer: producers.makePrompt,
    inputs: { intent: "intent:root" },
    result: { kind: "output", name: "prompt", record: outputRecords.prompt },
  }];
  if (demandGenerated) {
    steps.push(options?.generationStep === "placeholder"
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
  const state = materializeBuild(defineBuild({
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
  }), []);
  const output = (name: keyof typeof outputRecords, type: TypeRef, record: string) => ({
    output: name,
    type,
    goal: selected.has(name),
    record,
  });
  return {
    state,
    outputs: {
      prompt: output("prompt", types.prompt, outputRecords.prompt),
      ...(demandGenerated ? { generated: output("generated", types.generated, generatedRecord) } : {}),
      ...(targets.includes("document") ? { document: output("document", types.document, outputRecords.document) } : {}),
    },
  };
}

export function createGreetingBuild(options?: {
  readonly generationStep?: "remote" | "placeholder";
  readonly targetOutputs?: readonly (keyof typeof outputRecords)[];
}): BuildView {
  return createGreetingBuildFixture(options).state;
}

export function createParallelGreetingBuildFixture(generationCount = 2): RuntimeBuildFixture {
  const generations = ["a", "b", "c"].slice(0, generationCount);
  const state = materializeBuild(defineBuild({
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
  return {
    state,
    outputs: Object.fromEntries([
      ["prompt", {
        output: "prompt",
        type: types.prompt,
        goal: false,
        record: outputRecords.prompt,
      }],
      ...generations.map((suffix) => [`generated-${suffix}`, {
        output: `generated-${suffix}`,
        type: types.generated,
        goal: true,
        record: `generated:${suffix}`,
      }] as const),
    ]),
  };
}

export function createParallelGreetingBuild(generationCount = 2): BuildView {
  return createParallelGreetingBuildFixture(generationCount).state;
}
