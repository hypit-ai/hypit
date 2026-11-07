import type { ModuleManifest, TypeRef } from "@hypit/hypit/protocol";

export const timedTranscriptModuleRef = { name: "@hypit/timed-transcript", version: "1" } as const;
export const timedTranscriptTypes = {
  transcript: { module: timedTranscriptModuleRef, name: "TimedTranscript" },
} satisfies Record<string, TypeRef>;

export const timedTranscriptManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: timedTranscriptModuleRef.name,
  version: timedTranscriptModuleRef.version,
  dependencies: [],
  types: [timedTranscriptTypes.transcript.name],
  capabilities: [],
  producers: [],
};
export const timedTranscriptDependency = timedTranscriptModuleRef;
