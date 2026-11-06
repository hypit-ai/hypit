import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { spatialDependency, spatialTypes } from "@hypit/spatial";
import { temporalDependency, temporalTypes } from "@hypit/temporal";

export const audiovisualAuthorModuleRef = {
  name: "@hypit/audiovisual-author",
  version: "1",
} as const;

export const audiovisualAuthorTypes = {
  spec: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorSpec" },
  operatorBinding: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorOperatorBinding" },
  reconstructionBinding: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorReconstructionBinding" },
  valueBinding: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorValueBinding" },
  bindingSet: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorBindingSet" },
  occurrenceUseSpec: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorOccurrenceUseSpec" },
  occurrenceUse: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorOccurrenceUse" },
  sourceBoundSpec: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorSourceBoundSpec" },
  occurrenceBoundSpec: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorOccurrenceBoundSpec" },
  occurrenceOutputSpec: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorOccurrenceOutputSpec" },
  programDomainSpec: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorProgramDomainSpec" },
  occurrence: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorResolvedOccurrence" },
  occurrenceSet: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorOccurrenceSet" },
} satisfies Record<string, TypeRef>;

export const audiovisualAuthorProducers = {
  createBindings: { module: audiovisualAuthorModuleRef, name: "create-bindings" },
  appendTemporalMap: { module: audiovisualAuthorModuleRef, name: "append-temporal-map" },
  appendSpatialMap: { module: audiovisualAuthorModuleRef, name: "append-spatial-map" },
  appendSpatialDomain: { module: audiovisualAuthorModuleRef, name: "append-spatial-domain" },
  appendPictureOperator: { module: audiovisualAuthorModuleRef, name: "append-picture-operator" },
  appendAudioOperator: { module: audiovisualAuthorModuleRef, name: "append-audio-operator" },
  appendReconstruction: { module: audiovisualAuthorModuleRef, name: "append-reconstruction" },
  inferOccurrenceDuration: { module: audiovisualAuthorModuleRef, name: "infer-occurrence-duration" },
  resolveOccurrenceUse: { module: audiovisualAuthorModuleRef, name: "resolve-occurrence-use" },
  bindOccurrenceUseToSource: { module: audiovisualAuthorModuleRef, name: "bind-occurrence-use-to-source" },
  bindOccurrenceUseToOccurrence: { module: audiovisualAuthorModuleRef, name: "bind-occurrence-use-to-occurrence" },
  projectOccurrenceUseOutputMapping: { module: audiovisualAuthorModuleRef, name: "project-occurrence-use-output-mapping" },
  projectOccurrenceUseEnd: { module: audiovisualAuthorModuleRef, name: "project-occurrence-use-end" },
  projectOccurrenceUsePosition: { module: audiovisualAuthorModuleRef, name: "project-occurrence-use-position" },
  createProgramDomain: { module: audiovisualAuthorModuleRef, name: "create-program-domain" },
  closeOccurrence: { module: audiovisualAuthorModuleRef, name: "close-occurrence" },
  createOccurrences: { module: audiovisualAuthorModuleRef, name: "create-occurrences" },
  appendOccurrence: { module: audiovisualAuthorModuleRef, name: "append-occurrence" },
  closeResolvedProgram: { module: audiovisualAuthorModuleRef, name: "close-resolved-program" },
} satisfies Record<string, ProducerRef>;

