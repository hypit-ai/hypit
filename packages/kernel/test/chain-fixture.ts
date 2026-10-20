import {
  createResolvedClosure,
  defineBuild,
  link,
} from "@hypit/kernel";
import type {
  BuildDefinition,
  CommandResult,
  InvokeProducerCommand,
  ModuleManifest,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";

const moduleRef = { name: "example.core-chain", version: "0.0.0" } as const;
const valueType: TypeRef = { module: moduleRef, name: "Value" };
const advanceProducer: ProducerRef = { module: moduleRef, name: "advance" };

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [{ name: valueType.name }],
  capabilities: [],
  producers: [{
    name: advanceProducer.name,
    inputs: [{ name: "previous", type: valueType }],
    result: { kind: "output" as const, name: "next", type: valueType },
  }],
};

export function createChainDefinition(length: number): BuildDefinition {
  if (!Number.isSafeInteger(length) || length < 1) throw new Error("chain length must be positive");
  const program = link(createResolvedClosure([manifest]), [({
    id: "record:0",
    type: valueType,
    value: (0),
  })]);
  const finalRecord = `record:${length}`;
  return defineBuild({
    program,
    plan: {
      format: "hypit.plan@1",
      steps: Array.from({ length }, (_, index) => ({
        id: `step:${index}`,
        producer: advanceProducer,
        inputs: { previous: `record:${index}` },
        result: { kind: "output" as const, name: "next", record: `record:${index + 1}` },
      })),
      goals: [finalRecord],
    },
  });
}

export function completeChainStep(command: InvokeProducerCommand): CommandResult {
  const index = Number(command.step.slice("step:".length));
  return {
    kind: "producer-completed",
    command: command.id,
    result: { kind: "output" as const, value: (index + 1) },
  };
}
