import {
  buildResultConfigBoolean,
  buildResultConfigExact,
  buildResultConfigObject,
  buildResultConfigString,
  createBuildResultRepositoryHostFacet,
} from "@hypit/build-result-kit";

import { S3BuildResultRepository } from "./repository.js";

function repositoryFromConfig(configValue: Parameters<typeof buildResultConfigObject>[0]): S3BuildResultRepository {
  const config = buildResultConfigObject(configValue, "S3 Build Result Repository");
  const bucket = buildResultConfigString(config.bucket, "S3 bucket");
  if (bucket === undefined) throw new Error("S3 bucket is required");
  const prefix = buildResultConfigString(config.prefix, "S3 prefix");
  const expectedBucketOwner = buildResultConfigString(config.expectedBucketOwner, "S3 expectedBucketOwner");
  const region = buildResultConfigString(config.region, "S3 region");
  const endpoint = buildResultConfigString(config.endpoint, "S3 endpoint");
  const forcePathStyle = buildResultConfigBoolean(config.forcePathStyle, "S3 forcePathStyle");
  return new S3BuildResultRepository({
    bucket,
    ...(prefix === undefined ? {} : { prefix }),
    ...(expectedBucketOwner === undefined ? {} : { expectedBucketOwner }),
    ...(region === undefined ? {} : { region }),
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(forcePathStyle === undefined ? {} : { forcePathStyle }),
  });
}

const s3BuildResultRepository = createBuildResultRepositoryHostFacet({
  use: "@hypit/build-result-s3",
  validate(context) {
    const config = buildResultConfigObject(context.config, "S3 Build Result Repository");
    buildResultConfigExact(config, ["bucket", "prefix", "expectedBucketOwner", "region", "endpoint", "forcePathStyle"], "S3 Build Result Repository");
    if (buildResultConfigString(config.bucket, "S3 bucket") === undefined) throw new Error("S3 bucket is required");
    buildResultConfigString(config.prefix, "S3 prefix");
    buildResultConfigString(config.expectedBucketOwner, "S3 expectedBucketOwner");
    buildResultConfigString(config.region, "S3 region");
    buildResultConfigString(config.endpoint, "S3 endpoint");
    buildResultConfigBoolean(config.forcePathStyle, "S3 forcePathStyle");
  },
  open(context) {
    const repository = repositoryFromConfig(context.config);
    return { repository, close: async () => await repository.close() };
  },
  async doctor(context) {
    const repository = repositoryFromConfig(context.config);
    try {
      await repository.diagnose();
      return [];
    } catch (error) {
      const config = buildResultConfigObject(context.config, "S3 Build Result Repository");
      const bucket = buildResultConfigString(config.bucket, "S3 bucket") ?? "unknown";
      return [{
        severity: "error" as const,
        code: "RESULT_REPOSITORY_UNAVAILABLE",
        message: error instanceof Error ? error.message : String(error),
        subject: `s3://${bucket}`,
      }];
    } finally {
      await repository.close();
    }
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [s3BuildResultRepository],
};

export default hypitPackage;
