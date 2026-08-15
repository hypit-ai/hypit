import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { speechDependency, speechTypes } from "@narratage/speech";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef } from "@narratage/protocol";

export const speechBasisModuleRef = { name: "@narratage/speech-basis", version: "1" } as const;

export const speechBasisProducers = {
  projectAudio: { module: speechBasisModuleRef, name: "project-audio" },
  projectAudioTrack: { module: speechBasisModuleRef, name: "project-audio-track" },
  projectVisual: { module: speechBasisModuleRef, name: "project-visual" },
  projectProgramSpace: { module: speechBasisModuleRef, name: "project-program-space" },
} satisfies Record<string, ProducerRef>;

export const speechBasisManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: speechBasisModuleRef.name,
  version: speechBasisModuleRef.version,
  dependencies: [
    speechDependency,
    programSpaceDependency,
    compositionDependency,
  ],
  types: [],
  capabilities: [],
  producers: [
    {
      name: speechBasisProducers.projectProgramSpace.name,
      inputs: [{ name: "basis", type: speechTypes.basis }],
      outputs: [{ name: "programSpace", type: programSpaceTypes.programSpace }],
      needs: [],
    },
    {
      name: speechBasisProducers.projectAudio.name,
      inputs: [{ name: "basis", type: speechTypes.basis }],
      outputs: [{ name: "audio", type: speechTypes.audioBasis }],
      needs: [],
    },
    {
      name: speechBasisProducers.projectVisual.name,
      inputs: [{ name: "basis", type: speechTypes.basis }],
      outputs: [{ name: "visual", type: compositionTypes.visualTrack }],
      needs: [],
    },
    {
      name: speechBasisProducers.projectAudioTrack.name,
      inputs: [{ name: "basis", type: speechTypes.basis }],
      outputs: [{ name: "track", type: compositionTypes.audioTrack }],
      needs: [],
    },
  ],
};
