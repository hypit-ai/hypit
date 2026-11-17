import { extname } from "node:path";

const mediaTypesByExtension: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
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
