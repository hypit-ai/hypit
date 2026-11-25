import { blobTypes } from "@hypit/hypit/blob";
import { sealGenerationPortTable, sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary, SurfaceVocabulary } from "@hypit/hypit/markup";
import { defineExactModelModule } from "@hypit/generation/model";
import { textTypes } from "@hypit/hypit/text";
import {
  validateNoizTextToSoundInputs,
  validateNoizTtsInputs,
  validateNoizVoiceCloneInputs,
  validateNoizYue2CoverInputs,
  validateNoizYue2CoverRequest,
  validateNoizYue2MusicInputs,
  validateNoizYue2MusicRequest,
} from "./validation.js";

export const noizAudioModuleRef = { name: "@hypit/noiz-audio", version: "1" } as const;

export const noizAudioModels = [
  "noiz-text-to-sound",
  "noiz-tts",
  "noiz-voice-clone",
  "noiz-yue2-music",
  "noiz-yue2-cover",
] as const;
export type NoizAudioModel = typeof noizAudioModels[number];

export const NOIZ_SOUND_OUTPUT_FORMATS = ["wav", "mp3"] as const;
export const NOIZ_TTS_MODELS = ["v1", "v2", "v3"] as const;
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

const sharedTtsPorts = [
  { name: "modelId", value: { kind: "enum", values: NOIZ_TTS_MODELS }, minItems: 0, maxItems: 1 },
  { name: "outputFormat", value: { kind: "enum", values: NOIZ_SOUND_OUTPUT_FORMATS }, minItems: 0, maxItems: 1 },
  { name: "speed", value: { kind: "number", minimum: 0.5, maximum: 2 }, minItems: 0, maxItems: 1 },
  { name: "duration", value: { kind: "number", minimum: 0.1 }, minItems: 0, maxItems: 1 },
  { name: "targetLang", value: { kind: "text" }, minItems: 0, maxItems: 1 },
  { name: "qualityPreset", value: { kind: "number", integer: true, minimum: 0, maximum: 5 }, minItems: 0, maxItems: 1 },
  { name: "similarityEnh", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
  { name: "emo", value: { kind: "text" }, minItems: 0, maxItems: 1 },
  { name: "trimSilence", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
] as const;

/**
 * Exact model inputs for Noiz Text to Speech (`POST /v1/text-to-speech`).
 */
export const noizTtsPorts: GenerationPortTable = sealGenerationPortTable({
  model: "noiz-tts",
  result: "audio",
  ports: [
    { name: "text", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    { name: "voiceId", value: { kind: "text" }, minItems: 1, maxItems: 1 },
    ...sharedTtsPorts,
  ],
  requires: [],
});

/**
 * Exact model inputs for Noiz Voice Clone (`POST /v1/voices` -> `POST /v1/text-to-speech`).
 */
export const noizVoiceClonePorts: GenerationPortTable = sealGenerationPortTable({
  model: "noiz-voice-clone",
  result: "audio",
  ports: [
    { name: "text", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    { name: "voiceReference", value: { kind: "media", accepts: ["audio"] }, minItems: 1, maxItems: 1 },
    ...sharedTtsPorts,
    { name: "denoise", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
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
  "noiz-tts": noizTtsPorts,
  "noiz-voice-clone": noizVoiceClonePorts,
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
      key: "tts",
      requestTypeName: "NoizTtsRequest",
      producerName: "request-noiz-tts",
      ports: noizTtsPorts,
      validateInputs: validateNoizTtsInputs,
    },
    {
      key: "voiceClone",
      requestTypeName: "NoizVoiceCloneRequest",
      producerName: "request-noiz-voice-clone",
      ports: noizVoiceClonePorts,
      validateInputs: validateNoizVoiceCloneInputs,
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
  "noiz-tts": noizAudioEndpoints.tts,
  "noiz-voice-clone": noizAudioEndpoints.voiceClone,
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

const sharedTtsAttributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "model-id", kind: "literal", required: false, values: NOIZ_TTS_MODELS, summary: "Selects the Noiz TTS model (`v1`, `v2`, or `v3`)." },
  { name: "output-format", kind: "literal", required: false, values: NOIZ_SOUND_OUTPUT_FORMATS, summary: "Sets the output audio format (`wav` or `mp3`); defaults to `wav`." },
  { name: "speed", kind: "literal", required: false, summary: "Sets speaking speed multiplier (`0.5` to `2.0`)." },
  { name: "duration", kind: "literal", required: false, summary: "Sets target duration in seconds." },
  { name: "target-lang", kind: "literal", required: false, summary: "Sets target language code (for example `en` or `zh`)." },
  { name: "quality-preset", kind: "literal", required: false, summary: "Sets integer quality preset (`0` to `5`; default `3`)." },
  { name: "similarity-enh", kind: "literal", required: false, values: ["true", "false"], summary: "Enables similarity enhancement (`true` or `false`)." },
  { name: "emo", kind: "literal", required: false, summary: "Sets optional JSON emotion vector string." },
  { name: "trim-silence", kind: "literal", required: false, values: ["true", "false"], summary: "Trims leading and trailing silence (`true` or `false`)." },
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
  declaration("tts", "Tts", noizAudioEndpoints.tts, [], {
    summary: "Synthesizes speech from Text using a Noiz voice ID.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the generated speech Artifact." },
      { name: "text", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the Text to synthesize (1 to 5,000 characters)." },
      { name: "voice-id", kind: "literal", required: true, summary: "Selects the Noiz voice ID to speak the text." },
      ...sharedTtsAttributes,
    ],
    ports: audioPort,
    example: '<noiz:Tts id="line" text={lineText} voice-id="95814add" model-id="v3" output-format="wav"/>',
    notes: [
      "The text must contain 1 to 5,000 characters, including non-whitespace text.",
      "The element is empty.",
    ],
  }),
  declaration("voice-clone", "VoiceClone", noizAudioEndpoints.voiceClone, ["voiceReference"], {
    summary: "Clones a voice from a reference audio sample and synthesizes Text with Noiz.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the generated speech Artifact." },
      { name: "text", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the Text to synthesize (1 to 5,000 characters)." },
      { name: "voice-reference", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the reference audio Resource (WAV, MP3, or M4A, at most 25 MB)." },
      ...sharedTtsAttributes,
      { name: "denoise", kind: "literal", required: false, values: ["true", "false"], summary: "Applies denoising to the reference audio before cloning (`true` or `false`)." },
    ],
    ports: audioPort,
    example: '<noiz:VoiceClone id="cloned" text={lineText} voice-reference={speakerSample.audio} denoise="true"/>',
    notes: [
      "Reference audio must be WAV, MP3, or M4A and at most 25 MB.",
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
  decodeNoizTtsSurface,
  decodeNoizVoiceCloneSurface,
} from "./surface.js";
export {
  NOIZ_COVER_SOURCE_AUDIO_MAX_BYTES,
  NOIZ_COVER_SOURCE_AUDIO_MEDIA_TYPES,
  NOIZ_VOICE_CLONE_AUDIO_MAX_BYTES,
  NOIZ_VOICE_CLONE_AUDIO_MEDIA_TYPES,
  validateNoizCoverSourceAudio,
  validateNoizTextToSoundInputs,
  validateNoizTtsInputs,
  validateNoizVoiceCloneAudio,
  validateNoizVoiceCloneInputs,
  validateNoizYue2CoverInputs,
  validateNoizYue2CoverRequest,
  validateNoizYue2MusicInputs,
  validateNoizYue2MusicRequest,
} from "./validation.js";
