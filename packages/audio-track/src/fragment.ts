import { timelineTypes } from "@hypit/timeline";

import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
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

export function createAudioTrackFragment(clips: readonly AudioTrackFragmentItem[]) {
  if (clips.length === 0) throw new Error("Audio Track Fragment requires at least one Clip.");
  const inputTypes = new Map<string, (typeof audioTrackTypes.clipSpec | typeof mediaTypes.prepared | typeof temporalTypes.window)>();
  const operations: FragmentOperation[] = [
    { id: "audio:set:empty", producer: audioTrackProducers.createSet, inputs: {}, result: { kind: "output" as const, name: "set" } },
  ];
  let current = "audio:set:empty";
  clips.forEach((clip, index) => {
    inputTypes.set(clip.mediaName, mediaTypes.prepared);
    inputTypes.set(clip.specName, audioTrackTypes.clipSpec);
    inputTypes.set(clip.windowName, temporalTypes.window);
    const id = `audio:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id,
      producer: audioTrackProducers.appendClip,
      inputs: {
        set: operation(current), header: input("header"), timeline: input("timeline"),
        media: input(clip.mediaName), spec: input(clip.specName),
        window: input(clip.windowName),
      },
      result: { kind: "output" as const, name: "set" },
    });
    current = id;
  });
  operations.push(
    { id: "audio:program", producer: audioTrackProducers.finalize, inputs: { set: operation(current), header: input("header") }, result: { kind: "output" as const, name: "program" } },
    { id: "audio:track", producer: audioTrackProducers.render, inputs: { timeline: input("timeline"), program: operation("audio:program") }, result: { kind: "output" as const, name: "track" } },
  );
  return sealGraphFragment({
    inputs: [
      { name: "header", type: audioTrackTypes.header },
      { name: "timeline", type: timelineTypes.timeline },
      ...[...inputTypes].map(([inputName, type]) => ({ name: inputName, type })),
    ],
    operations,
    exports: [
      { name: "program", type: audioTrackTypes.program, root: operation("audio:program") },
      { name: "audio", type: compositionTypes.audioTrack, root: operation("audio:track") },
    ],
  });
}

export const programAudioTrackFragment = createAudioTrackFragment([
  { mediaName: "media", specName: "spec", windowName: "window" },
]);
