---
title: Runtime Profile
description: Configuring where Builds execute, diagnostics and Build archive.
---

# Runtime Profile

The Runtime Profile declares *where* a frozen Build executes: the Scheduler and Worker, all durable
Stores, Endpoints, credentials and concurrency. It is deployment configuration, not
creative content—it never enters Author or Run graph identity.

Two forms are supported:

| Form | File | Use case |
|---|---|---|
| Declarative JSON | `svml.runtime.json` | Standard path |
| Executable TypeScript | `svml.runtime.ts` | Advanced embedding API |

## Declarative JSON

```json
{
  "format": "svml.runtime-config@1",
  "packageLock": "./svml.packages.lock",
  "runtimePackageLock": "./svml.runtime-packages.lock",
  "runtimeServices": [
    { "use": "@narratage/local", "instance": "execution" },
    { "use": "@narratage/store-sqlite", "instance": "state", "config": { "path": ".svml/runtime.sqlite" } },
    { "use": "@narratage/artifact-store-fs", "instance": "artifacts", "config": { "path": ".svml/artifacts" } },
    { "use": "@narratage/credential-store-keychain", "instance": "credentials.keychain", "config": { "service": "narratage" } }
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
      "credentials": ["credentials.keychain"]
    }
  },
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.production",
      "config": {
        "apiKey": { "store": "keychain", "key": "kie.api-key" },
        "defaultConcurrency": 2
      }
    },
    {
      "use": "@narratage/provider-media-local",
      "instance": "media.local",
      "config": { "defaultConcurrency": 2 }
    },
    {
      "use": "@narratage/provider-whisperx-local",
      "instance": "whisperx.local",
      "config": { "defaultConcurrency": 1 }
    },
    {
      "use": "@narratage/provider-google-vertex",
      "instance": "vertex.local",
      "config": {
        "projectEnv": "GOOGLE_CLOUD_PROJECT",
        "credentials": { "store": "keychain", "key": "google.vertex-json" },
        "defaultConcurrency": 1
      }
    },
    {
      "use": "@narratage/provider-hyperframes-local",
      "instance": "hyperframes.local",
      "config": { "workers": 2, "quality": "standard", "defaultConcurrency": 1 }
    }
  ],
  "scheduling": { "maxConcurrency": 4 }
}
```

### Endpoint fields

| Field | Meaning |
|---|---|
| `use` | Adapter name, resolved from `runtimePackageLock` |
| `instance` | Unique identifier for this Endpoint instance |
| `authority` | Optional shared account/compute-pool identity; omitted instances use their own `instance` id |
| `config` | Adapter-specific non-secret configuration, CredentialRefs, concurrency and timeouts |

Credentials are addressed as `{ "store": "…", "key": "…" }`; secret bytes never enter the
Profile. More than one selected CredentialStore may coexist, and each answers only for its own
store name.

### Runtime service fields

`runtimeServices` activates installed service adapters. `services` selects every required role by
its exact instance id: Scheduler, Worker, BuildStore, OperationStore, DispatchStore,
RuntimeJournal, ArtifactStore and one or more CredentialStores. No role is inferred from package
presence or filled by `@narratage/local`.

### Filesystem fields

| Field | Meaning |
|---|---|
| `root` | Runtime data root. State databases, Artifact storage and relative lock paths are based here. Defaults to the Profile directory. |
| `packageRoot` | Optional Host override for the `node_modules` supplying both locks. The official CLI defaults to its own installation; the direct local API defaults to `root`. |
| `packageLock` | Locked deterministic implementation packages, resolved relative to `root`. |
| `runtimePackageLock` | Locked privileged Runtime adapters, resolved relative to `root`. |

`root` and `packageRoot` are deliberately separate. An external video project can retain all data
in its own directory while loading verified executable packages from one Narratage installation.
Neither value enters Author or Run graph identity.

### Scheduling

`maxConcurrency` caps admitted Operations across all Workers sharing the DispatchStore. Provider
packages contribute an Authority resource and an exact capability Route resource; the Store
acquires both atomically. Optional `resources` overrides address those opaque ids. Capacity tickets
are durable and fenced by the Build lease rather than process-local counters.

### Trust boundary

Runtime packages currently execute as trusted local code. Narratage does not pretend that a string
allowlist can restrict Node code that shares the Host process. Arbitrary community runtime packages
must wait for a real process/Wasm isolation boundary with enforceable filesystem, network, process
and resource controls.

## Executable TypeScript

For advanced embedding, construct the Runtime programmatically:

