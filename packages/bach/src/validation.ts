import type { GenerationRequestDraft } from "@hypit/generation";
import type { BlobRef } from "@hypit/hypit/protocol";

const REFERENCE_MEDIA_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/quicktime"],
  audio: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave", "audio/mpeg", "audio/mp3"],
};

export function validateBachMedia(artifact: BlobRef, reference: boolean): void {
  const role = artifact.mediaType.split("/")[0] as keyof typeof REFERENCE_MEDIA_TYPES;
  const limit = role === "video" ? 30 : role === "audio" ? 15 : 10;
  if (artifact.size > limit * 1024 * 1024) {
    throw new Error(`Bach ${role} media must be ${limit} MB or smaller`);
  }
  if (reference && !REFERENCE_MEDIA_TYPES[role]?.includes(artifact.mediaType)) {
    throw new Error(`Bach reference ${role} must use ${REFERENCE_MEDIA_TYPES[role]?.join(", ")}`);
  }
}

export function validateBachInputs(request: GenerationRequestDraft): void {
  const ports = request.ports;
  const prompt = ports.prompt?.[0];
  if (typeof prompt === "string" && prompt.trim().length === 0) {
    throw new Error("Bach prompt must contain non-whitespace text");
  }
  for (const name of ["firstFrame", "lastFrame", "referenceImage", "referenceVideo", "referenceAudio"]) {
    for (const value of ports[name] ?? []) {
      if (typeof value === "object") validateBachMedia(value.artifact, name.startsWith("reference"));
    }
  }
}
