import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import { compositionTypes } from "@hypit/composition";
import { timelineTypes } from "@hypit/timeline";
import { audioMixProducers, audioMixTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createAudioMixFragment(count: number) {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("Audio Mix Fragment requires inputs.");
  const operations: FragmentOperation[] = [{ id: "set:empty", producer: audioMixProducers.createSet,
    inputs: {}, result: { kind: "output", name: "set" } }];
  let current = "set:empty";
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index + 1).padStart(4, "0");
    const id = `set:append:${suffix}`;
    operations.push({ id, producer: audioMixProducers.appendInput, inputs: {
      set: operation(current), timeline: input("timeline"), spec: input(`spec-${suffix}`), track: input(`track-${suffix}`),
    }, result: { kind: "output", name: "set" } });
    current = id;
  }
  operations.push({ id: "mix:finalize", producer: audioMixProducers.finalize,
    inputs: { set: operation(current), header: input("header"), timeline: input("timeline") },
    result: { kind: "output", name: "track" } });
  return sealGraphFragment({
    inputs: [
      { name: "header", type: audioMixTypes.header }, { name: "timeline", type: timelineTypes.timeline },
      ...Array.from({ length: count }, (_, index) => {
        const suffix = String(index + 1).padStart(4, "0");
        return [{ name: `spec-${suffix}`, type: audioMixTypes.inputSpec },
          { name: `track-${suffix}`, type: compositionTypes.audioTrack }];
      }).flat(),
    ],
    operations,
    exports: [{ name: "audio", type: compositionTypes.audioTrack, root: operation("mix:finalize") }],
  });
}
