# `@hypit/provider-media-aws-lambda`

AWS Lambda Endpoint package for the nine exact capabilities declared by
`@hypit/media-pipeline` and implemented by `@hypit/media-execution`.

The Provider invokes one versioned or aliased Lambda ARN synchronously. Source and result bytes stay
in the configured S3 ArtifactStore bucket; invocation carries only bounded JSON and content-addressed
references. Every reported result is checked through the Build's ArtifactStore before it can fulfill
a Need.

Runtime configuration must provide:

- a qualified `functionArn`, never an unversioned mutable function name;
- the same `bucket` used by the selected S3 ArtifactStore;
- optional `prefix`, `region` and `defaultConcurrency`.

The package requests `network:aws:lambda` and `network:aws:s3`. It contains no deployment
credentials, author syntax or media policy fork. The local and Lambda Providers consume the same
public contracts and shared execution body.
