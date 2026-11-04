import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { audioGainProducers, audioGainTypes } from "./manifest.js";
import { assertAudioGainControl, audioGainControlOperator, audioGainOperator } from "./gain.js";
import type { AudioGainControl } from "./gain.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audioGainComponent = {
  producers: [
    { producer: audioGainProducers.gainOperator, handler: ({ inputs }) => {
      const spec = valueOf<{ readonly gain: number }>(inputs.spec?.value, "AudioGainOperatorSpec");
      return { kind: "output", value: canonicalize(audioGainOperator(spec.gain)) };
    } },
    { producer: audioGainProducers.gainControlOperator, handler: ({ inputs }) => ({
      kind: "output",
      value: canonicalize(audioGainControlOperator(
        valueOf<AudioGainControl>(inputs.control?.value, "AudioGainControl"),
      )),
    }) },
  ],
  refinements: [
    { type: audioGainTypes.gainOperatorSpec, handler: ({ value }) => {
      const spec = valueOf<{ readonly gain: number }>(value, "AudioGainOperatorSpec");
      if (Object.keys(spec).join("\u0000") !== "gain" || !Number.isFinite(spec.gain) || spec.gain < 0) {
        throw new Error("AudioGainOperatorSpec is invalid.");
      }
    } },
    { type: audioGainTypes.gainControl, handler: ({ value }) => {
      assertAudioGainControl(valueOf<AudioGainControl>(value, "AudioGainControl"));
    } },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
