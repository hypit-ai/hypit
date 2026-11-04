import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import { audiovisualTypes } from "@hypit/audiovisual";

import { audiovisualAuthorProducers, audiovisualAuthorTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Build one fixed typed graph whose Source and package-owned Operator inputs may be Records,
 * public outputs or future Operation results. Counts affect only static graph arity.
 */
export function createAudiovisualAuthorFragment(counts: {
  readonly sources: number;
  readonly pictureOperators?: number;
  readonly audioOperators?: number;
  readonly reconstructions?: number;
}) {
  const pictureOperatorCount = counts.pictureOperators ?? 0;
  const audioOperatorCount = counts.audioOperators ?? 0;
  const reconstructionCount = counts.reconstructions ?? 0;
  for (const [name, count] of Object.entries({
    source: counts.sources,
    "Picture Operator": pictureOperatorCount,
    "Audio Operator": audioOperatorCount,
    "Signal Reconstruction": reconstructionCount,
  })) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Audiovisual Author Fragment ${name} count must be a non-negative safe integer.`);
    }
  }
  const operations: FragmentOperation[] = [{
    id: "bindings:create",
    producer: audiovisualAuthorProducers.createBindings,
    inputs: {},
    result: { kind: "output", name: "bindings" },
  }];
  let bindings = "bindings:create";
  for (let index = 0; index < counts.sources; index += 1) {
    const suffix = String(index + 1).padStart(4, "0");
    const id = `bindings:append:${suffix}`;
    operations.push({
      id,
      producer: audiovisualAuthorProducers.appendSource,
      inputs: {
        bindings: operation(bindings),
        binding: input(`binding-${suffix}`),
        source: input(`source-${suffix}`),
      },
      result: { kind: "output", name: "bindings" },
    });
    bindings = id;
  }
  for (const [kind, count, producer, prefix] of [
    ["picture", pictureOperatorCount, audiovisualAuthorProducers.appendPictureOperator, "picture-operator"],
    ["audio", audioOperatorCount, audiovisualAuthorProducers.appendAudioOperator, "audio-operator"],
  ] as const) {
    for (let index = 0; index < count; index += 1) {
      const suffix = String(index + 1).padStart(4, "0");
      const id = `bindings:append:${prefix}:${suffix}`;
      operations.push({
        id,
        producer,
        inputs: {
          bindings: operation(bindings),
          binding: input(`${prefix}-binding-${suffix}`),
          operator: input(`${prefix}-${suffix}`),
        },
        result: { kind: "output", name: "bindings" },
      });
      bindings = id;
    }
  }
  for (let index = 0; index < reconstructionCount; index += 1) {
    const suffix = String(index + 1).padStart(4, "0");
    const id = `bindings:append:reconstruction:${suffix}`;
    operations.push({
      id,
      producer: audiovisualAuthorProducers.appendReconstruction,
      inputs: {
        bindings: operation(bindings),
        binding: input(`reconstruction-binding-${suffix}`),
        reconstruction: input(`reconstruction-${suffix}`),
      },
      result: { kind: "output", name: "bindings" },
    });
    bindings = id;
  }
  operations.push({
    id: "program:close",
    producer: audiovisualAuthorProducers.closeProgram,
    inputs: { spec: input("spec"), bindings: operation(bindings) },
    result: { kind: "output", name: "program" },
  });
  return sealGraphFragment({
    inputs: [
      { name: "spec", type: audiovisualAuthorTypes.spec },
      ...Array.from({ length: counts.sources }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `binding-${suffix}`, type: audiovisualAuthorTypes.sourceBinding },
          { name: `source-${suffix}`, type: audiovisualTypes.programSource },
        ];
      }).flat(),
      ...Array.from({ length: pictureOperatorCount }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `picture-operator-binding-${suffix}`, type: audiovisualAuthorTypes.operatorBinding },
          { name: `picture-operator-${suffix}`, type: audiovisualTypes.pictureOperator },
        ];
      }).flat(),
      ...Array.from({ length: audioOperatorCount }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `audio-operator-binding-${suffix}`, type: audiovisualAuthorTypes.operatorBinding },
          { name: `audio-operator-${suffix}`, type: audiovisualTypes.audioOperator },
        ];
      }).flat(),
      ...Array.from({ length: reconstructionCount }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `reconstruction-binding-${suffix}`, type: audiovisualAuthorTypes.reconstructionBinding },
          { name: `reconstruction-${suffix}`, type: audiovisualTypes.signalReconstruction },
        ];
      }).flat(),
    ],
    operations,
    exports: [{ name: "program", type: audiovisualTypes.program, root: operation("program:close") }],
  });
}
