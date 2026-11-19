import { extname } from "node:path";

const mediaTypesByExtension: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".opus": "audio/opus",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

/** Media type policy for files accepted by the local Media Executor. */
export function mediaTypeFromFile(path: string): string {
  const mediaType = mediaTypesByExtension[extname(path).toLowerCase()];
  if (mediaType === undefined) {
    throw new Error(`Cannot infer a supported media type for ${path}.`);
  }
  return mediaType;
}

/** Canonical filename suffix for a generated Media resource. */
export function mediaFileExtension(mediaType: string): string | undefined {
  const normalized = mediaType === "audio/x-wav" ? "audio/wav" : mediaType;
  return Object.entries(mediaTypesByExtension).find(([, type]) => type === normalized)?.[0].slice(1);
}
