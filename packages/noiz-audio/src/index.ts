import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationPortTable, sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary, SurfaceVocabulary } from "@hypit/hypit/markup";
import { defineExactModelModule } from "@hypit/generation/model";
import { textTypes } from "@hypit/hypit/text";
import {
  validateNoizTextToSoundInputs,
  validateNoizYue2CoverInputs,
  validateNoizYue2CoverRequest,
  validateNoizYue2MusicInputs,
  validateNoizYue2MusicRequest,
} from "./validation.js";

export const noizAudioModuleRef = { name: "@hypit/noiz-audio", version: "1" } as const;

export const noizAudioModels = [
  "noiz-text-to-sound",
  "noiz-yue2-music",
  "noiz-yue2-cover",
] as const;
export type NoizAudioModel = typeof noizAudioModels[number];

export const NOIZ_SOUND_OUTPUT_FORMATS = ["wav", "mp3"] as const;
export const NOIZ_MUSIC_COT_MODES = ["full", "melody", "off"] as const;
export const NOIZ_VOCAL_GENDERS = ["Male", "Female"] as const;
export const NOIZ_COVER_MELODY_ADHERENCE = ["high", "main_melody"] as const;

/**
 * Exact model inputs for Noiz Text to Sound (`POST /v1/text-to-sound`).
 * Duration accepts decimals from 1 to 30 seconds; billing rounds up to whole seconds.
 */
export const noizTextToSoundPorts: GenerationPortTable = sealGenerationPortTable({
  model: "noiz-text-to-sound",
  result: "audio",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 500 }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", minimum: 1, maximum: 30 }, minItems: 0, maxItems: 1 },
    { name: "outputFormat", value: { kind: "enum", values: NOIZ_SOUND_OUTPUT_FORMATS }, minItems: 0, maxItems: 1 },
  ],
  requires: [],
});

/**
 * Exact model inputs for Noiz YuE2 Text to Music (`POST /v1/text-to-music`).
 * Legacy fields ignored or rejected by YuE2 (`instrumental`, `mv`, `auto_lyrics`,
 * `target_duration`, `reference_audio_*`) are deliberately omitted.
 */
