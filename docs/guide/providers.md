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

Provider packages depend on Runtime ports and the model families they serve, never on the CLI:

```json
{
  "name": "@svml/provider-my-service",
  "version": "0.0.0-dev",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "svml": { "activation": "./src/activation.ts" },
  "dependencies": {
    "@svml/endpoint-kit": "workspace:*",
    "@svml/protocol": "workspace:*",
    "@svml/runtime": "workspace:*",
    "@svml/runtime-adapter": "workspace:*",
    "@svml/runtime-adapter-node": "workspace:*",
    "@svml/seedance": "workspace:*"
  }
}
```

## 3. Implement the Provider

The Provider handles Commands from the Scheduler: request submission, polling, download and
ArtifactStore persistence.

```typescript
// src/provider.ts
import type { EndpointManifest } from "@svml/endpoint-kit";

export function createMyServiceProvider(options: {
  instance: string;
  lane?: string;
  apiKey?: { env: string };
  defaultConcurrency?: number;
}) {
  // Return an object with:
  // - manifest: declares Capabilities this Endpoint implements
  // - handle: processes Commands from the Scheduler
  // - close: cleanup
}
```

Look at existing Providers for reference:
- `packages/provider-kie/src/provider.ts` — remote generation with upload, polling and download
- `packages/provider-media-local/` — local process execution (ffprobe/ffmpeg)
- `packages/provider-whisperx-local/` — local sidecar HTTP service
- `packages/provider-hyperframes-local/` — local Chrome rendering

## 4. Write the activation descriptor

```typescript
// src/activation.ts
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigObject,
  runtimeConfigString,
  runtimeConfigPositiveInteger,
} from "@svml/runtime-adapter";
import { diagnoseRuntimeEnvironmentCredential } from "@svml/runtime-adapter-node";
import { createMyServiceProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@svml/provider-my-service",

  create(context) {
    const config = runtimeConfigObject(context.config, "MyService");
    const apiKeyEnv = runtimeConfigString(config.apiKeyEnv, "MyService apiKeyEnv");
    return createMyServiceProvider({
      instance: context.instance,
      lane: context.lane,
      ...(apiKeyEnv === undefined ? {} : { apiKey: { env: apiKeyEnv } }),
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "concurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
    });
  },

  doctor(context) {
    const config = runtimeConfigObject(context.config, "MyService");
    const apiKeyEnv = runtimeConfigString(config.apiKeyEnv, "MyService apiKeyEnv")
      ?? "MY_SERVICE_API_KEY";
    return diagnoseRuntimeEnvironmentCredential(apiKeyEnv, "MyService");
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/provider-my-service",
  hostFacets: [adapter],
};

export default svmlPackage;
```

The `create` function constructs the Endpoint from Runtime config. The `doctor` function returns
diagnostics (credential presence, executable availability) without constructing or calling
anything.

## 5. Register and lock

Add the path mapping to `tsconfig.v2.json`:

```json
"@svml/provider-my-service": ["packages/provider-my-service/src/index.ts"]
```

Lock into a Runtime package lock:

```bash
pnpm svml:v2 lock-packages <runtime-lock> \
  --package @svml/provider-my-service \
  --root .
```

## 6. Reference from svml.runtime.json

```json
{
  "endpoints": [
    {
      "use": "@svml/provider-my-service",
      "instance": "my-service.project",
      "lane": "generation",
      "config": {
        "apiKeyEnv": "MY_SERVICE_API_KEY",
        "defaultConcurrency": 2
      }
    }
  ],
  "permissions": [
    "network:api.my-service.com"
  ]
}
```

Verify the configuration:

```bash
pnpm svml:v2 doctor svml.runtime.json
```

## Existing Providers to study

| Package | Pattern |
|---|---|
| `provider-kie` | Remote API: upload, paid submission, checkpointed polling, bounded download, immediate ArtifactStore persistence |
| `provider-media-local` | Local process: shell-free ffprobe/ffmpeg with bounded execution |
| `provider-whisperx-local` | Local sidecar: HTTP service with warm model, single-admit concurrency |
| `provider-google-vertex` | Cloud API: Vertex AI with project/credentials configuration |
| `provider-hyperframes-local` | Local process: Chrome rendering with worker parallelism and output probe validation |
| `provider-image-opencv-local` | Local Python: bounded OpenCV/NumPy with locked Python environment |
