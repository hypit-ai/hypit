import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ValueSchema } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

export const audioGainModuleRef = { name: "@hypit/audio-gain" } as const;
export const audioGainTypes = {
  gainOperatorSpec: { module: audioGainModuleRef, name: "AudioGainOperatorSpec" },
  gainControl: { module: audioGainModuleRef, name: "AudioGainControl" },
} satisfies Record<string, TypeRef>;
export const audioGainProducers = {
  gainOperator: { module: audioGainModuleRef, name: "audio-gain-operator" },
  gainControlOperator: { module: audioGainModuleRef, name: "audio-gain-control-operator" },
} satisfies Record<string, ProducerRef>;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => ({ kind: "object", fields });
export const audioGainOperatorSpecSchema = object({ gain: { schema: { kind: "number", minimum: 0 } } });

export const audioGainManifest: GenerationModuleDefinition = {
  name: audioGainModuleRef.name,
  dependencies: [audiovisualDependency],
  types: Object.values(audioGainTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    { name: audioGainProducers.gainOperator.name,
      inputs: [{ name: "spec", type: audioGainTypes.gainOperatorSpec }],
      result: { kind: "output", name: "operator", type: audiovisualTypes.audioOperator } },
    { name: audioGainProducers.gainControlOperator.name,
      inputs: [{ name: "control", type: audioGainTypes.gainControl }],
      result: { kind: "output", name: "operator", type: audiovisualTypes.audioOperator } },
  ],
};
