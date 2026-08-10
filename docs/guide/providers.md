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
  "svml": { "activation": "./src/activation.ts", "service": true },
  "dependencies": {
    "@narratage/endpoint-kit": "workspace:*",
    "@narratage/protocol": "workspace:*",
    "@narratage/runtime": "workspace:*",
    "@narratage/runtime-adapter": "workspace:*",
    "@narratage/runtime-adapter-node": "workspace:*",
    "@narratage/generation": "workspace:*"
  }
}
```

## 3. Implement the Provider

The Provider handles Commands from the Scheduler: request submission, polling, download and
ArtifactStore persistence.

```typescript
// src/provider.ts
import type { EndpointManifest } from "@narratage/endpoint-kit";

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
  runtimeConfigObject,
  runtimeConfigString,
  runtimeConfigPositiveInteger,
} from "@narratage/runtime-adapter";
import { diagnoseRuntimeEnvironmentCredential } from "@narratage/runtime-adapter-node";
import { createMyServiceProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-my-service",

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
  name: "@narratage/provider-my-service",
  hostFacets: [adapter],
};

export default svmlPackage;
```

The `create` function constructs the Endpoint from Runtime config. The `doctor` function returns
diagnostics (credential presence, executable availability) without constructing or calling
anything.

## 5. Declare an external service (if needed)

If the Provider depends on an external program (a Python service, a local server), add
`"service": true` to the `svml` block in `package.json` (shown in step 2) and export a factory
from `src/service.ts`:

```typescript
// src/service.ts
import type { RuntimeExternalService } from "@narratage/local";

export function createMyExternalService(): RuntimeExternalService {
  return {
    id: "my-service",
    prepare: { command: "uv", args: ["sync", "--project", "services/my-service", "--frozen"] },
    start: { command: "uv", args: ["run", "--project", "services/my-service", "--frozen", "svml-my-service"] },
    probe: async () => {
      // Return { state: "ready" } or { state: "down", detail: "..." }
    },
  };
}
```

Wire it into the activation descriptor by passing `service` to `createRuntimeEndpointAdapterFacet`:

```typescript
const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-my-service",
  service: createMyExternalService,
  // create, doctor …
});
```

`pnpm install` will run `prepare` automatically, and `narratage build` will call `start` and
`probe` before the first Operation. Providers that call only remote APIs (no local program) omit
this step entirely — leave `"service"` out of `package.json`.

## 6. Register and lock

Add the path mapping to `tsconfig.json`:

```json
"@narratage/provider-my-service": ["packages/provider-my-service/src/index.ts"]
```

Lock into a Runtime package lock:

```bash
pnpm narratage lock-packages <runtime-lock> \
  --package @narratage/provider-my-service \
  --root .
```

## 7. Reference from svml.runtime.json

```json
{
  "endpoints": [
    {
      "use": "@narratage/provider-my-service",
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
pnpm narratage doctor svml.runtime.json
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
| `provider-media-aws-lambda` | Remote synchronous Lambda: the same eight capabilities as local media; the deployed canary currently covers the original five |
| `provider-xiaomi-mimo` | Remote immediate API: exact MiMo TTS requests to persisted audio Artifacts |
