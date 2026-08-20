import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";

import { audioTrackProducers, audioTrackTypes } from "./manifest.js";

export type AudioTrackFragmentItem =
  | { readonly kind: "program"; readonly mediaName: string; readonly specName: string }
  | { readonly kind: "selection"; readonly mediaName: string; readonly specName: string; readonly sourceName: string }
  | { readonly kind: "moment"; readonly mediaName: string; readonly specName: string; readonly sourceName: string };

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createAudioTrackFragment(items: readonly AudioTrackFragmentItem[]) {
  if (items.length === 0) throw new Error("Audio Track Fragment requires at least one Item.");
  const inputTypes = new Map<string, (typeof audioTrackTypes.clipSpec | typeof mediaTypes.synchronized | typeof narrativeTypes.selection | typeof narrativeTypes.moment)>();
  const operations: FragmentOperation[] = [
    { id: "audio:set:empty", producer: audioTrackProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } },
  ];
  let current = "audio:set:empty";
  items.forEach((item, index) => {
    inputTypes.set(item.mediaName, mediaTypes.synchronized);
    inputTypes.set(item.specName, audioTrackTypes.clipSpec);
    if (item.kind !== "program") {
      inputTypes.set(item.sourceName, item.kind === "selection" ? narrativeTypes.selection : narrativeTypes.moment);
    }
    const id = `audio:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id,
      producer: item.kind === "program"
        ? audioTrackProducers.appendProgram
        : item.kind === "selection"
          ? audioTrackProducers.appendSelection
          : audioTrackProducers.appendMoment,
      inputs: {
        set: operation(current), header: input("header"), semantic: input("semantic"),
        media: input(item.mediaName), spec: input(item.specName),
        ...(item.kind === "program" ? {} : {
          [item.kind]: input(item.sourceName),
        }),
      },
      result: { kind: "output", name: "set" },
    });
    current = id;
  });
  operations.push(
    { id: "audio:program", producer: audioTrackProducers.finalize, inputs: { set: operation(current), header: input("header") }, result: { kind: "output", name: "program" } },
    { id: "audio:track", producer: audioTrackProducers.render, inputs: { semantic: input("semantic"), program: operation("audio:program") }, result: { kind: "output", name: "track" } },
  );
  return sealGraphFragment({
    inputs: [
      { name: "header", type: audioTrackTypes.header },
      { name: "semantic", type: semanticTrackTypes.track },
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
  { kind: "program", mediaName: "media", specName: "spec" },
]);
