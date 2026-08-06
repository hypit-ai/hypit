# `@svml/artifact-store-s3`

S3 implementation of the environment-neutral Runtime `ArtifactStore` port.

Objects use deterministic keys:

```text
<prefix>/sha256/<first-two-hex>/<full-hex>
```

Writes use `If-None-Match: *`; an already-existing object is downloaded and digest-verified rather
than trusted by key. Reads always recompute SHA-256. The current port transfers whole objects, so
multipart upload and ranged streaming remain a later ArtifactStore extension rather than hidden
behavior in this adapter.

```ts
const artifacts = createS3ArtifactStorePackage({
  instance: "artifacts.team",
  bucket: "hypit-svml-artifacts",
  prefix: "development",
  region: "us-east-1",
  expectedBucketOwner: "123456789012",
});

export default createProjectLocalRuntime({
  root: import.meta.dirname,
  runtimeServices: [artifacts],
  allowedPermissions: ["network:aws:s3"],
  endpoints: [],
});
```

The AWS SDK default credential chain or an explicitly injected trusted client owns AWS
authentication. Secret bytes never enter the package contribution or Runtime Closure; bucket,
prefix, region, endpoint and account constraint do.
