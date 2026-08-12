import { mediaTypes } from "@narratage/media";
import { artifactTypes } from "@narratage/artifact";
import {
  executeExtractAudio,
  executeExtractFrame,
  executeInspectMedia,
  executeMuxProgramMedia,
  executeNormalizeMedia,
  executeProjectSpeechEvidenceAudio,
  executeRenderTimelineAudio,
  executeTransformMedia,
  mediaNeedHasContract,
  mediaOperationContracts,
} from "@narratage/media-execution";
import type { MediaExecutionEnvironment, MediaOperationResult } from "@narratage/media-execution";
import { mediaPipelineCapabilities } from "@narratage/media-pipeline";
import { canonicalize, digestOf } from "@narratage/protocol";
import { isStreamingArtifactStore } from "@narratage/runtime";
import { speechTypes } from "@narratage/speech";
import { defineEndpointPackage } from "@narratage/endpoint-kit";
import type { EndpointFulfillment, EndpointInvocationContext } from "@narratage/endpoint-kit";

export const localMediaProviderModuleRef = { name: "@narratage/provider-media-local", version: "1" } as const;
export const localMediaProviderImplementationDigest = digestOf("@narratage/provider-media-local/ffmpeg@1");

export type CreateLocalMediaProviderOptions = {
  readonly instance?: string;
  readonly authority?: string;
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
  return {
    value: result.value,
    metadata: result.metadata,
  };
}

/**
 * The Build's own ArtifactStore, and whatever ffmpeg this machine has. The
 * operations themselves live in `@narratage/media-execution`, shared with the
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
    label: "media.local",
    artifacts: {
      get: async (source) => await context.artifacts.get(source.digest),
      open: async (source) => isStreamingArtifactStore(context.artifacts)
        ? await context.artifacts.open(source.digest)
        : await context.artifacts.get(source.digest).then((bytes) => bytes === undefined
          ? undefined
          : (async function* () { yield bytes; })()),
      put: async (bytes, mediaType) => await context.artifacts.put(bytes, mediaType),
      putFile: async (path, mediaType) => isStreamingArtifactStore(context.artifacts)
        ? await context.artifacts.putStream(createReadStream(path), mediaType)
        : await context.artifacts.put(await readFile(path), mediaType),
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
    authority: config.authority ?? config.instance ?? "media.local",
    implementation: {
      locator: "@narratage/provider-media-local/ffmpeg",
      digest: localMediaProviderImplementationDigest,
    },
    configuration: canonicalize(common),
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.inspect,
        returns: mediaTypes.inspection,
        supports: (need) => mediaNeedHasContract(need.constraints, mediaOperationContracts.inspect),
        handler: operation(executeInspectMedia),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.normalize,
        returns: mediaTypes.synchronized,
        supports: (need) => mediaNeedHasContract(need.constraints, mediaOperationContracts.normalize),
        handler: operation(executeNormalizeMedia),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.transform,
        returns: artifactTypes.blob,
        supports: (need) => mediaNeedHasContract(need.constraints, mediaOperationContracts.transform),
        handler: operation(executeTransformMedia),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.extractAudio,
        returns: artifactTypes.blob,
        supports: (need) => mediaNeedHasContract(need.constraints, mediaOperationContracts.extractAudio),
        handler: operation(executeExtractAudio),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.extractFrame,
        returns: artifactTypes.blob,
        supports: (need) => mediaNeedHasContract(need.constraints, mediaOperationContracts.extractFrame),
        handler: operation(executeExtractFrame),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.projectSpeechEvidenceAudio,
        returns: speechTypes.evidenceAudio,
        supports: (need) =>
          mediaNeedHasContract(need.constraints, mediaOperationContracts.projectSpeechEvidenceAudio),
        handler: operation(executeProjectSpeechEvidenceAudio),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.renderAudio,
        returns: mediaTypes.timelineAudio,
        supports: (need) => mediaNeedHasContract(need.constraints, mediaOperationContracts.renderAudio),
        handler: operation(executeRenderTimelineAudio),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.mux,
        returns: mediaTypes.muxed,
        supports: (need) => mediaNeedHasContract(need.constraints, mediaOperationContracts.mux),
        handler: operation(executeMuxProgramMedia),
      },
    ],
  });
}
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
