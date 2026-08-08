import type { CanonicalValue } from "@narratage/protocol";
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import type { RuntimeAdapterFactoryContext } from "@narratage/runtime-adapter";

import { createAwsLambdaHyperframesProvider } from "./provider.js";
import type {
  CreateAwsLambdaHyperframesProviderOptions,
  HyperframesLambdaQuality,
} from "./provider.js";

const CONFIG_KEYS = [
  "stateMachineArn", "bucketName", "region", "quality", "chunkSize", "maxParallelChunks",
  "targetChunkFrames", "defaultMemorySizeMb", "defaultConcurrency", "pollIntervalMs",
  "maxOperationMs", "maxRenderedBytes", "maxPollFailures", "maxAttempts",
] as const;

type RuntimeProviderOptions = Omit<
  CreateAwsLambdaHyperframesProviderOptions,
  "client" | "clientImplementationDigest" | "now"
>;

function optionalInteger(
  config: Record<string, CanonicalValue>,
  name: string,
): number | undefined {
  return runtimeConfigPositiveInteger(config[name], `HyperFrames ${name}`);
}

function providerOptions(context: RuntimeAdapterFactoryContext): RuntimeProviderOptions {
  const config = runtimeConfigObject(context.config, "AWS Lambda HyperFrames");
  runtimeConfigExact(config, CONFIG_KEYS, "AWS Lambda HyperFrames");
  const stateMachineArn = runtimeConfigString(config.stateMachineArn, "HyperFrames stateMachineArn");
  if (stateMachineArn === undefined) throw new Error("AWS Lambda HyperFrames stateMachineArn is required");
  const bucketName = runtimeConfigString(config.bucketName, "HyperFrames bucketName");
  if (bucketName === undefined) throw new Error("AWS Lambda HyperFrames bucketName is required");
  const region = runtimeConfigString(config.region, "HyperFrames region");
  const quality = runtimeConfigString(config.quality, "HyperFrames quality");
  if (quality !== undefined && quality !== "draft" && quality !== "standard" && quality !== "high") {
    throw new Error("HyperFrames quality is invalid");
  }
  const chunkSize = optionalInteger(config, "chunkSize");
  const maxParallelChunks = optionalInteger(config, "maxParallelChunks");
  const targetChunkFrames = optionalInteger(config, "targetChunkFrames");
  const defaultMemorySizeMb = optionalInteger(config, "defaultMemorySizeMb");
  const defaultConcurrency = optionalInteger(config, "defaultConcurrency");
  const pollIntervalMs = optionalInteger(config, "pollIntervalMs");
  const maxOperationMs = optionalInteger(config, "maxOperationMs");
  const maxRenderedBytes = optionalInteger(config, "maxRenderedBytes");
  const maxPollFailures = optionalInteger(config, "maxPollFailures");
  const maxAttempts = optionalInteger(config, "maxAttempts");
  return {
    instance: context.instance,
    ...(context.lane === undefined ? {} : { lane: context.lane }),
    stateMachineArn,
    bucketName,
    ...(region === undefined ? {} : { region }),
    ...(quality === undefined ? {} : { quality: quality as HyperframesLambdaQuality }),
    ...(chunkSize === undefined ? {} : { chunkSize }),
    ...(maxParallelChunks === undefined ? {} : { maxParallelChunks }),
    ...(targetChunkFrames === undefined ? {} : { targetChunkFrames }),
    ...(defaultMemorySizeMb === undefined ? {} : { defaultMemorySizeMb }),
    ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
    ...(maxOperationMs === undefined ? {} : { maxOperationMs }),
    ...(maxRenderedBytes === undefined ? {} : { maxRenderedBytes }),
    ...(maxPollFailures === undefined ? {} : { maxPollFailures }),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
  };
}

const awsLambdaHyperframesRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-hyperframes-aws-lambda",
  create(context) {
    return createAwsLambdaHyperframesProvider(providerOptions(context));
  },
  doctor(context) {
    try {
      const options = providerOptions(context);
      createAwsLambdaHyperframesProvider({
        ...options,
        client: {
          deploySite: async () => { throw new Error("doctor does not deploy"); },
          render: async () => { throw new Error("doctor does not render"); },
          progress: async () => { throw new Error("doctor does not poll"); },
          stop: async () => { throw new Error("doctor does not cancel"); },
          openOutput: async () => { throw new Error("doctor does not download"); },
        },
        clientImplementationDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      });
      return [];
    } catch (error) {
      return [{
        severity: "error" as const,
        code: "ENDPOINT_TARGET_INVALID",
        message: error instanceof Error ? error.message : String(error),
        subject: context.instance,
      }];
    }
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-hyperframes-aws-lambda",
  hostFacets: [awsLambdaHyperframesRuntimeAdapter],
};

export default svmlPackage;
