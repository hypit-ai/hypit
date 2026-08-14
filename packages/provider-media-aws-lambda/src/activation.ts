import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import type { RuntimeAdapterFactoryContext } from "@narratage/runtime-adapter";

import { createAwsLambdaMediaProvider } from "./provider.js";
import type { CreateAwsLambdaMediaProviderOptions } from "./provider.js";

const QUALIFIED_ARN = /^arn:aws(?:-[a-z]+)*:lambda:([a-z0-9-]+):\d{12}:function:[A-Za-z0-9-_]+:([A-Za-z0-9-_]+)$/u;

function providerOptions(context: RuntimeAdapterFactoryContext): CreateAwsLambdaMediaProviderOptions {
  if (context.authority === undefined) throw new Error("AWS Lambda media Provider Authority is required");
  const config = runtimeConfigObject(context.config, "AWS Lambda media");
  runtimeConfigExact(config, [
    "functionArn", "bucket", "prefix", "region", "defaultConcurrency",
  ], "AWS Lambda media");
  const functionArn = runtimeConfigString(config.functionArn, "AWS Lambda functionArn");
  if (functionArn === undefined) throw new Error("AWS Lambda functionArn is required");
  const arn = QUALIFIED_ARN.exec(functionArn);
  if (arn === null) {
    throw new Error(
      `Lambda functionArn must name a version or alias, as arn:aws:lambda:<region>:<account>:function:<name>:<version>; got ${functionArn}`,
    );
  }
  const bucket = runtimeConfigString(config.bucket, "AWS Lambda bucket");
  if (bucket === undefined) {
    throw new Error(
      "AWS Lambda media bucket is required: the function reads sources and writes results in the"
      + " ArtifactStore's own bucket, because a synchronous invocation cannot carry media",
    );
  }
  const region = runtimeConfigString(config.region, "AWS Lambda region");
  if (region !== undefined && region !== arn[1]) {
    throw new Error(`Lambda region ${region} differs from the region in its ARN (${arn[1]})`);
  }
  const prefix = runtimeConfigString(config.prefix, "AWS Lambda prefix");
  const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "AWS Lambda defaultConcurrency");
  return {
    instance: context.instance,
    authority: context.authority,
    functionArn,
    bucket,
    ...(prefix === undefined ? {} : { prefix }),
    ...(region === undefined ? {} : { region }),
    ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
  };
}

const awsLambdaMediaRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-media-aws-lambda",
  activate(context) {
    return { endpoint: createAwsLambdaMediaProvider(providerOptions(context)) };
  },
  // ARN, region and bucket relationships are closed configuration facts. Live
  // Lambda availability remains an operation-time fact until a dedicated
  // read-only deployment probe is added.
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  hostFacets: [awsLambdaMediaRuntimeAdapter],
};

export default svmlPackage;
