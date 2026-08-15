---
title: Adding a Provider
description: Step-by-step guide for adding a new Endpoint adapter.
---

# Adding a Provider

A Provider package implements a privileged external capability — video generation, media
processing, alignment, caption planning, rendering. It is activated through the Runtime Profile,
never through `<import>` in Author Source.

No change to Core, the CLI or any author package is required.

## 1. Create the package

```bash
mkdir -p packages/provider-my-service/src packages/provider-my-service/test
```

## 2. Write package.json

Provider packages depend on Runtime ports and shared capability vocabularies, never on exact-model
packages or the CLI:

```json
{
  "name": "@narratage/provider-my-service",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "narratage": { "activation": "./src/activation.ts" },
  "dependencies": {
    "@narratage/endpoint-kit": "workspace:*",
    "@narratage/protocol": "workspace:*",
    "@narratage/runtime": "workspace:*",
    "@narratage/runtime-kit": "workspace:*",
    "@narratage/runtime-host-node": "workspace:*",
    "@narratage/generation": "workspace:*"
  }
}
```

## 3. Implement the Provider

The Provider handles Commands from the Scheduler: request submission, polling, download and
ArtifactStore persistence.

```typescript
// src/provider.ts
import { defineEndpointPackage } from "@narratage/endpoint-kit";

export function createMyServiceProvider(options: {
  instance: string;
  pool: string;
  apiKey: CredentialRef;
  defaultConcurrency?: number;
}) {
  return defineEndpointPackage({
    module: { name: "@narratage/provider-my-service", version: "1" },
    facet: "service",
    instance: options.instance,
    pool: options.pool,
    credentials: { apiKey: options.apiKey },
    defaultConcurrency: options.defaultConcurrency ?? 2,
    capabilities: [{
      capability: myCapability,
      returns: myResultType,
      lane: "generate",
      lifecycle: "recoverable",
      endpoint: myRecoverableEndpoint,
    }],
  });
}
```

Look at existing Providers for reference:
- `packages/provider-kie/src/provider.ts` — remote generation with upload, polling and download
- `packages/provider-media-local/` — local process execution (ffprobe/ffmpeg)
- `packages/provider-whisperx-local/` — local HTTP service
- `packages/provider-hyperframes-local/` — local Chrome rendering
- `packages/provider-hyperframes-aws-lambda/` — recoverable Step Functions/Lambda rendering
- `packages/provider-media-aws-lambda/` — synchronous Lambda media execution over the shared ffmpeg body
- `packages/provider-xiaomi-mimo/` — immediate official TTS API without importing the MiMo model package

## 4. Write the activation descriptor

```typescript
// src/activation.ts
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
} from "@narratage/runtime-kit";
import { createMyServiceProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-my-service",

  activate(context) {
    if (context.pool === undefined) throw new Error("MyService pool is required");
    const config = runtimeConfigObject(context.config, "MyService");
    runtimeConfigExact(config, ["apiKey", "defaultConcurrency"], "MyService");
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "MyService apiKey");
    if (apiKey === undefined) throw new Error("MyService apiKey CredentialRef is required");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "concurrency");
    return {
      endpoint: createMyServiceProvider({
        instance: context.instance,
        pool: context.pool,
        apiKey,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
      }),
    };
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [adapter],
};

export default narratagePackage;
```

`activate` is the one pure deployment declaration. The Endpoint it returns owns the credential
references, capabilities and scheduling facts used by both `doctor` and execution.
Activation must not resolve secrets or environment-sourced deployment values, access the network or
start work. It keeps environment names as references until a matching Need is handled. Credential
presence is diagnosed through the generic CredentialStore path; a Provider must not special-case
environment variables as a secret Store.

## 5. Declare a Managed Program when needed

If the Provider depends on a warm external program, export its declaration beside the Endpoint.
There is no second manifest flag or central program registry:

```typescript
// src/program.ts
import type { ManagedProgram } from "@narratage/runtime-kit";

export function createMyProgram(): ManagedProgram {
  return {
    id: "my-service",
    prepare: { command: "uv", args: ["sync", "--project", "services/my-service", "--frozen"] },
    start: { command: "uv", args: ["run", "--project", "services/my-service", "--frozen", "narratage-my-service"] },
    probe: async () => {
      // Return { state: "ready" } or { state: "down", detail: "..." }
    },
  };
}
```

Return it beside the Endpoint from the same activation:

```typescript
const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-my-service",
  activate(context) {
    return {
      endpoint: createMyServiceProvider(/* parsed config */),
      program: createMyProgram(),
    };
  },
});
```

`narratage runtime up` prepares, starts and probes declared Managed Programs before starting the
durable Worker. `build` starts only Programs backing capabilities demanded by its plan. Providers
that call only remote APIs omit `program` entirely.

## 6. Install

Declare every imported package in the Provider's own `package.json`:

```json
"dependencies": {
  "@narratage/runtime-kit": "workspace:*"
}
```

Install the package with the project's package manager. It remains inert until the Runtime Profile
explicitly selects its `use` id.

## 7. Reference from narratage.runtime.json

```json
{
  "endpoints": {
    "my-service": {
      "use": "@narratage/provider-my-service",
      "pool": "my-service.account",
      "config": {
        "apiKey": { "store": "keychain", "key": "my-service.api-key" },
        "defaultConcurrency": 2
      }
    }
  }
}
```

Verify the configuration:

```bash
narratage doctor narratage.runtime.json
```

## Existing Providers to study

| Package | Pattern |
|---|---|
| `provider-kie` | Remote API: upload, paid submission, checkpointed polling, bounded download, immediate ArtifactStore persistence |
| `provider-media-local` | Local process: shell-free ffprobe/ffmpeg with bounded execution |
| `provider-whisperx-local` | Local HTTP service with a warm model, single-admit concurrency |
| `provider-google-vertex` | Cloud API: Vertex AI with project/credentials configuration |
| `provider-hyperframes-local` | Local process: Chrome rendering with worker parallelism and output probe validation |
| `provider-hyperframes-aws-lambda` | Remote recoverable job: deterministic Step Functions submission, polling and S3 streaming |
| `provider-image-opencv-local` | Local Python: bounded OpenCV/NumPy with locked Python environment |
| `provider-media-aws-lambda` | Remote synchronous Lambda: the same eight capabilities as local media |
| `provider-xiaomi-mimo` | Remote immediate API: exact MiMo TTS requests to persisted audio Artifacts |
