import { mediaTypes } from "@hypit/media";
import { blobTypes } from "@hypit/hypit/blob";
import {
  executeExtractAudio,
  executeExtractFrame,
  executeInspectMedia,
  executeMuxProgramMedia,
  executeProjectSpeechEvidenceAudio,
  executeRenderTimelineAudio,
  executeRenderStillVideo,
} from "./execute.js";
import type { MediaExecutionEnvironment, MediaOperationResult } from "./execute.js";
import { mediaOperationsCapabilities } from "@hypit/media-operations";
import { audioProgramCapabilities } from "@hypit/audio-program";
import { mediaDeliveryCapabilities } from "@hypit/media-delivery";
import { isStreamingResourceStore } from "@hypit/hypit/endpoint";
import { speechEvidenceCapabilities, speechEvidenceTypes } from "@hypit/speech-evidence";
import { defineEndpoint } from "@hypit/hypit/endpoint";
import type { EndpointInvocationContext } from "@hypit/hypit/endpoint";
import type { Value } from "@hypit/hypit/protocol";
import { supportsLocalAudioProgram, supportsLocalSpeechEvidenceAudio } from "./support.js";

export const localMediaProviderModuleRef = { name: "@hypit/media-local", version: "1" } as const;

export type CreateLocalMediaProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly defaultConcurrency?: number;
  readonly processTimeoutMs?: number;
  readonly maxProbeOutputBytes?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function fulfillment(result: MediaOperationResult): Value {
  return result.value;
}

/**
 * Execute media-operation Needs against the Build's ResourceStore and the
 * FFmpeg toolchain selected for this local Provider.
 */
export function createLocalMediaProvider(config: CreateLocalMediaProviderOptions) {
  const ffmpegPath = config.ffmpegPath ?? "ffmpeg";
  const ffprobePath = config.ffprobePath ?? "ffprobe";
  const processTimeoutMs = positiveInteger(config.processTimeoutMs ?? 10 * 60_000, "processTimeoutMs");
  const maxProbeOutputBytes = positiveInteger(config.maxProbeOutputBytes ?? 256 * 1024 * 1024,
    "maxProbeOutputBytes");
  const common = { ffmpegPath, ffprobePath, processTimeoutMs, maxProbeOutputBytes };
  const environment = (context: EndpointInvocationContext): MediaExecutionEnvironment => ({
    ...common,
    artifacts: {
      get: async (source) => await context.resources.get(source.resource),
      open: async (source) => isStreamingResourceStore(context.resources)
        ? await context.resources.open(source.resource)
        : await context.resources.get(source.resource).then((bytes) => bytes === undefined
          ? undefined
          : (async function* () { yield bytes; })()),
      put: async (bytes, mediaType) => await context.resources.put(bytes, mediaType),
      putFile: async (path, mediaType) => isStreamingResourceStore(context.resources)
        ? await context.resources.putStream(createReadStream(path), mediaType)
        : await context.resources.put(await readFile(path), mediaType),
    },
  });
  const operation = (
    execute: (env: MediaExecutionEnvironment, constraints: never) => Promise<MediaOperationResult>,
  ) => async (context: EndpointInvocationContext): Promise<Value> =>
    fulfillment(await execute(environment(context), context.request.constraints as never));

  return defineEndpoint({
    instance: config.instance ?? "media.local",
    pool: config.pool ?? config.instance ?? "media.local",
    pricing: { kind: "local" },
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [
      {
        lifecycle: "immediate" as const,
        transient: true,
        capability: mediaOperationsCapabilities.inspect,
        returns: mediaTypes.inspection,
        handler: operation(executeInspectMedia),
      },
      {
        lifecycle: "immediate" as const,
        transient: true,
        capability: mediaOperationsCapabilities.extractAudio,
        returns: blobTypes.blob,
        handler: operation(executeExtractAudio),
      },
      {
        lifecycle: "immediate" as const,
        transient: true,
        capability: mediaOperationsCapabilities.extractFrame,
        returns: blobTypes.blob,
        handler: operation(executeExtractFrame),
      },
      {
        lifecycle: "immediate" as const,
        transient: true,
        capability: mediaOperationsCapabilities.renderStill,
        returns: blobTypes.blob,
        handler: operation(executeRenderStillVideo),
      },
      {
        lifecycle: "immediate" as const,
        capability: speechEvidenceCapabilities.projectAudio,
        returns: speechEvidenceTypes.audio,
        supports: (request) => supportsLocalSpeechEvidenceAudio(request.constraints),
        handler: operation(executeProjectSpeechEvidenceAudio),
      },
      {
        lifecycle: "immediate" as const,
        capability: audioProgramCapabilities.render,
        returns: mediaTypes.timelineAudio,
        supports: (request) => supportsLocalAudioProgram(request.constraints),
        handler: operation(executeRenderTimelineAudio),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaDeliveryCapabilities.mux,
        returns: mediaTypes.muxed,
        handler: operation(executeMuxProgramMedia),
      },
    ],
  });
}
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
