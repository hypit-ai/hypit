import { contractTypes } from "@narratage/video-contracts";
import { sealGraphFragment } from "@narratage/elaborator";
import type { FragmentOperation } from "@narratage/elaborator";
import { mediaPipelineProducers } from "@narratage/media-pipeline";
import { speechTakeProducers } from "@narratage/speech-take";

import { speechProgramProducers, speechProgramTypes } from "./manifest.js";
import type { SpeechSpineFragmentOptions } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createSpeechSpineFragment(options: SpeechSpineFragmentOptions) {
  if (options.takes.length === 0) throw new Error("Speech Spine requires at least one Take");
  const names = new Set(["program"]);
  for (const take of options.takes) {
    if (!take.mediaName || !take.segmentName || names.has(take.mediaName) || names.has(take.segmentName)) {
      throw new Error("Speech Spine Fragment input names are empty or duplicated");
    }
    names.add(take.mediaName);
    names.add(take.segmentName);
  }
  const operations: FragmentOperation[] = [{
    id: "spine:set:empty",
    producer: speechProgramProducers.createSet,
    inputs: {},
    result: { kind: "output", name: "set" },
  }];
  let current = "spine:set:empty";
  options.takes.forEach((take, index) => {
    const id = `spine:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id,
      producer: speechProgramProducers.appendTake,
      inputs: {
        set: operation(current),
        program: input("program"),
        media: input(take.mediaName),
        segment: input(take.segmentName),
      },
      result: { kind: "output", name: "set" },
    });
    current = id;
  });
  operations.push(
    {
      id: "spine:audio:plan",
      producer: speechProgramProducers.compileAudio,
      inputs: { program: input("program"), set: operation(current) },
      result: { kind: "output", name: "plan" },
    },
    {
      id: "spine:audio:render",
      producer: mediaPipelineProducers.renderAudio,
      inputs: { plan: operation("spine:audio:plan") },
      result: { kind: "need", name: "audio", accepts: "exact" },
    },
    {
      id: "spine:basis",
      producer: speechProgramProducers.assembleBasis,
      inputs: { program: input("program"), set: operation(current), audio: operation("spine:audio:render") },
      result: { kind: "output", name: "basis" },
    },
    {
      id: "spine:space",
      producer: speechTakeProducers.projectProgramSpace,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "programSpace" },
    },
    {
      id: "spine:audio-basis",
      producer: speechTakeProducers.projectAudio,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "audio" },
    },
    {
      id: "spine:visual-track",
      producer: speechTakeProducers.projectVisual,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "visual" },
    },
    {
      id: "spine:audio-track",
      producer: speechTakeProducers.projectAudioTrack,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "track" },
    },
  );
  const semanticInputs = ["program", ...options.takes.flatMap((take) => [take.mediaName, take.segmentName])];
  return sealGraphFragment({
    name: options.name?.trim() || "@narratage/speech-program/spine@1",
    inputs: [
      { name: "program", type: speechProgramTypes.spineProgram },
      ...options.takes.flatMap((take) => [
        { name: take.mediaName, type: contractTypes.synchronizedMedia },
        { name: take.segmentName, type: contractTypes.narrativeExcerpt },
      ]),
    ],
    operations,
    exports: [
      { name: "basis", type: contractTypes.speechBasis, root: operation("spine:basis"), semanticInputs, fidelity: "exact" },
      {
        name: "space", type: contractTypes.programSpace, root: operation("spine:space"), semanticInputs,
        fidelity: "exact",
      },
      {
        name: "audio", type: contractTypes.speechAudioBasis, root: operation("spine:audio-basis"), semanticInputs,
        fidelity: "exact",
      },
      {
        name: "visual", type: contractTypes.visualTrack, root: operation("spine:visual-track"), semanticInputs,
        fidelity: "exact",
      },
      {
        name: "audioTrack", type: contractTypes.audioTrack, root: operation("spine:audio-track"), semanticInputs,
        fidelity: "exact",
      },
    ],
  });
}
