import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createAwsLambdaMediaProvider } from "./provider.js";

const awsLambdaMediaRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-media-aws-lambda",
  create(context) {
    const config = runtimeConfigObject(context.config, "AWS Lambda media");
    runtimeConfigExact(config, [
      "functionArn", "bucket", "prefix", "region", "defaultConcurrency",
    ], "AWS Lambda media");
    const functionArn = runtimeConfigString(config.functionArn, "AWS Lambda functionArn");
    if (functionArn === undefined) throw new Error("AWS Lambda functionArn is required");
    const bucket = runtimeConfigString(config.bucket, "AWS Lambda bucket");
    if (bucket === undefined) {
      throw new Error(
        "AWS Lambda media bucket is required: the function reads sources and writes results in the"
        + " ArtifactStore's own bucket, because a synchronous invocation cannot carry media",
      );
    }
    return createAwsLambdaMediaProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      functionArn,
      bucket,
      ...(runtimeConfigString(config.prefix, "AWS Lambda prefix") === undefined
        ? {} : { prefix: config.prefix as string }),
      ...(runtimeConfigString(config.region, "AWS Lambda region") === undefined
        ? {} : { region: config.region as string }),
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "AWS Lambda defaultConcurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
    });
  },
  /**
   * The ARN shape is checked without calling AWS, so `doctor` answers offline.
   * Whether the function exists and which image it carries is a live question,
   * asked by `narratage services status` against a configured deployment.
   */
  doctor(context) {
    const config = runtimeConfigObject(context.config, "AWS Lambda media");
    const functionArn = runtimeConfigString(config.functionArn, "AWS Lambda functionArn");
    if (functionArn === undefined) return [];
    try {
      createAwsLambdaMediaProvider({
        functionArn,
        bucket: runtimeConfigString(config.bucket, "AWS Lambda bucket") ?? "unset",
        invoker: { invoke: async () => ({}) },
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
  name: "@narratage/provider-media-aws-lambda",
  hostFacets: [awsLambdaMediaRuntimeAdapter],
};

export default svmlPackage;
