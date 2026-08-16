# `@narratage/artifact-store-s3`

S3 implementation of the Runtime `ArtifactStore` port. Objects use:

```text
<prefix>/sha256/<first-two-hex>/<full-hex>
```

The injected AWS client owns authentication. Multipart upload, streaming reads and retention are exposed
when that client supports the required S3 operations. The package stores no Build state or credentials.

The Runtime Profile selects its adapter; code embedding the Runtime directly may call
`createS3ArtifactStore()`.
