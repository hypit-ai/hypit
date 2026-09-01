import { mediaTypes } from "@hypit/media";
import { artifactTypes } from "@hypit/artifact";
import {
  executeExtractAudio,
  executeExtractFrame,
  executeInspectMedia,
  executeMuxProgramMedia,
  executeNormalizeMedia,
  executeProjectSpeechEvidenceAudio,
  executeRenderTimelineAudio,
  executeRenderStillVideo,
  executeRenderMockImage,
  executeRenderMockVideo,
  executeRenderMockSilence,
  executeTransformMedia,
} from "@hypit/media-execution";
import type { MediaExecutionEnvironment, MediaOperationResult } from "@hypit/media-execution";
import { mediaPipelineCapabilities } from "@hypit/media-pipeline";
import { mockMediaCapabilities } from "@hypit/mock-media";
import { isStreamingResourceStore } from "@hypit/runtime";
import { speechTypes } from "@hypit/speech";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { EndpointFulfillment, EndpointInvocationContext } from "@hypit/endpoint-kit";

export const localMediaProviderModuleRef = { name: "@hypit/provider-media-local", version: "1" } as const;

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

function fulfillment(result: MediaOperationResult): EndpointFulfillment {
  return { value: result.value };
}

/**
 * The Build's own ResourceStore, and whatever ffmpeg this machine has. The
 * operations themselves live in `@hypit/media-execution`, shared with the
 * AWS Provider so one Need cannot mean two different transforms.
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
  ) => async (context: EndpointInvocationContext): Promise<EndpointFulfillment> =>
    fulfillment(await execute(environment(context), context.need.constraints as never));

  return defineEndpointPackage({
    module: localMediaProviderModuleRef,
    facet: "media",
    instance: config.instance ?? "media.local",
    pool: config.pool ?? config.instance ?? "media.local",
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.inspect,
        returns: mediaTypes.inspection,
        handler: operation(executeInspectMedia),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.normalize,
        returns: mediaTypes.synchronized,
        handler: operation(executeNormalizeMedia),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.transform,
        returns: artifactTypes.blob,
        handler: operation(executeTransformMedia),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.extractAudio,
        returns: artifactTypes.blob,
        handler: operation(executeExtractAudio),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.extractFrame,
        returns: artifactTypes.blob,
        handler: operation(executeExtractFrame),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.renderStill,
        returns: artifactTypes.blob,
        handler: operation(executeRenderStillVideo),
      },
      {
        lifecycle: "immediate" as const,
        capability: mockMediaCapabilities.image,
        returns: artifactTypes.blob,
        handler: operation(executeRenderMockImage),
      },
      {
        lifecycle: "immediate" as const,
        capability: mockMediaCapabilities.video,
        returns: artifactTypes.blob,
        handler: operation(executeRenderMockVideo),
      },
      {
        lifecycle: "immediate" as const,
        capability: mockMediaCapabilities.silence,
        returns: artifactTypes.blob,
        handler: operation(executeRenderMockSilence),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.projectSpeechEvidenceAudio,
        returns: speechTypes.evidenceAudio,
        handler: operation(executeProjectSpeechEvidenceAudio),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.renderAudio,
        returns: mediaTypes.timelineAudio,
        handler: operation(executeRenderTimelineAudio),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.mux,
        returns: mediaTypes.muxed,
        handler: operation(executeMuxProgramMedia),
      },
    ],
  });
}
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
