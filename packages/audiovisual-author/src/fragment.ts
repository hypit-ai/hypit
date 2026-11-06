import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import { audiovisualTypes } from "@hypit/audiovisual";
import { spatialTypes } from "@hypit/spatial";
import { temporalProducers, temporalTypes } from "@hypit/temporal";

import { audiovisualAuthorProducers, audiovisualAuthorTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Resolve one parent-free occurrence use and publish its ordinary end value. */
export function createOccurrenceUseFragment(options: {
  readonly inferDuration: boolean;
  readonly reconstructions?: number;
}) {
  const reconstructionCount = options.reconstructions ?? 0;
  if (!Number.isSafeInteger(reconstructionCount) || reconstructionCount < 0) {
    throw new Error("Occurrence Use reconstruction count must be a non-negative safe integer.");
  }
  const operations: FragmentOperation[] = [{
    id: "bindings:create",
    producer: audiovisualAuthorProducers.createBindings,
    inputs: {},
    result: { kind: "output", name: "bindings" },
  }];
  let bindings = "bindings:create";
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
  if (options.inferDuration) operations.push({
    id: "duration:infer",
    producer: audiovisualAuthorProducers.inferOccurrenceDuration,
    inputs: { spec: input("spec"), source: input("source") },
    result: { kind: "output", name: "duration" },
  });
  operations.push({
    id: "use:resolve",
    producer: audiovisualAuthorProducers.resolveOccurrenceUse,
    inputs: {
      spec: input("spec"),
      source: input("source"),
      start: input("start"),
      duration: options.inferDuration ? operation("duration:infer") : input("duration"),
      bindings: operation(bindings),
    },
    result: { kind: "output", name: "use" },
  }, {
    id: "use:end",
    producer: audiovisualAuthorProducers.projectOccurrenceUseEnd,
    inputs: { use: operation("use:resolve") },
    result: { kind: "output", name: "end" },
  });
  return sealGraphFragment({
    inputs: [
      { name: "spec", type: audiovisualAuthorTypes.occurrenceUseSpec },
      { name: "source", type: audiovisualTypes.programSource },
      { name: "start", type: temporalTypes.exactValue },
      ...(options.inferDuration ? [] : [{ name: "duration", type: temporalTypes.exactValue }]),
      ...Array.from({ length: reconstructionCount }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `reconstruction-binding-${suffix}`, type: audiovisualAuthorTypes.reconstructionBinding },
          { name: `reconstruction-${suffix}`, type: audiovisualTypes.signalReconstruction },
        ];
      }).flat(),
    ],
    operations,
    exports: [
      { name: "use", type: audiovisualAuthorTypes.occurrenceUse, root: operation("use:resolve") },
      { name: "end", type: temporalTypes.exactValue, root: operation("use:end") },
    ],
  });
}

export function createSourceBoundOccurrenceUseFragment() {
  return sealGraphFragment({
    inputs: [
      { name: "spec", type: audiovisualAuthorTypes.sourceBoundSpec },
      { name: "target", type: audiovisualAuthorTypes.occurrenceUse },
      { name: "source", type: audiovisualTypes.programSource },
    ],
    operations: [{
      id: "use:follow",
      producer: audiovisualAuthorProducers.bindOccurrenceUseToSource,
      inputs: { spec: input("spec"), target: input("target"), source: input("source") },
      result: { kind: "output", name: "use" },
    }, {
      id: "use:end",
      producer: audiovisualAuthorProducers.projectOccurrenceUseEnd,
      inputs: { use: operation("use:follow") },
      result: { kind: "output", name: "end" },
    }],
    exports: [
      { name: "use", type: audiovisualAuthorTypes.occurrenceUse, root: operation("use:follow") },
      { name: "end", type: temporalTypes.exactValue, root: operation("use:end") },
    ],
  });
}