```typescript
import { join } from "node:path";
import { createFileArtifactStorePackage } from "@narratage/artifact-store-fs";
import { createEnvironmentCredentialStorePackage } from "@narratage/credential-store-env";
import { createLocalExecutionPackage, createProjectLocalRuntime } from "@narratage/local";
import { createKieProvider } from "@narratage/provider-kie";
import { createLocalMediaProvider } from "@narratage/provider-media-local";
import { credentialRef } from "@narratage/runtime";
import { createSqliteRuntimeServicePackage } from "@narratage/store-sqlite";

export default async function createRuntime() {
  const root = import.meta.dirname;
  const execution = createLocalExecutionPackage("execution");
  const state = createSqliteRuntimeServicePackage({
    path: join(root, ".svml/runtime.sqlite"),
    name: "state",
    buildInstance: "state.builds",
    operationInstance: "state.operations",
    dispatchInstance: "state.dispatch",
    journalInstance: "state.journal",
  });
  const artifacts = createFileArtifactStorePackage({ root: join(root, ".svml/artifacts"), instance: "artifacts" });
  const credentials = createEnvironmentCredentialStorePackage({ instance: "credentials.env" });
  const endpoints = [
    createKieProvider({
      instance: "kie.prod",
      authority: "kie.prod",
      apiKey: credentialRef("env", "KIE_API_KEY"),
      defaultConcurrency: 2,
    }),
    createLocalMediaProvider({
      instance: "media.prod",
      authority: "media.prod",
      defaultConcurrency: 2,
    }),
  ];

  return await createProjectLocalRuntime({
    root,
    packageLock: "./svml.packages.lock",
    runtimeServices: [execution, state, artifacts, credentials],
    runtimeSelection: {
      scheduler: "execution.scheduler",
      worker: "execution.worker",
      stores: {
        build: "state.builds",
        operations: "state.operations",
        dispatch: "state.dispatch",
        journal: "state.journal",
        artifacts: "artifacts",
        credentials: ["credentials.env"],
      },
    },
    endpoints,
    scheduling: {
      maxConcurrency: 4,
    },
  });
}
```

Pass either form to `--runtime`:

```bash
node --run narratage -- build build.svrun --runtime ./svml.runtime.json
node --run narratage -- build build.svrun --runtime ./svml.runtime.ts
```

Both forms describe the same explicit assembly. The TypeScript form is trusted embedding code, not
a source-language escape hatch or a place for author intent.

## Diagnostics

### doctor

Checks the Runtime Profile without running a Build or making paid requests:

```bash
node --run narratage -- doctor svml.runtime.json
```

Validates:
- Package locks exist and are readable
- Adapter byte digests match
- Configuration keys are valid for each adapter
- Referenced credentials resolve from their selected stores
- Required executables (ffmpeg, ffprobe, chrome) are found
- Declared external services are reachable and match the selected profile

Runtime Adapter Host ABI `@1` gives each Endpoint one pure activation declaration. `doctor` evaluates
that declaration and reads credentials and prerequisites from the resulting Endpoint
package; there is no diagnostic-only credential mirror. Activation may construct handlers but may
not resolve credentials, access the network, start a process or mutate durable state. `doctor` never
constructs a Scheduler, Worker, Build Store or author package, starts a service, writes Runtime state
or submits work. It opens only the CredentialStore adapters selected by the Profile, then closes
them, and may run explicitly declared bounded read-only probes.

### Credential control is not Runtime execution

`auth status|login|logout <endpoint-instance>` constructs only that exact Endpoint declaration and
the CredentialStores selected by the Profile. It does not open SQLite, start a Worker, load author
packages or construct unrelated Providers. Logging into KIE therefore cannot be blocked by an old
Build database or an unrelated Vertex configuration.

## Runtime lifecycle

```bash
node --run narratage -- runtime up svml.runtime.json
node --run narratage -- runtime status svml.runtime.json
node --run narratage -- runtime logs svml.runtime.json
node --run narratage -- runtime down svml.runtime.json
```

`runtime up` owns the detached Worker plus declared external programs. `services` remains a narrow
expert command for those external programs only. A Build submission ensures the Runtime is up, but
the Build terminal never owns execution.

During the pre-release period SQLite execution schemas are intentionally not migrated in place.
If a development database predates the selected Store implementation, the CLI names the exact path
and asks the operator to archive that database (including its WAL companions) or select a new path.
Artifact bytes live in the independently selected ArtifactStore and are never deleted by this
refusal.

### gc (garbage collection)

```bash
node --run narratage -- gc svml.runtime.json            # dry-run
node --run narratage -- gc svml.runtime.json --apply     # delete unreachable Artifacts
```

Walks every retained BuildState and Operation, computes reachable Artifact digests, and reports
(or deletes) unreachable orphans.

## Build archive and inspection

Every Build archives all accepted Records and referenced Artifacts durably, independent of any
`--to` destination path.

### List Builds

```bash
node --run narratage -- builds --runtime svml.runtime.json
```

### Inspect

```bash
node --run narratage -- inspect <build-id> --runtime svml.runtime.json
```

Shows target bindings, demanded Logical Outputs, every accepted Record and Operation status.

### Retrieve Records

```bash
# By source output name
node --run narratage -- get <build-id> --runtime svml.runtime.json \
  --name final.video --to output.mp4

# By Record id
node --run narratage -- get <build-id> --runtime svml.runtime.json \
  --record <record-id> --to output.json

# By Logical Output id
node --run narratage -- get <build-id> --runtime svml.runtime.json \
  --output <output-id>

# By Artifact digest
node --run narratage -- get <build-id> --runtime svml.runtime.json \
  --artifact <sha256:...> --to file.bin
```

`--name` uses the source output alias from the Host-only Build Catalog. The Catalog is a
presentation convenience; it does not enter Core Build identity.
