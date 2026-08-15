# `@narratage/provider-kie`

Recoverable KIE Market Provider for the twelve explicitly selected exact models and one generic
background-removal capability.

This package is deployment code. Author source imports model modules such as `@narratage/seedance` or
`@narratage/gpt-image`; trusted Runtime configuration installs `createKieProvider()`. The Provider binds
only those exact model capabilities and never interprets a generic image/video request as permission to
choose another model.

It imports no exact-model package. Every supported Capability contributes one `KieRoute`: exact
Capability, return Type, request compiler, media/count limits and result packer. All Routes share one
upload, admission, paid submission, checkpoint, polling and download state machine. Model mappings
generate twelve Routes; Background Removal contributes the thirteenth.

## Supported catalog

One Capability per exact model; a service that splits a model across endpoints expresses that as
routes rather than extra Capabilities.

| Author module | Exact models | KIE model slugs |
|---|---|---|
| `@narratage/seedance` | `seedance-2`, `-fast`, `-mini`, `seedance-2.5` | `bytedance/seedance-2*`, `bytedance/seedance-2-5` |
| `@narratage/minimax-h3` | `minimax-h3` | `minimax-h3/{text,image,reference}-to-video` |
| `@narratage/gemini-omni` | `gemini-omni-video` | `gemini-omni-video` |
| `@narratage/grok-imagine` | `grok-imagine-video`, `-1.5-preview` | Grok Imagine video endpoints |
| `@narratage/gpt-image` | `gpt-image-2` | `gpt-image-2-{text,image}-to-image` |
| `@narratage/nano-banana` | `nano-banana-2`, `-pro` | `nano-banana-2`, `nano-banana-pro` |
| `@narratage/seedream` | `seedream-5-lite` | `seedream/5-lite-{text,image}-to-image` |
| `@narratage/background-removal` | `remove-background` | `recraft/remove-background` |

There is deliberately no Grok image capability and no MiMo capability in this release. Seedream's
`nsfwCheck` is explicit author request content; KIE cannot silently enable or disable it. A
customer-specific “spicy” treatment belongs in a Recipe that selects and parameterizes exact model
requests, not in Provider routing.

## Local Runtime

Declarative activation names an ordinary CredentialRef, not an environment-specific Provider field:

```json
{
  "use": "@narratage/provider-kie",
  "instance": "kie.personal",
  "config": {
    "apiKey": { "store": "keychain", "key": "kie.api-key" },
    "defaultConcurrency": 8,
    "routeConcurrency": {
      "seedance-2.5": 4,
      "gpt-image-2": 3
    }
  }
}
```

The selected writable CredentialStore then enables `narratage auth login kie.personal --runtime
svml.runtime.json`; KIE contributes the credential description and the generic CLI contains no KIE
branch.

```ts
import { createKieProvider } from "@narratage/provider-kie";
import { credentialRef } from "@narratage/runtime";

const kie = createKieProvider({
  instance: "kie.personal",
  apiKey: credentialRef("env", "KIE_API_KEY"),
  defaultConcurrency: 8,
  routeConcurrency: {
    "seedance-2.5": 4,
    "gpt-image-2": 3,
  },
});
```

`defaultConcurrency` is the total KIE authority capacity shared by all Builds. Each optional
`routeConcurrency` entry limits one exact KIE model route inside that total. There is no cross-Provider
`seedance` family queue: another Provider owns another authority and its own independently named
routes. A task acquires its Provider and route capacity together, so it is queued once rather than
copied between parent and child queues.

An advanced embedding adds `kie` to its Endpoint list beside a complete, explicit set of Runtime
service packages and selections. A reproducible project normally activates deterministic model
components through `packageLock`. The `.svml` Module Closure separately contains only the model
Manifests actually imported by the author document; installing KIE does not add author intent.

## Paid-operation law

1. Reference `BlobRef`s are read from the configured ArtifactStore and uploaded through KIE's file
   stream API. KIE temporary URLs never enter author source or generated Product identity.
2. `createTask` is persisted as one recoverable Operation. Because KIE does not document an
   idempotency key, an ambiguous network/5xx submission is not automatically retried.
3. Once a `taskId` exists, Worker recovery resumes only that same task. Poll/download errors cannot create a new
   paid generation.
4. Successful result URLs are converted to short-lived download URLs, bounded while streaming,
   immediately written to the configured content-addressed ArtifactStore, and removed from durable
   result metadata.
5. The selected `BuildDispatchStore` owns shared Build capacity. This Provider contributes one KIE
   Authority plus exact capability Routes and a conservative create-task interval; it does not introduce Redis or another source of
   Build truth.

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
A representative run of all seven families and the optional upload case has passed. Generated
results are deployment evidence and are intentionally not committed as a dated transcript.
