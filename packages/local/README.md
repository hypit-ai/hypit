# `@narratage/local`

Node-hosted assembly and process lifecycle for an explicitly selected Runtime. It is not a bundle of
default Stores and it contains no authoring, video, Provider or package-routing policy.

`@narratage/local` contributes two replaceable Runtime services:

- `scheduler`: regenerates ready Core commands from verified BuildState;
- `worker`: claims durable Build dispatches, maintains fenced leases and advances them.

A Runtime Profile must separately select every service:

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtimeServices": [
    { "use": "@narratage/local", "instance": "execution" },
    { "use": "@narratage/store-sqlite", "instance": "state", "config": { "path": ".svml/runtime.sqlite" } },
    { "use": "@narratage/artifact-store-fs", "instance": "artifacts", "config": { "path": ".svml/artifacts" } },
    { "use": "@narratage/credential-store-keychain", "instance": "credentials", "config": {} }
  ],
  "services": {
    "scheduler": "execution.scheduler",
    "worker": "execution.worker",
    "stores": {
      "build": "state.builds",
      "operations": "state.operations",
      "dispatch": "state.dispatch",
      "artifacts": "artifacts",
      "credentials": ["credentials"]
    }
  },
  "endpoints": [],
  "scheduling": { "maxConcurrency": 4 }
}
```

No role is inferred by uniqueness. An empty or incomplete selection fails before work starts.
`@narratage/local` has no production dependency on SQLite, the filesystem ArtifactStore, an
environment credential source, or any Provider.

## Execution law

`LocalRuntime.build()` stages source attachments, creates verified BuildState and one durable
dispatch, then returns. A Worker process owns execution. `--follow` polls that dispatch and never
becomes its executor; interrupting the observer does not cancel the Build.

The Worker stores no serialized Core command. After every restart it reopens verified BuildState and
asks the selected Scheduler to regenerate the current commands. Recoverable Provider checkpoints
remain in `OperationStore`; dispatch lease, heartbeat, admission and shared resource capacity remain in
`BuildDispatchStore`. Queue and cancellation inspection read those authoritative stores directly.

Cancellation is Build-scoped. A queued Build that no Worker has claimed becomes terminal atomically;
an active Build first closes admission. Existing Operations keep their own execution fact and a
separate cancellation-control fact. Provider acceptance is not reported as cancellation; unsupported
or too-late requests continue reconciling the same Operation and never select another Candidate.
Endpoint checkpoint recovery continues the same in-flight task after Worker failure; it is not a way
to reopen a terminal Build.

## Boundaries

- `svml.packages.lock` closes deterministic Producer and Validator code used by the graph.
- `svml.runtime-packages.lock` closes privileged Runtime adapters that may access files, credentials,
  processes or networks.
- `.svml` and `.svrun` source can affect neither lock.
- loaded implementation identities are rebound to actual package and dependency bytes.
- Runtime credentials are resolved only from explicitly selected `CredentialStore` instances.

`LocalBuildRequest.attachments` is explicit Host ingress into the selected ArtifactStore. The Store's
returned digest, media type and size must equal the claimed `BlobRef` before Core execution. Artifact
attachments are reopenable streams; a streaming Store receives them without a whole-file compiler or
Runtime buffer. A non-streaming replacement Store remains valid but explicitly pays the buffering cost.
Operation progress is a small generic `{ phase, completed?, total?, unit? }` fact owned by the
Endpoint, independent from its opaque recovery checkpoint.
Artifact retention is explicit maintenance: `narratage gc` previews by default and `--apply` removes only bytes
unreachable from retained Build and Operation facts.

Worker and managed-service lifecycle changes are serialized by profile-scoped filesystem locks. Two
simultaneous `build` commands therefore reuse one detached Worker rather than launching orphan
processes. CLI log reads are tail-bounded and oversized logs rotate on the next managed start.

`BuildCatalog` is optional Host presentation metadata. SQLite may expose one beside its execution
facets, but Local never creates a second hidden database or treats aliases and source paths as Build
truth.

Advanced embeddings may call `createProjectLocalRuntime()` with explicitly constructed service and
Endpoint packages. That TypeScript API has the same selection laws as the JSON Profile.
