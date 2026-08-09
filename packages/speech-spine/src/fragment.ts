import { narrativeTypes } from "@narratage/narrative";
import { mediaTypes } from "@narratage/media";
import { programSpaceTypes } from "@narratage/program-space";
import { speechTypes } from "@narratage/speech";
import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import type { FragmentOperation } from "@narratage/elaborator";
import { mediaPipelineProducers } from "@narratage/media-pipeline";
import { speechBasisProducers } from "@narratage/speech-basis";
import { spatialTypes } from "@narratage/spatial";

import { speechSpineProducers, speechSpineTypes } from "./manifest.js";
import type { SpeechSpineFragmentOptions } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createSpeechSpineFragment(options: SpeechSpineFragmentOptions) {
  if (options.takes.length === 0) throw new Error("Speech Spine requires at least one Take");
  const names = new Set(["program", "canvas"]);
  for (const take of options.takes) {
    if (!take.mediaName || !take.segmentName || names.has(take.mediaName) || names.has(take.segmentName)) {
      throw new Error("Speech Spine Fragment input names are empty or duplicated");
    }
    names.add(take.mediaName);
    names.add(take.segmentName);
  }
  const operations: FragmentOperation[] = [{
    id: "spine:set:empty",
    producer: speechSpineProducers.createSet,
    inputs: {},
    result: { kind: "output", name: "set" },
  }];
  let current = "spine:set:empty";
  options.takes.forEach((take, index) => {
    const id = `spine:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id,
      producer: speechSpineProducers.appendTake,
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
      producer: speechSpineProducers.compileAudio,
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
      producer: speechSpineProducers.assembleBasis,
      inputs: { program: input("program"), set: operation(current), audio: operation("spine:audio:render") },
      result: { kind: "output", name: "basis" },
    },
    {
      id: "spine:space",
      producer: speechBasisProducers.projectProgramSpace,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "programSpace" },
    },
    {
      id: "spine:audio-basis",
      producer: speechBasisProducers.projectAudio,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "audio" },
    },
    {
      id: "spine:visual-track",
      producer: speechBasisProducers.projectVisual,
      inputs: { basis: operation("spine:basis"), canvas: input("canvas") },
      result: { kind: "output", name: "visual" },
    },
    {
      id: "spine:audio-track",
      producer: speechBasisProducers.projectAudioTrack,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "track" },
    },
  );
  const semanticInputs = ["program", ...options.takes.flatMap((take) => [take.mediaName, take.segmentName])];
  return sealGraphFragment({
    name: options.name?.trim() || "@narratage/speech-spine/spine@1",
    inputs: [
      { name: "program", type: speechSpineTypes.spineProgram },
      { name: "canvas", type: spatialTypes.canvas },
      ...options.takes.flatMap((take) => [
        { name: take.mediaName, type: mediaTypes.synchronized },
        { name: take.segmentName, type: narrativeTypes.excerpt },
      ]),
    ],
    operations,
    exports: [
      { name: "basis", type: speechTypes.basis, root: operation("spine:basis"), semanticInputs, fidelity: "exact" },
      {
        name: "space", type: programSpaceTypes.programSpace, root: operation("spine:space"), semanticInputs,
        fidelity: "exact",
      },
      {
        name: "audio", type: speechTypes.audioBasis, root: operation("spine:audio-basis"), semanticInputs,
        fidelity: "exact",
      },
      {
        name: "visual", type: compositionTypes.visualTrack, root: operation("spine:visual-track"), semanticInputs: [...semanticInputs, "canvas"],
        fidelity: "exact",
      },
      {
        name: "audioTrack", type: compositionTypes.audioTrack, root: operation("spine:audio-track"), semanticInputs,
        fidelity: "exact",
      },
    ],
  });
}
