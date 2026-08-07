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

Package loading is syntax-neutral. The local Runtime activates only locked deterministic Producer
and Validator facets; it neither depends on `@svml/text` nor installs any package Host facet.

Normal CLI projects may express the same assembly as closed data:

```json
{
  "format": "svml.runtime-config@1",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "services": [],
  "endpoints": [
    {
      "use": "@svml/provider-kie",
      "instance": "kie.project",
      "lane": "generation",
      "config": { "apiKeyEnv": "KIE_API_KEY", "defaultConcurrency": 2 }
    }
  ],
  "permissions": [
    "network:api.kie.ai",
    "network:kieai.redpandaai.co"
  ],
  "scheduling": { "maxConcurrency": 4, "lanes": { "generation": 2 } }
}
```

`runtimePackageLock` selects the physical packages allowed to contribute privileged Runtime Adapter
facets. The generic local Host verifies their complete package closure before activation; the video
CLI imports no Provider or Store implementation. Each exact `use` selects one adapter from that
verified inventory. The data file can choose instances, non-secret configuration, permissions and
concurrency, but it cannot embed code or secrets. Unknown adapters fail rather than being guessed.
`createProjectLocalRuntime(...)` remains the advanced trusted TypeScript embedding API.

`packageLock` and `runtimePackageLock` are deliberately different. The former closes deterministic
Producer/Validator code used by the author graph. The latter closes deployment code that may read
credentials, spawn processes or call networks. Source imports can affect neither. Loaded Endpoint
and Store implementation identities are rebound to actual physical package bytes and that package's
transitive dependency closure, rather than trusting a package's development label or unrelated
selected adapters.

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

`LocalRuntime.status(build)` exposes the verified durable Build archive, and
`LocalRuntime.readArtifact(digest)` is the generic byte-egress seam used by CLI `get`. They expose
Record and content identities, not private filesystem layout, so filesystem and S3 stores remain
interchangeable. Egress never determines whether a Build result is retained.

The filesystem ArtifactStore additionally implements optional streaming transfer and explicit
retention capabilities. `svml gc <runtime-profile.json>` is read-only by default; `--apply`
deletes only objects unreachable from every retained BuildState and Operation. This is Host
maintenance, never a Core transition or automatic cache policy. `svml doctor
<runtime-profile.json>` verifies package bytes, closed adapter configuration, required environment
credentials and local executable availability without running a Build.

`LocalRuntime.builds()` reads a separate Host `BuildCatalog`. With the default local assembly the
catalog shares the SQLite file physically; deployments with replacement execution Stores default
to `.svml/catalog.sqlite` or may select `catalogPath`/inject a `BuildCatalog`. This index is kept out
of Runtime service selection and Closure identity because changing a source path or display alias
must not invalidate or resume a different execution.

`LocalBuildRequest.attachments` is the explicit ingress from a trusted Host into the selected
ArtifactStore. Each attachment carries claimed `BlobRef` metadata plus bytes; Local Runtime copies
the bytes, stores them content-addressably and requires the Store's returned digest, size and media
type to match before any Core command can consume the reference. Attachments never enter
BuildState, SQLite or author source, and Runtime does not know whether they came from source assets,
an upload, a provided Candidate, Git or an API. Reusing a Build after restart needs no reattachment when the
chosen durable ArtifactStore still contains those digests.