export function createOccurrenceBoundOccurrenceUseFragment() {
  return sealGraphFragment({
    inputs: [
      { name: "spec", type: audiovisualAuthorTypes.occurrenceBoundSpec },
      { name: "target", type: audiovisualAuthorTypes.occurrenceUse },
      { name: "source", type: audiovisualTypes.programSource },
    ],
    operations: [{
      id: "use:bind-occurrence",
      producer: audiovisualAuthorProducers.bindOccurrenceUseToOccurrence,
      inputs: { spec: input("spec"), target: input("target"), source: input("source") },
      result: { kind: "output", name: "use" },
    }, {
      id: "use:end",
      producer: audiovisualAuthorProducers.projectOccurrenceUseEnd,
      inputs: { use: operation("use:bind-occurrence") },
      result: { kind: "output", name: "end" },
    }],
    exports: [
      { name: "use", type: audiovisualAuthorTypes.occurrenceUse, root: operation("use:bind-occurrence") },
      { name: "end", type: temporalTypes.exactValue, root: operation("use:end") },
    ],
  });
}

/** Resolve one domain-bearing source event to one Programme-local position. */
export function createUniqueSourceEventPositionFragment(options: { readonly offset: boolean }) {
  return sealGraphFragment({
    inputs: [
      { name: "spec", type: audiovisualAuthorTypes.occurrenceOutputSpec },
      { name: "target", type: audiovisualAuthorTypes.occurrenceUse },
      { name: "event", type: temporalTypes.regionSet },
      ...(options.offset ? [{ name: "offset", type: temporalTypes.exactValue }] : []),
    ],
    operations: [{
      id: "mapping:project",
      producer: audiovisualAuthorProducers.projectOccurrenceUseOutputMapping,
      inputs: { spec: input("spec"), use: input("target") },
      result: { kind: "output", name: "mapping" },
    }, {
      id: "event:preimage",
      producer: temporalProducers.preimageMapRegions,
      inputs: { map: operation("mapping:project"), regions: input("event") },
      result: { kind: "output", name: "preimage" },
    }, {
      id: "event:unique",
      producer: temporalProducers.uniqueRegionSetPoint,
      inputs: { regions: operation("event:preimage") },
      result: { kind: "output", name: "point" },
    }, {
      id: "event:local-position",
      producer: temporalProducers.pointPosition,
      inputs: { point: operation("event:unique") },
      result: { kind: "output", name: "position" },
    }, {
      id: "event:program-position",
      producer: audiovisualAuthorProducers.projectOccurrenceUsePosition,
      inputs: { use: input("target"), local: operation("event:local-position") },
      result: { kind: "output", name: "position" },
    }, ...(options.offset ? [{
      id: "event:offset",
      producer: temporalProducers.addExactValues,
      inputs: { left: operation("event:program-position"), right: input("offset") },
      result: { kind: "output" as const, name: "value" },
    }] : [])],
    exports: [{
      name: "position",
      type: temporalTypes.exactValue,
      root: operation(options.offset ? "event:offset" : "event:program-position"),
    }],
  });
}

export function createAudiovisualProgramDomainFragment() {
  return sealGraphFragment({
    inputs: [
      { name: "spec", type: audiovisualAuthorTypes.programDomainSpec },
      { name: "duration", type: temporalTypes.exactValue },
    ],
    operations: [{
      id: "domain:create",
      producer: audiovisualAuthorProducers.createProgramDomain,
      inputs: { spec: input("spec"), duration: input("duration") },
      result: { kind: "output", name: "domain" },
    }],
    exports: [{ name: "domain", type: temporalTypes.localDomain, root: operation("domain:create") }],
  });
}

export function createOccurrenceClosureFragment() {
  return sealGraphFragment({
    inputs: [
      { name: "use", type: audiovisualAuthorTypes.occurrenceUse },
      { name: "parent", type: temporalTypes.localDomain },
    ],
    operations: [{
      id: "occurrence:close",
      producer: audiovisualAuthorProducers.closeOccurrence,
      inputs: { use: input("use"), parent: input("parent") },
      result: { kind: "output", name: "occurrence" },
    }],
    exports: [{ name: "occurrence", type: audiovisualAuthorTypes.occurrence,
      root: operation("occurrence:close") }],
  });
}

