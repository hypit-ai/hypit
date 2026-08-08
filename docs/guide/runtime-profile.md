---
title: Runtime Profile
description: Configuring where Builds execute, diagnostics and Build archive.
---

# Runtime Profile

The Runtime Profile declares *where* a frozen Build executes: Endpoints, credentials, concurrency,
permissions. It is deployment configuration, not creative content — it never enters Author or Run
graph identity.

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
  "endpoints": [
    {
      "use": "@narratage/provider-kie",
      "instance": "kie.production",
      "lane": "generation",
      "config": {
        "apiKeyEnv": "KIE_API_KEY",
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
        "credentialsEnv": "GOOGLE_APPLICATION_CREDENTIALS_JSON",
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
| `config` | Adapter-specific configuration (credential env vars, concurrency, timeouts) |

Credentials are referenced by environment variable name, never stored in the Profile.

### Scheduling

`maxConcurrency` caps total concurrent Operations across all lanes. Each named `lane` has its own
sub-cap. Lanes are declared by the Endpoint and enforced by the Scheduler.

### Permissions

Each permission string grants one specific authority to the locked Endpoints:

- `network:<host>` — outbound HTTP to that host
- `filesystem:<scope>` — file access within a named scope
- `process:<name>` — local process execution

## Executable TypeScript

For advanced embedding, construct the Runtime programmatically:

```typescript
import { createProjectLocalRuntime } from "@narratage/local";
import { createKieProvider } from "@narratage/provider-kie";
import { createLocalMediaProvider } from "@narratage/provider-media-local";

export default async function createRuntime() {
  const endpoints = [
    createKieProvider({
      instance: "kie.prod",
      lane: "generation",
      defaultConcurrency: 2,
    }),
    createLocalMediaProvider({
      instance: "media.prod",
      lane: "media",
      defaultConcurrency: 2,
    }),
  ];

  return await createProjectLocalRuntime({
    root: import.meta.dirname,
    packageLock: "./svml.packages.lock",
    endpoints,
    allowedPermissions: endpoints.flatMap(e =>
      e.manifest.facets.flatMap(f => f.permissions)),
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
- Referenced credentials exist in the environment
- Required executables (ffmpeg, ffprobe, chrome) are found

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
