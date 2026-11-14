import type { TypeRef } from "@hypit/hypit/module";
import type { GenerationModuleDefinition } from "@hypit/hypit/generation/build";

export const timedTranscriptModuleRef = { name: "@hypit/timed-transcript" } as const;
export const timedTranscriptTypes = {
  transcript: { module: timedTranscriptModuleRef, name: "TimedTranscript" },
} satisfies Record<string, TypeRef>;

export const timedTranscriptManifest: GenerationModuleDefinition = {
  name: timedTranscriptModuleRef.name,
  dependencies: [],
  types: [timedTranscriptTypes.transcript.name],
  capabilities: [],
  producers: [],
};
export const timedTranscriptDependency = timedTranscriptModuleRef;