export const audiovisualAuthorManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audiovisualAuthorModuleRef.name,
  version: audiovisualAuthorModuleRef.version,
  dependencies: [audiovisualDependency, temporalDependency, spatialDependency],
  types: Object.values(audiovisualAuthorTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    {
      name: audiovisualAuthorProducers.createBindings.name,
      inputs: [],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendTemporalMap.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.valueBinding },
        { name: "value", type: temporalTypes.map },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendSpatialDomain.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.valueBinding },
        { name: "value", type: spatialTypes.localDomain },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendSpatialMap.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.valueBinding },
        { name: "value", type: spatialTypes.map },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendPictureOperator.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.operatorBinding },
        { name: "operator", type: audiovisualTypes.pictureOperator },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendAudioOperator.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.operatorBinding },
        { name: "operator", type: audiovisualTypes.audioOperator },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendReconstruction.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.reconstructionBinding },
        { name: "reconstruction", type: audiovisualTypes.signalReconstruction },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.inferOccurrenceDuration.name,
      inputs: [
        { name: "spec", type: audiovisualAuthorTypes.occurrenceUseSpec },
        { name: "source", type: audiovisualTypes.programSource },
      ],
      result: { kind: "output", name: "duration", type: temporalTypes.exactValue },
    },
    {
      name: audiovisualAuthorProducers.resolveOccurrenceUse.name,
      inputs: [
        { name: "spec", type: audiovisualAuthorTypes.occurrenceUseSpec },
        { name: "source", type: audiovisualTypes.programSource },
        { name: "start", type: temporalTypes.exactValue },
        { name: "duration", type: temporalTypes.exactValue },
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
      ],
      result: { kind: "output", name: "use", type: audiovisualAuthorTypes.occurrenceUse },
    },
    {
      name: audiovisualAuthorProducers.bindOccurrenceUseToSource.name,
      inputs: [
        { name: "spec", type: audiovisualAuthorTypes.sourceBoundSpec },
        { name: "target", type: audiovisualAuthorTypes.occurrenceUse },
        { name: "source", type: audiovisualTypes.programSource },
      ],
      result: { kind: "output", name: "use", type: audiovisualAuthorTypes.occurrenceUse },
    },
    {
      name: audiovisualAuthorProducers.bindOccurrenceUseToOccurrence.name,
      inputs: [
        { name: "spec", type: audiovisualAuthorTypes.occurrenceBoundSpec },
        { name: "target", type: audiovisualAuthorTypes.occurrenceUse },
        { name: "source", type: audiovisualTypes.programSource },
      ],
      result: { kind: "output", name: "use", type: audiovisualAuthorTypes.occurrenceUse },
    },
    {
      name: audiovisualAuthorProducers.projectOccurrenceUseOutputMapping.name,
      inputs: [
        { name: "spec", type: audiovisualAuthorTypes.occurrenceOutputSpec },
        { name: "use", type: audiovisualAuthorTypes.occurrenceUse },
      ],
      result: { kind: "output", name: "mapping", type: temporalTypes.map },
    },
    {
      name: audiovisualAuthorProducers.projectOccurrenceUseEnd.name,
      inputs: [{ name: "use", type: audiovisualAuthorTypes.occurrenceUse }],
      result: { kind: "output", name: "end", type: temporalTypes.exactValue },
    },
    {
      name: audiovisualAuthorProducers.projectOccurrenceUsePosition.name,
      inputs: [
        { name: "use", type: audiovisualAuthorTypes.occurrenceUse },
        { name: "local", type: temporalTypes.exactValue },
      ],
      result: { kind: "output", name: "position", type: temporalTypes.exactValue },
    },
    {
      name: audiovisualAuthorProducers.createProgramDomain.name,
      inputs: [
        { name: "spec", type: audiovisualAuthorTypes.programDomainSpec },
        { name: "duration", type: temporalTypes.exactValue },
      ],
      result: { kind: "output", name: "domain", type: temporalTypes.localDomain },
    },
    {
      name: audiovisualAuthorProducers.closeOccurrence.name,
      inputs: [
        { name: "use", type: audiovisualAuthorTypes.occurrenceUse },
        { name: "parent", type: temporalTypes.localDomain },
      ],
      result: { kind: "output", name: "occurrence", type: audiovisualAuthorTypes.occurrence },
    },
    {
      name: audiovisualAuthorProducers.createOccurrences.name,
      inputs: [],
      result: { kind: "output", name: "occurrences", type: audiovisualAuthorTypes.occurrenceSet },
    },
    {
      name: audiovisualAuthorProducers.appendOccurrence.name,
      inputs: [
        { name: "occurrences", type: audiovisualAuthorTypes.occurrenceSet },
        { name: "occurrence", type: audiovisualAuthorTypes.occurrence },
      ],
      result: { kind: "output", name: "occurrences", type: audiovisualAuthorTypes.occurrenceSet },
    },
    {
      name: audiovisualAuthorProducers.closeResolvedProgram.name,
      inputs: [
        { name: "spec", type: audiovisualAuthorTypes.spec },
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "domain", type: temporalTypes.localDomain },
        { name: "occurrences", type: audiovisualAuthorTypes.occurrenceSet },
      ],
      result: { kind: "output", name: "program", type: audiovisualTypes.program },
    },
  ],
};

export const audiovisualAuthorDependency = audiovisualAuthorModuleRef;
