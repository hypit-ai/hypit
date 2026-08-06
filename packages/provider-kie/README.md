# `@svml/provider-kie`

Recoverable KIE Market Provider for the first seven explicitly selected model families.

This package is deployment code. Author source imports model modules such as `@svml/seedance` or
`@svml/gpt-image`; trusted Runtime configuration installs `createKieProvider()`. The Provider binds
only those exact capabilities and never interprets a generic image/video request as permission to
choose another model.

## Supported catalog

| Author module | Exact author model/mode | KIE model |
|---|---|---|
| `@svml/seedance` | Seedance 2.0 / Fast / Mini | `bytedance/seedance-2*` |
| `@svml/minimax-h3` | text / frames / multimodal reference | `minimax-h3/*-to-video` |
| `@svml/gemini-omni` | Gemini Omni Video | `gemini-omni-video` |
| `@svml/grok-imagine` | text video / image video / 1.5 preview | Grok Imagine video endpoints |
| `@svml/gpt-image` | GPT Image 2 text / image | GPT Image 2 endpoints |
| `@svml/nano-banana` | Nano Banana 2 / Pro | `nano-banana-2`, `nano-banana-pro` |
| `@svml/seedream` | Seedream 5 Lite text / image | Seedream 5 Lite endpoints |

There is deliberately no Grok image capability and no MiMo capability in this release. Seedream's
`nsfwCheck` is explicit author request content; KIE cannot silently enable or disable it. A
customer-specific “spicy” treatment belongs in a Recipe that selects and parameterizes exact model
requests, not in Provider routing.

## Local Runtime

```ts
import { geminiOmniComponent } from "@svml/gemini-omni";
import { generationComponent } from "@svml/generation";
import { gptImageComponent } from "@svml/gpt-image";
import { grokImagineComponent } from "@svml/grok-imagine";
import { createProjectLocalRuntime } from "@svml/local";
import { minimaxH3Component } from "@svml/minimax-h3";
import { nanoBananaComponent } from "@svml/nano-banana";
import { createKieProvider } from "@svml/provider-kie";
import { credentialRef } from "@svml/runtime";
import { seedanceComponent } from "@svml/seedance";
import { seedreamComponent } from "@svml/seedream";

export default await createProjectLocalRuntime({
  components: [
    generationComponent,
    seedanceComponent,
    minimaxH3Component,
    geminiOmniComponent,
    grokImagineComponent,
    gptImageComponent,
    nanoBananaComponent,
    seedreamComponent,
  ],
  providers: [createKieProvider({
    instance: "kie.personal",
    apiKey: credentialRef("env", "KIE_API_KEY"),
    defaultConcurrency: 2,
  })],
  allowedPermissions: [
    "network:api.kie.ai",
    "network:kieai.redpandaai.co",
  ],
});
```

The shared `generationComponent` installs semantic validators for generated-media Products. Each
model component installs its exact request validators and deterministic request-to-Need Producers.
The `.svml` Module Closure separately contains only the model Manifests actually imported by the
author document; installing Runtime code does not implicitly add author intent.

## Paid-operation law

1. Reference `BlobRef`s are read from the configured ArtifactStore and uploaded through KIE's file
   stream API. KIE temporary URLs never enter author source or generated Product identity.
2. `createTask` is journaled as one recoverable Operation. Because KIE does not document an
   idempotency key, an ambiguous network/5xx submission is not automatically retried.
3. Once a `taskId` exists, restart resumes only that task. Poll/download errors cannot create a new
   paid generation.
4. Successful result URLs are converted to short-lived download URLs, bounded while streaming,
   immediately written to the configured content-addressed ArtifactStore, and removed from durable
   result metadata.
5. `@svml/local` owns Build concurrency. This Provider contributes one KIE lane and a conservative
   create-task interval; it does not introduce Redis or another source of Build truth.

The automated suite uses an adversarial fake KIE service. The credentialed smoke command is a paid
deployment test and is intentionally not run by the public repository test suite. It must be enabled
explicitly and keeps a stable Runtime directory under the operating system temporary directory so
an interrupted paid task can resume from its SQLite checkpoint:

```sh
SVML_KIE_LIVE=1 KIE_API_KEY=... pnpm smoke:kie
```

The default case is `gpt-image-2`. Set `SVML_KIE_SMOKE_CASES=all` or a comma-separated subset of
`gpt-image-2,nano-banana-2,seedream-5-lite,seedance-2-mini,minimax-h3,gemini-omni,grok-imagine`.
Set `SVML_KIE_SMOKE_REFERENCE` to add the optional `gpt-image-2-edit` upload case; only use an asset
that is explicitly approved for external upload.

`KIE_BASE_URL` and `SVML_KIE_SMOKE_ROOT` are optional deployment overrides. The command prints
credit usage, the content digest and a local inspection copy, but never prints or persists the key.
The checked-in 2026-08-06 representative results are recorded in
[`docs/kie-live-smoke-2026-08-06.md`](../../docs/kie-live-smoke-2026-08-06.md).
