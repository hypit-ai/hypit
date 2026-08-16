# `@narratage/artifact-store-s3`

S3 implementation of the environment-neutral Runtime `ArtifactStore` port.

Objects use deterministic keys:

```text
<prefix>/sha256/<first-two-hex>/<full-hex>
```

Writes compute the content digest once and store it at the corresponding key. The AWS client also
exposes the optional streaming and retention facets: streamed writes use multipart upload to an isolated
staging key followed by a server-side copy to the content-addressed key; `list`/`delete` support
explicit maintenance.

Those optional facets are attached only when an injected client supplies every operation needed to
implement them. A reduced test or MinIO client therefore advertises only the capabilities it can
actually perform instead of failing midway through a Build.

```ts
const artifacts = createS3ArtifactStorePackage({
  instance: "artifacts.team",
  bucket: "team-narratage-artifacts",
  prefix: "development",
  region: "us-east-1",
  expectedBucketOwner: "123456789012",
});

// A Runtime Profile creates this as a named infrastructure instance, then selects
// its `store` part for the `artifactStore` role.
```

The package exposes only its own `store` part. It never infers or installs the Scheduler, Worker,
state or Credential Store selected for the other Runtime roles.

The AWS SDK default credential chain or an explicitly injected trusted client owns AWS
authentication. Secret bytes never enter the package contribution or Runtime Closure; bucket,
prefix, region, endpoint and account constraint do.