export const noizYue2MusicPorts: GenerationPortTable = sealGenerationPortTable({
  model: "noiz-yue2-music",
  result: "audio",
  ports: [
    { name: "prompt", value: { kind: "text" }, minItems: 1, maxItems: 1 },
    { name: "lyrics", value: { kind: "text" }, minItems: 0, maxItems: 1 },
    { name: "lyricsPrompt", value: { kind: "text" }, minItems: 0, maxItems: 1 },
    { name: "abc", value: { kind: "text", maxChars: 64_000 }, minItems: 0, maxItems: 1 },
    { name: "cot", value: { kind: "enum", values: NOIZ_MUSIC_COT_MODES }, minItems: 0, maxItems: 1 },
    { name: "title", value: { kind: "text" }, minItems: 0, maxItems: 1 },
    { name: "tags", value: { kind: "text" }, minItems: 0, maxItems: 1 },
    { name: "negativeTags", value: { kind: "text" }, minItems: 0, maxItems: 1 },
    { name: "vocalGender", value: { kind: "enum", values: NOIZ_VOCAL_GENDERS }, minItems: 0, maxItems: 1 },
    { name: "lyricTimestamps", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
  ],
  requires: [
    { kind: "atMostOneOf", ports: ["lyrics", "lyricsPrompt"] },
  ],
});

/**
 * Exact model inputs for Noiz YuE2 Cover (`POST /v1/text-to-music/cover`).
 */
export const noizYue2CoverPorts: GenerationPortTable = sealGenerationPortTable({
  model: "noiz-yue2-cover",
  result: "audio",
  ports: [
    { name: "sourceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 1, maxItems: 1 },
    { name: "lyrics", value: { kind: "text" }, minItems: 1, maxItems: 1 },
    { name: "musicDescription", value: { kind: "text" }, minItems: 0, maxItems: 1 },
    { name: "style", value: { kind: "text" }, minItems: 0, maxItems: 1 },
    { name: "melodyAdherence", value: { kind: "enum", values: NOIZ_COVER_MELODY_ADHERENCE }, minItems: 1, maxItems: 1 },
    { name: "title", value: { kind: "text" }, minItems: 0, maxItems: 1 },
    { name: "vocalGender", value: { kind: "enum", values: NOIZ_VOCAL_GENDERS }, minItems: 0, maxItems: 1 },
    { name: "lyricTimestamps", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
  ],
  requires: [],
});

export const noizAudioPorts: Readonly<Record<NoizAudioModel, GenerationPortTable>> = {
  "noiz-text-to-sound": noizTextToSoundPorts,
  "noiz-yue2-music": noizYue2MusicPorts,
  "noiz-yue2-cover": noizYue2CoverPorts,
};

export const noizAudioDefinition = defineExactModelModule({
  module: noizAudioModuleRef,
  endpoints: [
    {
      key: "soundEffect",
      requestTypeName: "NoizTextToSoundRequest",
      producerName: "request-noiz-text-to-sound",
      ports: noizTextToSoundPorts,
      validateInputs: validateNoizTextToSoundInputs,
    },
    {
      key: "music",
      requestTypeName: "NoizYue2MusicRequest",
      producerName: "request-noiz-yue2-music",
      ports: noizYue2MusicPorts,
      validateInputs: validateNoizYue2MusicInputs,
      validateRequest: validateNoizYue2MusicRequest,
    },
    {
      key: "musicCover",
      requestTypeName: "NoizYue2CoverRequest",
      producerName: "request-noiz-yue2-cover",
      ports: noizYue2CoverPorts,
      validateInputs: validateNoizYue2CoverInputs,
      validateRequest: validateNoizYue2CoverRequest,
    },
  ],
});

export const noizAudioEndpoints = noizAudioDefinition.endpoints;
export const noizAudioComponent = noizAudioDefinition.component;
export const noizAudioManifest = noizAudioDefinition.manifest;

const modelEndpointMap = {
  "noiz-text-to-sound": noizAudioEndpoints.soundEffect,
  "noiz-yue2-music": noizAudioEndpoints.music,
  "noiz-yue2-cover": noizAudioEndpoints.musicCover,
} as const;

export function sealNoizAudioRequest(
  model: NoizAudioModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return modelEndpointMap[model].sealRequest(ports);
}

export function sealNoizAudioRequestDraft(
  model: NoizAudioModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(noizAudioPorts[model], ports);
}

const audioPort: readonly SurfacePortVocabulary[] = [
  { name: "audio", type: blobTypes.blob, summary: "The generated audio Artifact, addressed as `<id>.audio`." },
];

const sharedMusicAttributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "title", kind: "literal", required: false, summary: "Sets an optional song title." },
  {
    name: "vocal-gender",
    kind: "literal",
    required: false,
    values: NOIZ_VOCAL_GENDERS,
    summary: "Sets the preferred vocal gender (`Male` or `Female`).",
  },
  {
    name: "lyric-timestamps",
    kind: "literal",
    required: false,
    values: ["true", "false"],
    summary: "Requests per-line lyric timing metadata once generation succeeds; defaults to false.",
  },
];

function declaration(
  name: string,
  tag: string,
  endpoint: (typeof noizAudioEndpoints)[keyof typeof noizAudioEndpoints],
  bindings: readonly string[],
  vocabulary: SurfaceVocabulary,
) {
  return {
    name,
    tag,
    mode: "structured" as const,
    outputs: [endpoint.draftType, ...bindings.map((port) => endpoint.mediaBindings[port]!.type)],
    vocabulary,
  };
}

export const noizAudioMarkupSurfaces = [
  declaration("sound-effect", "SoundEffect", noizAudioEndpoints.soundEffect, [], {
    summary: "Generates a sound effect from a Text prompt with Noiz Text to Sound.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the generated sound effect Artifact." },
      { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the Text describing the sound effect (1 to 500 characters)." },
      { name: "duration", kind: "literal", required: false, summary: "Sets the output duration from 1 to 30 seconds; defaults to 10." },
      { name: "output-format", kind: "literal", required: false, values: NOIZ_SOUND_OUTPUT_FORMATS, summary: "Sets the output audio format (`wav` or `mp3`); defaults to `wav`." },
    ],
    ports: audioPort,
    example: '<noiz:SoundEffect id="rain" prompt={rainPrompt} duration="8" output-format="wav"/>',
    notes: [
      "The prompt must contain 1 to 500 characters, including non-whitespace text.",
      "`duration` accepts decimals from 1 to 30 seconds; billing rounds up to whole seconds.",
      "The element is empty.",
    ],
  }),
  declaration("music", "Music", noizAudioEndpoints.music, [], {
    summary: "Generates a vocal song from a style prompt and lyrics with Noiz YuE2.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the generated music Artifact." },
      { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the Text describing the musical style and mood." },
      { name: "lyrics", kind: "reference", required: false, accepts: [textTypes.text], summary: "Selects custom lyrics Text used as-is; mutually exclusive with `lyrics-prompt`." },
      { name: "lyrics-prompt", kind: "reference", required: false, accepts: [textTypes.text], summary: "Selects a Text prompt for auto-generating lyrics; mutually exclusive with `lyrics`." },
      { name: "abc", kind: "reference", required: false, accepts: [textTypes.text], summary: "Selects an optional ABC music score Text (up to 64,000 characters)." },
      { name: "cot", kind: "literal", required: false, values: NOIZ_MUSIC_COT_MODES, summary: "Sets score-planning mode (`full`, `melody`, or `off`). Defaults to `full` when `abc` is supplied, otherwise `off`." },
      { name: "tags", kind: "literal", required: false, summary: "Comma-separated style tags." },
      { name: "negative-tags", kind: "literal", required: false, summary: "Comma-separated style tags to avoid." },
      ...sharedMusicAttributes,
    ],
    ports: audioPort,
    example: '<noiz:Music id="theme" prompt={stylePrompt} lyrics={songLyrics} vocal-gender="Female" lyric-timestamps="true"/>',
    notes: [
      "Exactly one of `lyrics` or `lyrics-prompt` must be supplied. YuE2 does not support instrumental-only generation.",
      "When `abc` is supplied, it must be non-blank (at most 64,000 characters) and cannot be combined with `cot=\"off\"`.",
      "The element is empty.",
    ],
  }),
  declaration("music-cover", "MusicCover", noizAudioEndpoints.musicCover, ["sourceAudio"], {
    summary: "Generates a cover of a source audio track with new lyrics and style using Noiz YuE2.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the generated cover Artifact." },
      { name: "source-audio", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the source audio Resource to cover (mp3, wav, flac, m4a, aac or ogg, at most 100 MB)." },
      { name: "lyrics", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the lyrics Text to sing over the source melody." },
      { name: "melody-adherence", kind: "literal", required: true, values: NOIZ_COVER_MELODY_ADHERENCE, summary: "Controls how closely the cover follows the source score (`high` or `main_melody`)." },
      { name: "music-description", kind: "reference", required: false, accepts: [textTypes.text], summary: "Selects a free-form Text description of the cover; required unless `style` is set." },
      { name: "style", kind: "literal", required: false, summary: "Style tags for the cover; required unless `music-description` is set." },
      ...sharedMusicAttributes,
    ],
    ports: audioPort,
    example: '<noiz:MusicCover id="cover" source-audio={original.audio} lyrics={newLyrics} music-description={coverPrompt} melody-adherence="main_melody" vocal-gender="Male"/>',
    notes: [
      "At least one of `music-description` or `style` must be supplied.",
      "Source audio must be mp3, wav, flac, m4a, aac, or ogg and at most 100 MB.",
      "The element is empty.",
    ],
  }),
] as const;

export {
  decodeNoizMusicCoverSurface,
  decodeNoizMusicSurface,
  decodeNoizSoundEffectSurface,
} from "./surface.js";
export {
  NOIZ_COVER_SOURCE_AUDIO_MAX_BYTES,
  NOIZ_COVER_SOURCE_AUDIO_MEDIA_TYPES,
  validateNoizCoverSourceAudio,
  validateNoizTextToSoundInputs,
  validateNoizYue2CoverInputs,
  validateNoizYue2CoverRequest,
  validateNoizYue2MusicInputs,
  validateNoizYue2MusicRequest,
} from "./validation.js";
