import {
  createRuntimeServiceAdapterFacet,
  runtimeConfigBoolean,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createS3ArtifactStorePackage } from "./store.js";

const s3ArtifactStoreRuntimeAdapter = createRuntimeServiceAdapterFacet({
  use: "@narratage/artifact-store-s3",
  create(context) {
    const config = runtimeConfigObject(context.config, "S3 ArtifactStore");
    runtimeConfigExact(config, [
      "bucket", "prefix", "expectedBucketOwner", "region", "endpoint", "forcePathStyle",
    ], "S3 ArtifactStore");
    const bucket = runtimeConfigString(config.bucket, "S3 bucket");
    if (bucket === undefined) throw new Error("S3 bucket is required");
    return createS3ArtifactStorePackage({
      instance: context.instance,
      bucket,
      ...(runtimeConfigString(config.prefix, "S3 prefix") === undefined
        ? {} : { prefix: config.prefix as string }),
      ...(runtimeConfigString(config.expectedBucketOwner, "S3 expectedBucketOwner") === undefined
        ? {} : { expectedBucketOwner: config.expectedBucketOwner as string }),
      ...(runtimeConfigString(config.region, "S3 region") === undefined
        ? {} : { region: config.region as string }),
      ...(runtimeConfigString(config.endpoint, "S3 endpoint") === undefined
        ? {} : { endpoint: config.endpoint as string }),
      ...(runtimeConfigBoolean(config.forcePathStyle, "S3 forcePathStyle") === undefined
        ? {} : { forcePathStyle: config.forcePathStyle as boolean }),
    });
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/artifact-store-s3",
  hostFacets: [s3ArtifactStoreRuntimeAdapter],
};

export default svmlPackage;
