import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";

import { isStreamingResourceStore } from "@hypit/resource-store";
import type { ResourceStore } from "@hypit/resource-store";

import type { MediaExecutionEnvironment } from "./execute.js";

export type CreateMediaExecutionEnvironmentOptions = {
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly sharedLibraryPath?: string;
  readonly processTimeoutMs?: number;
  readonly maxProbeOutputBytes?: number;
  readonly signal?: AbortSignal;
};

function positiveInteger(value: number, subject: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${subject} must be a positive integer`);
  }
  return value;
}

/**
 * Adapt one explicitly supplied ResourceStore and local media toolchain to the byte boundary used
 * by the media algorithms. This owns no Runtime, project directory or Provider selection.
 */
export function createMediaExecutionEnvironment(
  resources: ResourceStore,
  options: CreateMediaExecutionEnvironmentOptions = {},
): MediaExecutionEnvironment {
  const io = options.signal === undefined ? {} : { signal: options.signal };
  return {
    artifacts: {
      get: async (source) => await resources.get(source.resource, io),
      open: async (source) => isStreamingResourceStore(resources)
        ? await resources.open(source.resource, io)
        : await resources.get(source.resource, io).then((bytes) => bytes === undefined
          ? undefined
          : (async function* () { yield bytes; })()),
      put: async (bytes, mediaType) => await resources.put(bytes, mediaType, io),
      putFile: async (path, mediaType) => isStreamingResourceStore(resources)
        ? await resources.putStream(createReadStream(path, io), mediaType, io)
        : await resources.put(await readFile(path), mediaType, io),
    },
    ffmpegPath: options.ffmpegPath ?? "ffmpeg",
    ffprobePath: options.ffprobePath ?? "ffprobe",
    ...(options.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: options.sharedLibraryPath }),
    processTimeoutMs: positiveInteger(options.processTimeoutMs ?? 10 * 60_000, "processTimeoutMs"),
    maxProbeOutputBytes: positiveInteger(
      options.maxProbeOutputBytes ?? 256 * 1024 * 1024,
      "maxProbeOutputBytes",
    ),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
}
