# `@svml/local`

The trusted, zero-service developer distribution. It keeps Core and the authoritative Build
Scheduler in the current Node process while allowing every capability Endpoint to run in a different
place.

The convenience assembly uses:

- `@svml/store-sqlite` for durable Build and Operation facts;
- `@svml/artifact-store-fs` for content-addressed project bytes;
- optional replacement of Scheduler, BuildStore, OperationStore, ArtifactStore or CredentialStore
  by permission-checked Runtime service packages;
- an in-process, queue-free Scheduler whose ready work always comes from Core;
- an exact implementation package lock for deterministic component packages;
- separately selected external Endpoint packages.

Deterministic packages implement the host-neutral `@svml/component-kit` contract. `@svml/local`
adapts them to `ProducerRegistry`; the component never imports the Node Driver or receives Runtime
services.

```ts
export default await createProjectLocalRuntime({
  root: import.meta.dirname,
  packageLock: "./svml.packages.lock",
  runtimeServices: [createS3ArtifactStorePackage({
    bucket: "hypit-svml-artifacts",
    prefix: "development",
    region: "us-east-1",
  })],
  endpoints: [createKieProvider({ apiKey: credentialRef("env", "KIE_API_KEY") })],
  allowedPermissions: ["network:aws:s3", "network:api.kie.ai", "network:kieai.redpandaai.co"],
  scheduling: {
    maxConcurrency: 8,
    lanes: { "endpoint:kie.personal": 2 },
  },
});
```

The implementation lock may contain `generationComponent`, exact-model components and media
pipeline Producers without adding imports to this deployment source. Its digest is bound into the
BuildRequest, so a persisted Build cannot resume under another deterministic component closure.
The KIE Endpoint remains an independently selected privileged endpoint; swapping it changes an
Endpoint implementation and lane, not the `.svml` author document.
`createProjectLocalRuntime` infers a role when exactly one configured service package supplies it.
When several instances provide the same role, `runtimeSelection` must name the exact instance.
The same mechanism covers Postgres, S3, keychains and replacement Schedulers; none requires a
change to `@svml/local`. Advanced hosts may still call `createLocalRuntime` with raw ports.

`LocalBuildRequest.attachments` is the explicit ingress from a trusted Host into the selected
ArtifactStore. Each attachment carries claimed `BlobRef` metadata plus bytes; Local Runtime copies
the bytes, stores them content-addressably and requires the Store's returned digest, size and media
type to match before any Core command can consume the reference. Attachments never enter
BuildState, SQLite or author source, and Runtime does not know whether they came from source assets,
an upload, a provided Candidate, Git or an API. Reusing a Build after restart needs no reattachment when the
chosen durable ArtifactStore still contains those digests.
