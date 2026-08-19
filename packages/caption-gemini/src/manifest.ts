import { captionManifest, captionModuleRef, captionTypes } from "@hypit/caption";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";

export const captionGeminiModuleRef = { name: "@hypit/caption-gemini", version: "1" } as const;
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
    vocabulary: {
      summary: "Asks a Gemini model to cut a Caption display sequence into Cues and assign declared fields, producing a CaptionPlan.",
      attributes: [
        {
          name: "id",
          kind: "identifier",
          required: true,
          summary: "Names this planner and prefixes the bindings it publishes.",
        },
        {
          name: "display",
          kind: "reference",
          required: true,
          summary: "The display sequence whose Atoms Gemini reads and must cover completely.",
          accepts: [narrativeTypes.captionDisplay],
        },
        {
          name: "program",
          kind: "reference",
          required: true,
          summary: "The Caption Program whose resolved Style runs bound each planning request.",
          accepts: [captionTypes.program],
        },
        {
          name: "model",
          kind: "literal",
          required: true,
          summary: "Which Gemini model the Runtime capability answers with.",
          values: ["gemini-2.5-flash", "gemini-3.1-pro-preview"],
        },
      ],
      ports: [{
        name: "plan",
        type: captionTypes.plan,
        summary: "The validated CaptionPlan, with stable Atom and Word ids restored.",
      }],
      example: `<caption-ai:Planner
  id="caption-plan"
  display={story.caption}
  program={caption-program}
  model="gemini-2.5-flash"
/>`,
      notes: [
        "The element accepts no children.",
        "Model choice is author-visible; the Runtime separately binds the planning capability to an Endpoint.",
      ],
    },
  }] as const;


export const captionGeminiManifest: ModuleManifest = {
  format: "hypit.module@1",
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
