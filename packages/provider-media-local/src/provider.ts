import { mediaCapabilities, mediaTypes } from "@hypit/media";
import { blobTypes } from "@hypit/hypit/generation/blob";
import {
  executeExtractAudio, executeExtractFrame, executeInspectMedia, executeMuxProgramMedia, executeRenderAudioProgram, } from "@hypit/media-local/execution";
import type { MediaExecutionEnvironment, MediaOperationResult } from "@hypit/media-local/execution";
import { audioProgramCapabilities } from "@hypit/audio-program";
import { mediaDeliveryCapabilities } from "@hypit/media-delivery";
import { speechEvidenceCapabilities, speechEvidenceTypes } from "@hypit/speech-evidence";
import { defineEndpoint } from "@hypit/hypit/endpoint";
import type { EndpointInvocationContext } from "@hypit/hypit/endpoint";
import type { Value } from "@hypit/hypit/value";
import { supportsLocalAudioProgram, supportsLocalSpeechEvidenceAudio } from "./support.js";
import { createMediaExecutionEnvironment } from "@hypit/media-local/execution";
import { executeProjectSpeechEvidenceAudio } from "./speech.js";

export const localMediaProviderModuleRef = { name: "@hypit/provider-media-local" } as const;

export type CreateLocalMediaProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly defaultConcurrency?: number;
  readonly processTimeoutMs?: number;
  readonly maxProbeOutputBytes?: number;
};

function fulfillment(result: MediaOperationResult): Value {
  return result.value;
}

/**
 * Execute media-operation Needs against the Build's ResourceStore and the
 * FFmpeg toolchain selected for this local Provider.
 */
export function createLocalMediaProvider(config: CreateLocalMediaProviderOptions) {
  const environment = (context: EndpointInvocationContext): MediaExecutionEnvironment =>
    createMediaExecutionEnvironment(context.resources, config);
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
        capability: mediaCapabilities.inspect,
        returns: mediaTypes.inspection,
        handler: operation(executeInspectMedia),
      },
      {
        lifecycle: "immediate" as const,
        transient: true,
        capability: mediaCapabilities.extractAudio,
        returns: blobTypes.blob,
        handler: operation(executeExtractAudio),
      },
      {
        lifecycle: "immediate" as const,
        transient: true,
        capability: mediaCapabilities.extractFrame,
        returns: blobTypes.blob,
        handler: operation(executeExtractFrame),
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
        returns: mediaTypes.renderedAudio,
        supports: (request) => supportsLocalAudioProgram(request.constraints),
        handler: operation(executeRenderAudioProgram),
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
