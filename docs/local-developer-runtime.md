# Local developer Runtime

Status: durable local execution implemented. Hosted multi-tenant orchestration and a persistent
remote WhisperX service remain deployment choices, not prerequisites.

## 1. Execution domain

A local project owns one explicit execution domain:

```text
build.svrun + main.svml
  -> self-described Run and Author compilation
  -> verified Core BuildState + durable Build dispatch ticket
  -> one or more fenced Workers
       -> deterministic component code
       -> local processes, remote APIs or recoverable jobs through Endpoints

framework facts    .svml/runtime.sqlite
artifact bytes     .svml/artifacts/ or another ArtifactStore
credentials        selected CredentialStores
external jobs      owned and reconciled by their exact Endpoints
```

The submitting terminal is not the executor. `build` stores the Build and ticket, ensures the
Runtime is up and returns. `--follow` observes only. A Worker claims a lease, regenerates ready Core
Commands from verified BuildState and admits Events under fencing. It never trusts a serialized
ready-Command queue.

## 2. Physical packages

| Package | Owns | Does not own |
|---|---|---|
| `@narratage/runtime` | environment-neutral dispatch, journal, lease, capacity, Store, Scheduler, Worker and credential ports | Node, SQLite, files, video |
| `@narratage/runtime-adapter` | locked Host facets constructing configured Endpoint and service packages | package discovery, author imports, Provider routing |
| `@narratage/store-sqlite` | BuildStore, OperationStore, BuildDispatchStore, RuntimeJournal and shared fenced capacity | serialized Core Commands, artifacts, credentials |
| `@narratage/artifact-store-fs` / `-s3` | content-addressed byte persistence | Build truth, cache policy, automatic reuse |
| `@narratage/credential-store-env` / `-keychain` | exact named CredentialRefs; Keychain also exposes bounded write/delete | author imports, unrelated-secret enumeration |
| `@narratage/local` | Node local Scheduler/Worker plus process lifecycle assembly | concrete Stores, author syntax, Provider APIs |
| `@narratage/endpoint-kit` | host-neutral recoverable Endpoint contract and package definition | Core traversal, vendor choice |
| `@narratage/provider-*` | one exact external implementation and its recovery/cancellation behavior | author parsing, hidden Candidate choice |

All Runtime pieces are ordinary locked packages. `@narratage/local` supplies no implicit SQLite,
filesystem or credential default. Replacing one Store or Endpoint does not change Core or author
packages.

## 3. Explicit declarative Profile

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtimeServices": [
    { "use": "@narratage/local", "instance": "execution" },
    { "use": "@narratage/store-sqlite", "instance": "state", "config": { "path": ".svml/runtime.sqlite" } },
    { "use": "@narratage/artifact-store-fs", "instance": "artifacts", "config": { "path": ".svml/artifacts" } },
    { "use": "@narratage/credential-store-env", "instance": "credentials.env", "config": {} }
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
      "credentials": ["credentials.env"]
    }
  },
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.personal",
      "lane": "generation",
      "config": {
        "apiKey": { "store": "env", "key": "KIE_API_KEY" },
        "defaultConcurrency": 2
      }
    }
  ],
  "permissions": [
    "environment:credentials",
    "filesystem:artifacts",
    "filesystem:state",
    "network:api.kie.ai",
    "network:kieai.redpandaai.co"
  ],
  "scheduling": {
    "maxConcurrency": 8,
    "lanes": { "generation": 2 }
  }
}
```

`runtimeServices` activates installed implementations. `services` selects every required role by
exact instance id. Nothing is selected because it happens to be the only installed implementation.
The credentials array may contain several Stores; each resolves only references addressed to its
own store name.

The two locks have different authority:

```bash
narratage lock-packages ./svml.packages.lock \
  --package @narratage/script --package @narratage/seedance --package-root .

narratage lock-packages ./svml.runtime-packages.lock \
  --package @narratage/local \
  --package @narratage/store-sqlite \
  --package @narratage/artifact-store-fs \
  --package @narratage/credential-store-env \
  --package @narratage/provider-kie \
  --package-root .
```

The Author lock activates deterministic Producers and validators. The Runtime lock activates
privileged service and Endpoint adapters. Source `<import>` cannot add Runtime authority.

## 4. Lifecycle and observation

```bash
narratage doctor ./svml.runtime.json
narratage runtime up ./svml.runtime.json
narratage runtime status ./svml.runtime.json
narratage runtime logs ./svml.runtime.json

narratage build ./build.svrun --runtime ./svml.runtime.json --build-id take-01
narratage status take-01 --runtime ./svml.runtime.json
narratage queue --runtime ./svml.runtime.json
narratage queue --runtime ./svml.runtime.json --watch
narratage operations take-01 --runtime ./svml.runtime.json
narratage operation <operation-id> --runtime ./svml.runtime.json

narratage runtime down ./svml.runtime.json
```

`runtime up` owns the detached Worker and declared external programs. `services up/status/down` is
the narrower expert command for those programs only. Stopping a follow/watch terminal does not stop
the Runtime or cancel a Build.

Shared capacity is persisted by DispatchStore, so two local Workers cannot exceed global or lane
limits. Lease generation fences a stale Worker after takeover. A crash-recovered Operation keeps
the same id and submission key; a completed journal entry is replayed without another remote
submission.

The detached process record binds an effective revision of the Runtime Profile and both package
locks it names. Editing a Profile or regenerating either lock never reuses a Worker assembled from
the old closure: status reports `stale`, and the next `runtime up` or `build` replaces that process
while leaving durable Builds available for recovery.

## 5. Cancellation facts

Cancellation is control over one existing realization, never graph recompilation:

1. a Build request closes admission before further Commands can start;
2. an Operation request addresses one exact attempt and Endpoint;
3. `accepted` means a remote stop request was acknowledged, not that work stopped;
4. reconciliation continues to `confirmed`, `unsupported`, `too-late` or natural completion;
5. late paid Artifacts remain retained but cannot enter a closed Build branch;
6. Runtime never selects another Candidate or Provider as fallback.

The Core BuildState remains the last verified semantic state. Dispatch and Operation Stores contain
the execution-control facts.

## 6. Archive and bytes

Every accepted Record in the demanded closure remains in BuildStore. Referenced bytes remain in
ArtifactStore; there is no `out` path that decides whether an intermediate is durable.

```bash
narratage builds --runtime ./svml.runtime.json
narratage inspect take-01 --runtime ./svml.runtime.json
narratage get take-01 --runtime ./svml.runtime.json --name final.video --to ./output.mp4
narratage gc ./svml.runtime.json
narratage gc ./svml.runtime.json --apply
```

`get` is egress, not persistence. `gc` is explicit reachability maintenance and dry-runs by
default. There is no automatic cache hit or hidden historical Candidate selection.

## 7. Replacement boundary

| Change | Replace | Unchanged |
|---|---|---|
| laptop files to S3 | ArtifactStore package and selection | Core, graph, Endpoint contracts |
| SQLite to a hosted database | the four state Store facets | Scheduler/Worker law and author source |
| environment secrets to Keychain/Vault | CredentialStore package and CredentialRefs | Endpoint capability |
| local HyperFrames to Lambda | HyperFrames Endpoint package | Composition and frame-addressable IR |
| local WhisperX to a warm remote service | WhisperX Endpoint package | authored speech/alignment graph |

Redis, SQS or a Provider's own queue may transport work, but none becomes Build truth. Hosted
tenant auth, billing and product dashboards belong to an embedding product rather than Core.