/** Assemble only already resolved relations; it performs no Source-use timing work. */
export function createResolvedAudiovisualProgramFragment(counts: {
  readonly occurrences: number;
  readonly temporalMaps?: number;
  readonly spatialDomains?: number;
  readonly spatialMaps?: number;
  readonly pictureOperators?: number;
  readonly audioOperators?: number;
}) {
  const values = [
    ["temporal-map", counts.temporalMaps ?? 0, temporalTypes.map,
      audiovisualAuthorProducers.appendTemporalMap],
    ["spatial-domain", counts.spatialDomains ?? 0, spatialTypes.localDomain,
      audiovisualAuthorProducers.appendSpatialDomain],
    ["spatial-map", counts.spatialMaps ?? 0, spatialTypes.map,
      audiovisualAuthorProducers.appendSpatialMap],
  ] as const;
  const operatorValues = [
    ["picture-operator", counts.pictureOperators ?? 0, audiovisualTypes.pictureOperator,
      audiovisualAuthorProducers.appendPictureOperator],
    ["audio-operator", counts.audioOperators ?? 0, audiovisualTypes.audioOperator,
      audiovisualAuthorProducers.appendAudioOperator],
  ] as const;
  for (const [name, count] of [
    ["occurrence", counts.occurrences],
    ...values.map(([name, count]) => [name, count] as const),
    ...operatorValues.map(([name, count]) => [name, count] as const),
  ] as const) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Resolved Audiovisual Programme ${name} count must be a non-negative safe integer.`);
    }
  }
  const operations: FragmentOperation[] = [{
    id: "bindings:create",
    producer: audiovisualAuthorProducers.createBindings,
    inputs: {},
    result: { kind: "output", name: "bindings" },
  }];
  let bindings = "bindings:create";
  for (const [kind, count, _type, producer] of values) {
    for (let index = 0; index < count; index += 1) {
      const suffix = String(index + 1).padStart(4, "0");
      const id = `bindings:append:${kind}:${suffix}`;
      operations.push({ id, producer, inputs: {
        bindings: operation(bindings), binding: input(`${kind}-binding-${suffix}`),
        value: input(`${kind}-${suffix}`),
      }, result: { kind: "output", name: "bindings" } });
      bindings = id;
    }
  }
  for (const [kind, count, _type, producer] of operatorValues) {
    for (let index = 0; index < count; index += 1) {
      const suffix = String(index + 1).padStart(4, "0");
      const id = `bindings:append:${kind}:${suffix}`;
      operations.push({ id, producer, inputs: {
        bindings: operation(bindings), binding: input(`${kind}-binding-${suffix}`),
        operator: input(`${kind}-${suffix}`),
      }, result: { kind: "output", name: "bindings" } });
      bindings = id;
    }
  }
  operations.push({
    id: "occurrences:create",
    producer: audiovisualAuthorProducers.createOccurrences,
    inputs: {},
    result: { kind: "output", name: "occurrences" },
  });
  let occurrences = "occurrences:create";
  for (let index = 0; index < counts.occurrences; index += 1) {
    const suffix = String(index + 1).padStart(4, "0");
    const id = `occurrences:append:${suffix}`;
    operations.push({
      id,
      producer: audiovisualAuthorProducers.appendOccurrence,
      inputs: { occurrences: operation(occurrences), occurrence: input(`occurrence-${suffix}`) },
      result: { kind: "output", name: "occurrences" },
    });
    occurrences = id;
  }
  operations.push({
    id: "program:close",
    producer: audiovisualAuthorProducers.closeResolvedProgram,
    inputs: {
      spec: input("spec"),
      bindings: operation(bindings),
      domain: input("domain"),
      occurrences: operation(occurrences),
    },
    result: { kind: "output", name: "program" },
  });
  return sealGraphFragment({
    inputs: [
      { name: "spec", type: audiovisualAuthorTypes.spec },
      { name: "domain", type: temporalTypes.localDomain },
      ...Array.from({ length: counts.occurrences }, (_, index) => ({
        name: `occurrence-${String(index + 1).padStart(4, "0")}`,
        type: audiovisualAuthorTypes.occurrence,
      })),
      ...values.flatMap(([kind, count, type]) => Array.from({ length: count }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `${kind}-binding-${suffix}`, type: audiovisualAuthorTypes.valueBinding },
          { name: `${kind}-${suffix}`, type },
        ];
      }).flat()),
      ...operatorValues.flatMap(([kind, count, type]) => Array.from({ length: count }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [
          { name: `${kind}-binding-${suffix}`, type: audiovisualAuthorTypes.operatorBinding },
          { name: `${kind}-${suffix}`, type },
        ];
      }).flat()),
    ],
    operations,
    exports: [{ name: "program", type: audiovisualTypes.program, root: operation("program:close") }],
  });
}
