import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { speechDependency, speechTypes } from "@hypit/speech";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import type { ModuleManifest, ProducerRef } from "@hypit/protocol";

export const speechBasisModuleRef = { name: "@hypit/speech-basis", version: "1" } as const;

export const speechBasisProducers = {
  projectAudioTrack: { module: speechBasisModuleRef, name: "project-audio-track" },
  projectVisual: { module: speechBasisModuleRef, name: "project-visual" },
  projectProgramSpace: { module: speechBasisModuleRef, name: "project-program-space" },
} satisfies Record<string, ProducerRef>;

export const speechBasisManifest: ModuleManifest = {
  format: "hypit.module@1",
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
