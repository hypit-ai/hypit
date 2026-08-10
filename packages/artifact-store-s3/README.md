# `@narratage/artifact-store-s3`

S3 implementation of the environment-neutral Runtime `ArtifactStore` port.

Objects use deterministic keys:

```text
<prefix>/sha256/<first-two-hex>/<full-hex>
```

Writes use `If-None-Match: *`; an already-existing object is downloaded and digest-verified rather
than trusted by key. Whole-object reads always recompute SHA-256. The AWS client also exposes the
optional streaming and retention facets: streamed writes use multipart upload to an isolated
staging key followed by a server-side copy to the content-addressed key; streamed reads verify the
digest before their iterator completes; `list`/`delete` support explicit reachability GC.

Those optional facets are attached only when an injected client supplies every operation needed to
implement them. A reduced test or MinIO client therefore advertises only the capabilities it can
actually perform instead of failing midway through a Build.

```ts
const artifacts = createS3ArtifactStorePackage({
  instance: "artifacts.team",
  bucket: "team-svml-artifacts",
  prefix: "development",
  region: "us-east-1",
  expectedBucketOwner: "123456789012",
});

// Supply this package beside explicit Scheduler/Worker, state and CredentialStore packages,
// then select `artifacts.team` as runtimeSelection.stores.artifacts.
```

`createProjectLocalRuntime()` never infers the other required services from this package.

The AWS SDK default credential chain or an explicitly injected trusted client owns AWS
authentication. Secret bytes never enter the package contribution or Runtime Closure; bucket,
prefix, region, endpoint and account constraint do.
