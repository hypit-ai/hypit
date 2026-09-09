import { speechTypes } from "@hypit/speech";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { semanticTrackProducers, semanticTrackTypes } from "@hypit/semantic-track";
import type { TypeRef } from "@hypit/protocol";

import { speechTrackProducers, speechTrackTypes } from "./manifest.js";
import type { SpeechTrackFragmentOptions } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createSpeechTrackFragment(options: SpeechTrackFragmentOptions) {
  if (options.takes.length === 0) throw new Error("Speech Track requires at least one Take");
  const declaredInputs = new Map<string, TypeRef>();
  const addInput = (name: string, type: TypeRef): void => {
    if (!name) throw new Error("Speech Track Fragment input names must not be empty");
    const previous = declaredInputs.get(name);
    if (previous !== undefined && (previous.module.name !== type.module.name
      || previous.module.version !== type.module.version || previous.name !== type.name)) {
      throw new Error(`Speech Track Fragment input ${name} is reused with another Type`);
    }
    declaredInputs.set(name, type);
  };
  addInput("header", speechTrackTypes.header);
  for (const take of options.takes) {
    addInput(take.takeName, speechTypes.semanticTake);
  }
  const operations: FragmentOperation[] = [{
    id: "track:set:empty",
    producer: speechTrackProducers.createSet,
    inputs: {},
    result: { kind: "output", name: "set" },
  }];
  let current = "track:set:empty";
  options.takes.forEach((take, index) => {
    const id = `track:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id,
      producer: speechTrackProducers.appendTake,
      inputs: {
        set: operation(current),
        take: input(take.takeName),
      },
      result: { kind: "output", name: "set" },
    });
    current = id;
  });
  operations.push(
    {
      id: "track:semantic",
      producer: speechTrackProducers.assembleTrack,
      inputs: { header: input("header"), set: operation(current) },
      result: { kind: "output", name: "track" },
    },
    {
      id: "track:audio-track",
      producer: semanticTrackProducers.projectAudio,
      inputs: { track: operation("track:semantic") },
      result: { kind: "output", name: "audio" },
    },
  );
  return sealGraphFragment({
    inputs: [...declaredInputs.entries()].map(([name, type]) => ({ name, type })),
    operations,
    exports: [
      { name: "semantic", type: semanticTrackTypes.track, root: operation("track:semantic") },
      {
        name: "audio", type: compositionTypes.audioTrack, root: operation("track:audio-track"),
      },
    ],
  });
}
