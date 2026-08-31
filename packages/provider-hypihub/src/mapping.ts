import type { CapabilityRef, ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

/** HypiHub model IDs and the normalized request fields they accept. */
const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };
const GPT_IMAGE: ModuleRef = { name: "@hypit/gpt-image", version: "1" };
const NANO_BANANA: ModuleRef = { name: "@hypit/nano-banana", version: "1" };
const SEEDREAM: ModuleRef = { name: "@hypit/seedream", version: "1" };
const MINIMAX: ModuleRef = { name: "@hypit/minimax-h3", version: "1" };
const GROK: ModuleRef = { name: "@hypit/grok-imagine", version: "1" };
const MIMO: ModuleRef = { name: "@hypit/mimo-tts", version: "1" };

const seedance = (name: string, model: string): GenerationWireMapping => ({
  capability: { module: SEEDANCE, name }, result: "video", routes: [{ model }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    resolution: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    duration: { as: "value", field: "seconds" },
  },
});

export const hypiHubMappings: readonly GenerationWireMapping[] = [
  seedance("seedance-2", "bytedance/seedance-2"),
  seedance("seedance-2-fast", "bytedance/seedance-2-fast"),
  seedance("seedance-2-mini", "bytedance/seedance-2-mini"),
  seedance("seedance-2.5", "bytedance/seedance-2-5"),
  {
    capability: { module: GPT_IMAGE, name: "gpt-image-2" }, result: "image", routes: [{ model: "gpt-image-2-text-to-image" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "size", whenAbsent: "1024x1024" },
    },
  },
  ...(["nano-banana-2", "nano-banana-pro"] as const).map((model) => ({
    capability: { module: NANO_BANANA, name: model }, result: "image" as const, routes: [{ model }],
    fields: {
      prompt: { as: "value" as const, field: "prompt" },
      aspectRatio: { as: "value" as const, field: "aspect_ratio" },
      resolution: { as: "value" as const, field: "size", whenAbsent: "1024x1024" },
    },
  })),
  {
    capability: { module: SEEDREAM, name: "seedream-5-lite" }, result: "image", routes: [{ model: "seedream/5-lite-text-to-image" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "size", whenAbsent: "2048x2048" },
    },
  },
  {
    capability: { module: MINIMAX, name: "minimax-h3" }, result: "video", routes: [{ model: "minimax-h3/text-to-video" }],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
    },
  },
  {
    capability: { module: GROK, name: "grok-imagine-video" }, result: "video", routes: [{ model: "grok-imagine/text-to-video" }],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
    },
  },
  {
    capability: { module: GROK, name: "grok-imagine-video-1.5-preview" }, result: "video", routes: [{ model: "grok-imagine/text-to-video" }],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
    },
  },
  {
    capability: { module: MIMO, name: "mimo-v2.5-tts" }, result: "audio", routes: [{ model: "mimo-v2.5-tts" }],
    fields: {
      text: { as: "value", field: "input" }, voice: { as: "value", field: "voice" },
      output: { as: "value", field: "output", whenAbsent: "binary" },
    },
  },
];

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

const byCapability = new Map(hypiHubMappings.map((mapping) => [capabilityKey(mapping.capability), mapping]));

export function hypiHubMappingForCapability(capability: CapabilityRef): GenerationWireMapping | undefined {
  return byCapability.get(capabilityKey(capability));
}
