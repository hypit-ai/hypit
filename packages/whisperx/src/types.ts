import type { SpeechEvidenceAudio } from "@hypit/speech";

/**
 * The language codes every alignment Endpoint can serve: the union of `DEFAULT_ALIGN_MODELS_TORCH`
 * and `DEFAULT_ALIGN_MODELS_HF` in `whisperx/alignment.py`, intersected across the WhisperX versions
 * the Endpoints run. The bundled service pins 3.8.6; the hosted `victor-upmeet/whisperx` route runs
 * 3.8.5, which lacks `id` and silently returns segments without word times for a code it cannot
 * align. Each code is passed unchanged to `load_align_model`, so a code missing here is one an
 * Endpoint cannot align rather than one Hypit declines to forward; add `id` once the hosted route
 * catches up.
 */
export const whisperXLanguages = [
  "ar", "ca", "cs", "da", "de", "el", "en", "es", "eu", "fa", "fi", "fr", "gl", "he", "hi", "hr", "hu",
  "it", "ja", "ka", "ko", "lv", "ml", "nl", "nn", "no", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "te",
  "tl", "tr", "uk", "ur", "vi", "zh",
] as const;

export type WhisperXLanguage = (typeof whisperXLanguages)[number];

export function isWhisperXLanguage(value: unknown): value is WhisperXLanguage {
  return typeof value === "string" && (whisperXLanguages as readonly string[]).includes(value);
}

export type WhisperXAlignmentRequest = {
  readonly audio: SpeechEvidenceAudio["artifact"];
  readonly sampleFrames: number;
  readonly language: WhisperXLanguage;
};
