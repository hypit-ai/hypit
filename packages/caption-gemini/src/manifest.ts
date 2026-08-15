import { captionManifest, captionModuleRef, captionTypes } from "@narratage/caption";
import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@narratage/protocol";

export const captionGeminiModuleRef = { name: "@narratage/caption-gemini", version: "1" } as const;
export const captionGeminiTypes = {
  program: { module: captionGeminiModuleRef, name: "CaptionGeminiProgram" },
  request: { module: captionGeminiModuleRef, name: "CaptionGeminiRequest" },
} satisfies Record<string, TypeRef>;
export const captionGeminiCapabilities = {
  plan: { module: captionGeminiModuleRef, name: "gemini-caption-planning" },
} satisfies Record<string, CapabilityRef>;
export const captionGeminiProducers = {
  compile: { module: captionGeminiModuleRef, name: "compile-caption-gemini-request" },
  request: { module: captionGeminiModuleRef, name: "request-caption-gemini-plan" },
} satisfies Record<string, ProducerRef>;

export const captionGeminiMarkupSurfaces = [{
    name: "planner",
    tag: "Planner",
    mode: "structured",
    outputs: [captionGeminiTypes.program, captionTypes.plan],
  }] as const;


export const captionGeminiManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: captionGeminiModuleRef.name,
  version: captionGeminiModuleRef.version,
  dependencies: [
    narrativeDependency,
    { module: captionModuleRef },
  ],
  types: [
    { name: captionGeminiTypes.program.name },
    { name: captionGeminiTypes.request.name },
  ],
  capabilities: [{ name: captionGeminiCapabilities.plan.name, returns: captionTypes.plan }],
  producers: [
    {
      name: captionGeminiProducers.compile.name,
      inputs: [
        { name: "display", type: narrativeTypes.captionDisplay },
        { name: "captionProgram", type: captionTypes.program },
        { name: "program", type: captionGeminiTypes.program },
      ],
      outputs: [{ name: "request", type: captionGeminiTypes.request }],
      needs: [],
    },
    {
      name: captionGeminiProducers.request.name,
      inputs: [{ name: "request", type: captionGeminiTypes.request }],
      outputs: [],
      needs: [{ name: "plan", capability: captionGeminiCapabilities.plan, returns: captionTypes.plan }],
    },
  ],
};
