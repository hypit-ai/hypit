import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { temporalDependency } from "@hypit/temporal";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const audioMixModuleRef = { name: "@hypit/audio-mix", version: "1" } as const;
export const audioMixTypes = {
  gainOperatorSpec: { module: audioMixModuleRef, name: "AudioGainOperatorSpec" },
  gainControl: { module: audioMixModuleRef, name: "AudioGainControl" },
} satisfies Record<string, TypeRef>;
export const audioMixProducers = {
  gainOperator: { module: audioMixModuleRef, name: "audio-gain-operator" },
  gainControlOperator: { module: audioMixModuleRef, name: "audio-gain-control-operator" },
} satisfies Record<string, ProducerRef>;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => ({ kind: "object", fields });
export const audioGainOperatorSpecSchema = object({ gain: { schema: { kind: "number", minimum: 0 } } });

export const audioMixManifest: ModuleManifest = {
  format: "hypit.module@1", name: audioMixModuleRef.name, version: audioMixModuleRef.version,
  dependencies: [audiovisualDependency, temporalDependency],
  types: Object.values(audioMixTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    { name: audioMixProducers.gainOperator.name,
      inputs: [{ name: "spec", type: audioMixTypes.gainOperatorSpec }],
      result: { kind: "output", name: "operator", type: audiovisualTypes.audioOperator } },
    { name: audioMixProducers.gainControlOperator.name,
      inputs: [{ name: "control", type: audioMixTypes.gainControl }],
      result: { kind: "output", name: "operator", type: audiovisualTypes.audioOperator } },
  ],
};
