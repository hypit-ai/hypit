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
      "journal": "state.journal",
      "artifacts": "artifacts",
      "credentials": ["credentials"]
    }
  },
  "endpoints": [],
  "permissions": ["filesystem:state", "filesystem:artifacts", "process:keychain"],
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
remain in `OperationStore`; dispatch lease, heartbeat, admission and shared lane capacity remain in
`BuildDispatchStore`; operational history remains in `RuntimeJournal`.

Cancellation first closes admission. Existing Operations keep their own execution fact and a
separate cancellation-control fact. Provider acceptance is not reported as cancellation; unsupported
or too-late requests continue reconciling the same Operation and never select another Candidate.

## Boundaries

- `svml.packages.lock` closes deterministic Producer and Validator code used by the graph.
- `svml.runtime-packages.lock` closes privileged Runtime adapters that may access files, credentials,
  processes or networks.
- `.svml` and `.svrun` source can affect neither lock.
- loaded implementation identities are rebound to actual package and dependency bytes.
- Runtime credentials are resolved only from explicitly selected `CredentialStore` instances.

`LocalBuildRequest.attachments` is explicit Host ingress into the selected ArtifactStore. The Store's
returned digest, media type and size must equal the claimed `BlobRef` before Core execution. Artifact
retention is explicit maintenance: `narratage gc` previews by default and `--apply` removes only bytes
unreachable from retained Build and Operation facts.

`BuildCatalog` is optional Host presentation metadata. SQLite may expose one beside its execution
facets, but Local never creates a second hidden database or treats aliases and source paths as Build
truth.

Advanced embeddings may call `createProjectLocalRuntime()` with explicitly constructed service and
Endpoint packages. That TypeScript API has the same selection laws as the JSON Profile.
