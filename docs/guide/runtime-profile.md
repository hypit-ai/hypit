---
title: Runtime Profile
description: Configuring where Builds execute, diagnostics and Build archive.
---

# Runtime Profile

The Runtime Profile declares *where* a frozen Build executes: the Scheduler and Worker, all durable
Stores, Endpoints, credentials, concurrency and permissions. It is deployment configuration, not
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
      "lane": "generation",
      "config": {
        "apiKey": { "store": "keychain", "key": "kie.api-key" },
        "defaultConcurrency": 2
      }
    },
    {
      "use": "@narratage/provider-media-local",
      "instance": "media.local",
      "lane": "media",
      "config": { "defaultConcurrency": 2 }
    },
    {
      "use": "@narratage/provider-whisperx-local",
      "instance": "whisperx.local",
      "lane": "alignment",
      "config": { "defaultConcurrency": 1 }
    },
    {
      "use": "@narratage/provider-google-vertex",
      "instance": "vertex.local",
      "lane": "planning",
      "config": {
        "projectEnv": "GOOGLE_CLOUD_PROJECT",
        "credentials": { "store": "keychain", "key": "google.vertex-json" },
        "defaultConcurrency": 1
      }
    },
    {
      "use": "@narratage/provider-hyperframes-local",
      "instance": "hyperframes.local",
      "lane": "render",
      "config": { "workers": 2, "quality": "standard", "defaultConcurrency": 1 }
    }
  ],
  "permissions": [
    "process:keychain",
    "filesystem:artifacts",
    "filesystem:state",
    "filesystem:whisperx-staging",
    "network:aiplatform.googleapis.com",
    "network:api.kie.ai",
    "network:whisperx-loopback",
    "process:hyperframes",
    "process:media"
  ],
  "scheduling": {
    "maxConcurrency": 4,
    "lanes": {
      "generation": 2,
      "media": 2,
      "alignment": 1,
      "planning": 1,
      "render": 1
    }
  }
}
```

### Endpoint fields

| Field | Meaning |
|---|---|
| `use` | Adapter name, resolved from `runtimePackageLock` |
| `instance` | Unique identifier for this Endpoint instance |
| `lane` | Scheduling lane governing concurrency |
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

`maxConcurrency` caps admitted Operations across all Workers sharing the DispatchStore. Each named
`lane` has its own sub-cap. Capacity reservations are durable and fenced by the Build lease rather
than process-local counters.

### Permissions

Each permission string grants one specific authority to the locked Endpoints:

- `network:<host>` — outbound HTTP to that host
- `filesystem:<scope>` — file access within a named scope
- `process:<name>` — local process execution

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
      lane: "generation",
      apiKey: credentialRef("env", "KIE_API_KEY"),
      defaultConcurrency: 2,
    }),
    createLocalMediaProvider({
      instance: "media.prod",
      lane: "media",
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
    allowedPermissions: [
      "environment:credentials", "filesystem:artifacts", "filesystem:state",
      ...endpoints.flatMap(e => e.manifest.facets.flatMap(f => f.permissions)),
    ],
    scheduling: {
      maxConcurrency: 4,
      lanes: { generation: 2, media: 2 },
    },
  });
}
```

Pass either form to `--runtime`:

```bash
pnpm narratage build build.svrun --runtime ./svml.runtime.json
pnpm narratage build build.svrun --runtime ./svml.runtime.ts
```

Both forms describe the same explicit assembly. The TypeScript form is trusted embedding code, not
a source-language escape hatch or a place for author intent.

## Diagnostics

### doctor

Checks the Runtime Profile without running a Build or making paid requests:

```bash
pnpm narratage doctor svml.runtime.json
```

Validates:
- Package locks exist and are readable
- Adapter byte digests match
- Configuration keys are valid for each adapter
- Referenced credentials resolve from their selected stores
- Required executables (ffmpeg, ffprobe, chrome) are found
- Declared external services are reachable and match the selected profile

Runtime Adapter Host ABI `@1` separates a required pure configuration validator from the adapter
factory. `doctor` never constructs an Endpoint or Store, starts a service, writes Runtime state or
submits work. After configuration passes it may make bounded read-only environment probes. The first
configuration or prerequisite failure for one instance suppresses diagnostics that merely result
from that same failure.

## Runtime lifecycle

```bash
pnpm narratage runtime up svml.runtime.json
pnpm narratage runtime status svml.runtime.json
pnpm narratage runtime logs svml.runtime.json
pnpm narratage runtime down svml.runtime.json
```

`runtime up` owns the detached Worker plus declared external programs. `services` remains a narrow
expert command for those external programs only. A Build submission ensures the Runtime is up, but
the Build terminal never owns execution.

### gc (garbage collection)

```bash
pnpm narratage gc svml.runtime.json            # dry-run
pnpm narratage gc svml.runtime.json --apply     # delete unreachable Artifacts
```

Walks every retained BuildState and Operation, computes reachable Artifact digests, and reports
(or deletes) unreachable orphans.

## Build archive and inspection

Every Build archives all accepted Records and referenced Artifacts durably, independent of any
`--to` destination path.

### List Builds

```bash
pnpm narratage builds --runtime svml.runtime.json
```

### Inspect

```bash
pnpm narratage inspect <build-id> --runtime svml.runtime.json
```

Shows target bindings, demanded Logical Outputs, every accepted Record and Operation status.

### Retrieve Records

```bash
# By source output name
pnpm narratage get <build-id> --runtime svml.runtime.json \
  --name final.video --to output.mp4

# By Record id
pnpm narratage get <build-id> --runtime svml.runtime.json \
  --record <record-id> --to output.json

# By Logical Output id
pnpm narratage get <build-id> --runtime svml.runtime.json \
  --output <output-id>

# By Artifact digest
pnpm narratage get <build-id> --runtime svml.runtime.json \
  --artifact <sha256:...> --to file.bin
```

`--name` uses the source output alias from the Host-only Build Catalog. The Catalog is a
presentation convenience; it does not enter Core Build identity.
