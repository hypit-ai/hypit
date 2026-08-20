import { programSpaceTypes } from "@hypit/program-space";
import { speechTypes } from "@hypit/speech";
import { semanticMapTypes } from "@hypit/semantic-map";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { mediaPipelineProducers } from "@hypit/media-pipeline";
import { speechBasisProducers } from "@hypit/speech-basis";
import { spatialTypes } from "@hypit/spatial";
import type { TypeRef } from "@hypit/protocol";

import { speechSpineProducers, speechSpineTypes } from "./manifest.js";
import type { SpeechSpineFragmentOptions } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createSpeechSpineFragment(options: SpeechSpineFragmentOptions) {
  if (options.takes.length === 0) throw new Error("Speech Spine requires at least one Take");
  const declaredInputs = new Map<string, TypeRef>();
  const addInput = (name: string, type: TypeRef): void => {
    if (!name) throw new Error("Speech Spine Fragment input names must not be empty");
    const previous = declaredInputs.get(name);
    if (previous !== undefined && (previous.module.name !== type.module.name
      || previous.module.version !== type.module.version || previous.name !== type.name)) {
      throw new Error(`Speech Spine Fragment input ${name} is reused with another Type`);
    }
    declaredInputs.set(name, type);
  };
  addInput("program", speechSpineTypes.spineProgram);
  for (const take of options.takes) {
    addInput(take.takeName, speechTypes.semanticTake);
    if (take.visual !== undefined) {
      addInput(take.visual.frameName, spatialTypes.frame);
      addInput(take.visual.fitName, spatialTypes.fit);
      addInput(take.visual.visualSpecName, speechSpineTypes.visualSpec);
    }
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
      producer: take.visual === undefined ? speechSpineProducers.appendAudioTake : speechSpineProducers.appendVisualTake,
      inputs: {
        set: operation(current),
        program: input("program"),
        take: input(take.takeName),
        ...(take.visual === undefined ? {} : {
          frame: input(take.visual.frameName),
          fit: input(take.visual.fitName),
          visualSpec: input(take.visual.visualSpecName),
        }),
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
      result: { kind: "need", name: "audio" },
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
      id: "spine:visual-track",
      producer: speechBasisProducers.projectVisual,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "visual" },
    },
    {
      id: "spine:audio-track",
      producer: speechBasisProducers.projectAudioTrack,
      inputs: { basis: operation("spine:basis") },
      result: { kind: "output", name: "track" },
    },
  );
  operations.push({
    id: "spine:semantic-map",
    producer: speechSpineProducers.assembleSemanticMap,
    inputs: { set: operation(current) },
    result: { kind: "output", name: "map" },
  });
  return sealGraphFragment({
    inputs: [...declaredInputs.entries()].map(([name, type]) => ({ name, type })),
    operations,
    exports: [
      { name: "basis", type: speechTypes.basis, root: operation("spine:basis") },
      {
        name: "space", type: programSpaceTypes.programSpace, root: operation("spine:space"),
      },
      {
        name: "visual", type: compositionTypes.visualTrack, root: operation("spine:visual-track"),
      },
      {
        name: "audioTrack", type: compositionTypes.audioTrack, root: operation("spine:audio-track"),
      },
      { name: "semanticMap", type: semanticMapTypes.complete, root: operation("spine:semantic-map") },
    ],
  });
}
