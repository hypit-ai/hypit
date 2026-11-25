import type { GenerationRequest, GenerationRequestDraft } from "@hypit/generation";
import type { BlobRef } from "@hypit/hypit/protocol";

export const NOIZ_COVER_SOURCE_AUDIO_MAX_BYTES = 100 * 1024 * 1024;
export const NOIZ_VOICE_CLONE_AUDIO_MAX_BYTES = 25 * 1024 * 1024;

export const NOIZ_VOICE_CLONE_AUDIO_MEDIA_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
] as const;

export const NOIZ_COVER_SOURCE_AUDIO_MEDIA_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/flac",
  "audio/x-flac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/ogg",
] as const;

function assertNonBlankPort(
  ports: GenerationRequestDraft["ports"],
  name: string,
  subject: string,
): void {
  const value = ports[name]?.[0];
  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error(`${subject} ${name} must contain non-whitespace text`);
  }
}

export function validateNoizCoverSourceAudio(artifact: BlobRef): void {
  if (artifact.size > NOIZ_COVER_SOURCE_AUDIO_MAX_BYTES) {
    throw new Error("Noiz YuE2 cover source audio must be 100 MB or smaller");
  }
  const normalized = artifact.mediaType.toLowerCase();
  if (!(NOIZ_COVER_SOURCE_AUDIO_MEDIA_TYPES as readonly string[]).includes(normalized)) {
    throw new Error(
      `Noiz YuE2 cover source audio must use one of: ${NOIZ_COVER_SOURCE_AUDIO_MEDIA_TYPES.join(", ")}`,
    );
  }
}

export function validateNoizTextToSoundInputs(request: GenerationRequestDraft): void {
  assertNonBlankPort(request.ports, "prompt", "Noiz text-to-sound");
}

export function validateNoizVoiceCloneAudio(artifact: BlobRef): void {
  if (artifact.size > NOIZ_VOICE_CLONE_AUDIO_MAX_BYTES) {
    throw new Error("Noiz voice clone reference audio must be 25 MB or smaller");
  }
  const normalized = artifact.mediaType.toLowerCase();
  if (!(NOIZ_VOICE_CLONE_AUDIO_MEDIA_TYPES as readonly string[]).includes(normalized)) {
    throw new Error(
      `Noiz voice clone reference audio must use one of: ${NOIZ_VOICE_CLONE_AUDIO_MEDIA_TYPES.join(", ")}`,
    );
  }
}

export function validateNoizTtsInputs(request: GenerationRequestDraft): void {
  for (const name of ["text", "voiceId", "targetLang", "emo"]) {
    assertNonBlankPort(request.ports, name, "Noiz TTS");
  }
}

export function validateNoizVoiceCloneInputs(request: GenerationRequestDraft): void {
  for (const name of ["text", "targetLang", "emo"]) {
    assertNonBlankPort(request.ports, name, "Noiz voice clone");
  }
  for (const value of request.ports.voiceReference ?? []) {
    if (typeof value === "object") {
      validateNoizVoiceCloneAudio(value.artifact);
    }
  }
}

export function validateNoizYue2MusicInputs(request: GenerationRequestDraft): void {
  const ports = request.ports;
  for (const name of ["prompt", "lyrics", "lyricsPrompt", "abc", "title", "tags", "negativeTags"]) {
    assertNonBlankPort(ports, name, "Noiz YuE2 music");
  }
  if (ports.abc !== undefined && ports.abc.length > 0 && ports.cot?.[0] === "off") {
    throw new Error("Noiz YuE2 music cannot combine abc with cot=off");
  }
}

export function validateNoizYue2MusicRequest(request: GenerationRequest): void {
  const hasLyrics = (request.ports.lyrics?.length ?? 0) > 0;
  const hasLyricsPrompt = (request.ports.lyricsPrompt?.length ?? 0) > 0;
  if (!hasLyrics && !hasLyricsPrompt) {
    throw new Error("Noiz YuE2 music requires either lyrics or lyricsPrompt");
  }
}

export function validateNoizYue2CoverInputs(request: GenerationRequestDraft): void {
  const ports = request.ports;
  for (const name of ["lyrics", "musicDescription", "style", "title"]) {
    assertNonBlankPort(ports, name, "Noiz YuE2 cover");
  }
  for (const value of ports.sourceAudio ?? []) {
    if (typeof value === "object") {
      validateNoizCoverSourceAudio(value.artifact);
    }
  }
}

export function validateNoizYue2CoverRequest(request: GenerationRequest): void {
  const hasDescription = (request.ports.musicDescription?.length ?? 0) > 0;
  const hasStyle = (request.ports.style?.length ?? 0) > 0;
  if (!hasDescription && !hasStyle) {
    throw new Error("Noiz YuE2 cover requires either musicDescription or style");
  }
}
