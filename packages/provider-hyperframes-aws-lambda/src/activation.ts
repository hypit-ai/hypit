import type { CanonicalValue } from "@narratage/protocol";
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-kit";
import type { RuntimeAdapterFactoryContext } from "@narratage/runtime-kit";

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
  "client" | "now"
>;

function optionalInteger(
  config: Record<string, CanonicalValue>,
  name: string,
): number | undefined {
  return runtimeConfigPositiveInteger(config[name], `HyperFrames ${name}`);
}

function providerOptions(context: RuntimeAdapterFactoryContext): RuntimeProviderOptions {
  if (context.pool === undefined) throw new Error("AWS Lambda HyperFrames Provider Pool is required");
  const config = runtimeConfigObject(context.config, "AWS Lambda HyperFrames");
  runtimeConfigExact(config, CONFIG_KEYS, "AWS Lambda HyperFrames");
  const stateMachineArn = runtimeConfigString(config.stateMachineArn, "HyperFrames stateMachineArn");
  if (stateMachineArn === undefined) throw new Error("AWS Lambda HyperFrames stateMachineArn is required");
  const machine = /^(arn:aws(?:-[a-z]+)*:states):([a-z0-9-]+):(\d{12}):stateMachine:([A-Za-z0-9_-]+)$/u
    .exec(stateMachineArn);
  if (machine === null) {
    throw new Error(`HyperFrames stateMachineArn must be an unqualified AWS Step Functions state-machine ARN; got ${stateMachineArn}`);
  }
  const bucketName = runtimeConfigString(config.bucketName, "HyperFrames bucketName");
  if (bucketName === undefined) throw new Error("AWS Lambda HyperFrames bucketName is required");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(bucketName)
    || bucketName.includes("..") || bucketName.includes(".-") || bucketName.includes("-.")
    || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(bucketName)) {
    throw new Error("HyperFrames bucketName is invalid");
  }
  const region = runtimeConfigString(config.region, "HyperFrames region");
  if (region !== undefined && region !== machine[2]) {
    throw new Error(`HyperFrames region ${region} differs from state machine region ${machine[2]}`);
  }
  const quality = runtimeConfigString(config.quality, "HyperFrames quality");
  if (quality !== undefined && quality !== "draft" && quality !== "standard" && quality !== "high") {
    throw new Error("HyperFrames quality is invalid");
  }
  const chunkSize = optionalInteger(config, "chunkSize");
  const maxParallelChunks = optionalInteger(config, "maxParallelChunks");
  const targetChunkFrames = optionalInteger(config, "targetChunkFrames");
  if (chunkSize !== undefined && targetChunkFrames !== undefined) {
    throw new Error("HyperFrames chunkSize and targetChunkFrames are mutually exclusive");
  }
  const defaultMemorySizeMb = optionalInteger(config, "defaultMemorySizeMb");
  const defaultConcurrency = optionalInteger(config, "defaultConcurrency");
  const pollIntervalMs = optionalInteger(config, "pollIntervalMs");
  const maxOperationMs = optionalInteger(config, "maxOperationMs");
  const maxRenderedBytes = optionalInteger(config, "maxRenderedBytes");
  const maxPollFailures = optionalInteger(config, "maxPollFailures");
  const maxAttempts = optionalInteger(config, "maxAttempts");
  return {
    instance: context.instance,
    pool: context.pool,
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
  activate(context) {
    return { endpoint: createAwsLambdaHyperframesProvider(providerOptions(context)) };
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [awsLambdaHyperframesRuntimeAdapter],
};

export default narratagePackage;
