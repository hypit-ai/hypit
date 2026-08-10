import { sealTextBindings } from "@narratage/text";
import type { TextBindings, TextScalar } from "@narratage/text";
import {
  sealSeedanceSpeechProgram,
  seedanceModels,
} from "@narratage/seedance";
import type { SeedanceSpeechProgram } from "@narratage/seedance";

import type { SpeakerTakeIntent } from "./types.js";

export const speakerMethodDefaults = {
  model: "seedance-2-mini",
  resolution: "720p",
  aspectRatio: "9:16",
  webSearch: false,
} as const;

export function sealSpeakerTakeIntent(value: SpeakerTakeIntent): SpeakerTakeIntent {
  const intent = structuredClone(value);
  verifySpeakerTakeIntent(intent);
  return intent;
}

export function verifySpeakerTakeIntent(value: unknown): asserts value is SpeakerTakeIntent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Speaker TakeIntent must be an object");
  }
  const intent = value as SpeakerTakeIntent;
  if (
    intent.contract !== "svml.seedance-speaker-take-intent@1"
    || !/^[a-z][a-z0-9-]{0,95}$/u.test(intent.kit)
    || !seedanceModels.includes(intent.model)
    || !["480p", "720p", "1080p"].includes(intent.resolution)
    || !["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"].includes(intent.aspectRatio)
    || typeof intent.webSearch !== "boolean"
  ) {
    throw new Error("Speaker TakeIntent method settings are invalid");
  }
  if (intent.resolution === "1080p" && intent.model !== "seedance-2") {
    throw new Error("Seedance Mini and Fast Speaker Kits support at most 720p");
  }
  if (
    typeof intent.recipe?.path !== "string"
    || intent.recipe.path.length === 0
    || intent.promptParameters === null
    || typeof intent.promptParameters !== "object"
    || Array.isArray(intent.promptParameters)
  ) {
    throw new Error("Speaker TakeIntent identity or parameters are invalid");
  }
  for (const [name, item] of Object.entries(intent.promptParameters)) {
    if (!/^[a-z][a-z0-9-]{0,95}$/u.test(name)) throw new Error(`Speaker prompt parameter ${name} is invalid`);
    if (typeof item !== "string" && typeof item !== "boolean" && !(typeof item === "number" && Number.isFinite(item))) {
      throw new Error(`Speaker prompt parameter ${name} must be a finite scalar`);
    }
  }
  const images = intent.references.filter((item) => item.kind === "image");
  const audios = intent.references.filter((item) => item.kind === "audio");
  if (images.length < 1 || images.length > 9 || audios.length > 3) {
    throw new Error("Speaker requires 1-9 image references and at most 3 audio references");
  }
  for (const item of intent.references) {
    if ((item.kind !== "image" && item.kind !== "audio") || typeof item.role !== "string" || item.role.length === 0) {
      throw new Error("Speaker reference is invalid");
    }
  }
}

function audioCount(intent: SpeakerTakeIntent): "zero" | "one" | "many" {
  const count = intent.references.filter((item) => item.kind === "audio").length;
  return count === 0 ? "zero" : count === 1 ? "one" : "many";
}

export function createSpeakerTextBindings(intent: SpeakerTakeIntent): TextBindings {
  verifySpeakerTakeIntent(intent);
  const values: Record<string, TextScalar> = {};
  for (const [name, value] of Object.entries(intent.promptParameters)) {
    values[name] = value as TextScalar;
  }
  return sealTextBindings({
    ...values,
    "image-count": intent.references.filter((item) => item.kind === "image").length === 1 ? "one" : "many",
    "audio-count": audioCount(intent),
  });
}

export function createSpeakerSpeechProgram(intent: SpeakerTakeIntent): SeedanceSpeechProgram {
  verifySpeakerTakeIntent(intent);
  return sealSeedanceSpeechProgram({
    contract: "svml.seedance-speech-spine@1",
    model: intent.model,
    ports: {
      resolution: [intent.resolution],
      aspectRatio: [intent.aspectRatio],
      generateAudio: [true],
      webSearch: [intent.webSearch],
    },
  });
}
