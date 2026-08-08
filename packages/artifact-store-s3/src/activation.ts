import {
  createRuntimeServiceAdapterFacet,
  runtimeConfigBoolean,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { AwsS3ObjectClient } from "./client.js";
import { createS3ArtifactStorePackage } from "./store.js";

const s3ArtifactStoreRuntimeAdapter = createRuntimeServiceAdapterFacet({
  use: "@narratage/artifact-store-s3",
  create(context) {
    const config = runtimeConfigObject(context.config, "S3 ArtifactStore");
    runtimeConfigExact(config, [
      "bucket", "prefix", "expectedBucketOwner", "region", "endpoint", "forcePathStyle", "partSizeBytes",
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
      ...(runtimeConfigPositiveInteger(config.partSizeBytes, "S3 partSizeBytes") === undefined
        ? {} : { partSizeBytes: config.partSizeBytes as number }),
    });
  },
  /**
   * A bucket that cannot be reached, or is owned by another account, is a
   * deployment fact a Build cannot discover for itself without first writing
   * something. Say it here instead.
   */
  async doctor(context) {
    const config = runtimeConfigObject(context.config, "S3 ArtifactStore");
    const bucket = runtimeConfigString(config.bucket, "S3 bucket");
    if (bucket === undefined) return [];
    const client = new AwsS3ObjectClient({
      ...(runtimeConfigString(config.region, "S3 region") === undefined
        ? {} : { region: config.region as string }),
      ...(runtimeConfigString(config.endpoint, "S3 endpoint") === undefined
        ? {} : { endpoint: config.endpoint as string }),
      ...(runtimeConfigBoolean(config.forcePathStyle, "S3 forcePathStyle") === undefined
        ? {} : { forcePathStyle: config.forcePathStyle as boolean }),
    });
    const owner = runtimeConfigString(config.expectedBucketOwner, "S3 expectedBucketOwner");
    try {
      // A key that cannot exist: this answers "can I reach and read this
      // bucket as the expected owner" without depending on any object.
      await client.head({
        Bucket: bucket,
        Key: `${runtimeConfigString(config.prefix, "S3 prefix") ?? ""}/.svml-doctor-probe`.replace(/^\/+/u, ""),
        ...(owner === undefined ? {} : { ExpectedBucketOwner: owner }),
      });
      return [];
    } catch (error) {
      return [{
        severity: "error" as const,
        code: "ARTIFACT_STORE_UNREACHABLE",
        message: `S3 bucket ${bucket} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        subject: context.instance,
      }];
    }
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/artifact-store-s3",
  hostFacets: [s3ArtifactStoreRuntimeAdapter],
};

export default svmlPackage;
