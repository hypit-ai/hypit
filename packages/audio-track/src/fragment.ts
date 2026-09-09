import { programSpaceTypes } from "@hypit/program-space";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { mediaTypes } from "@hypit/media";
import { temporalTypes } from "@hypit/temporal";

import { audioTrackProducers, audioTrackTypes } from "./manifest.js";

export type AudioTrackFragmentItem = {
  readonly mediaName: string;
  readonly specName: string;
  readonly windowName: string;
};

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createAudioTrackFragment(items: readonly AudioTrackFragmentItem[]) {
  if (items.length === 0) throw new Error("Audio Track Fragment requires at least one Item.");
  const inputTypes = new Map<string, (typeof audioTrackTypes.clipSpec | typeof mediaTypes.synchronized | typeof temporalTypes.window)>();
  const operations: FragmentOperation[] = [
    { id: "audio:set:empty", producer: audioTrackProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } },
  ];
  let current = "audio:set:empty";
  items.forEach((item, index) => {
    inputTypes.set(item.mediaName, mediaTypes.synchronized);
    inputTypes.set(item.specName, audioTrackTypes.clipSpec);
    inputTypes.set(item.windowName, temporalTypes.window);
    const id = `audio:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id,
      producer: audioTrackProducers.appendItem,
      inputs: {
        set: operation(current), header: input("header"), space: input("space"),
        media: input(item.mediaName), spec: input(item.specName),
        window: input(item.windowName),
      },
      result: { kind: "output", name: "set" },
    });
    current = id;
  });
  operations.push(
    { id: "audio:program", producer: audioTrackProducers.finalize, inputs: { set: operation(current), header: input("header") }, result: { kind: "output", name: "program" } },
    { id: "audio:track", producer: audioTrackProducers.render, inputs: { space: input("space"), program: operation("audio:program") }, result: { kind: "output", name: "track" } },
  );
  return sealGraphFragment({
    inputs: [
      { name: "header", type: audioTrackTypes.header },
      { name: "space", type: programSpaceTypes.programSpace },
      ...[...inputTypes].map(([inputName, type]) => ({ name: inputName, type })),
    ],
    operations,
    exports: [
      { name: "program", type: audioTrackTypes.program, root: operation("audio:program") },
      { name: "track", type: compositionTypes.audioTrack, root: operation("audio:track") },
    ],
  });
}

export const programAudioTrackFragment = createAudioTrackFragment([
  { mediaName: "media", specName: "spec", windowName: "window" },
]);
