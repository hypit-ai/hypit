import { sealGraphFragment } from "@hypit/hypit/generation/author";
import { mediaTypes } from "@hypit/media";

import {
  speechEvidenceModuleRef,
  speechEvidenceProducers,
  speechEvidenceTypes,
} from "./contract.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Media analysis preparation contributed by its owning package, not by the graph Core. */
export const speechEvidenceGenerationNodes = {
  projectAudio: { module: speechEvidenceModuleRef, name: "project-audio" },
} as const;

export const speechEvidenceAudioFragment = sealGraphFragment({
  inputs: [{ name: "media", type: mediaTypes.prepared }],
  operations: [{
    id: "project-audio",
    producer: speechEvidenceProducers.projectAudio,
    inputs: { media: input("media") },
    result: { kind: "need", name: "evidenceAudio" },
  }],
  exports: [{
    name: "evidence",
    type: speechEvidenceTypes.audio,
    root: operation("project-audio"),
  }],
});
