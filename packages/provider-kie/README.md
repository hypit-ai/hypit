# `@hypit/provider-kie`

Asynchronous KIE Market Provider for the eleven explicitly selected exact models and one generic
background-removal capability.

This package is deployment code. Author source imports model modules such as `@hypit/seedance` or
`@hypit/gpt-image`; trusted Runtime configuration installs `createKieProvider()`. The Provider binds
only those exact model capabilities and never interprets a generic image/video request as permission to
choose another model.

It imports no exact-model package. Every supported Capability contributes one `KieRoute`: exact
Capability, return Type, request compiler, media/count limits and result packer. All Routes share one
upload, paid submission, durable Operation polling, download and working-Resource write path. Model mappings
generate eleven Routes; Background Removal contributes the twelfth.

## Supported catalog

One Capability per exact model; a service that splits a model across endpoints expresses that as
routes rather than extra Capabilities.

| Author module | Exact models | KIE model slugs |
|---|---|---|
| `@hypit/seedance` | `seedance-2`, `-fast`, `-mini`, `seedance-2.5` | `bytedance/seedance-2*`, `bytedance/seedance-2-5` |
| `@hypit/minimax-h3` | `minimax-h3` | `minimax-h3/{text,image,reference}-to-video` |
| `@hypit/grok-imagine` | `grok-imagine-video`, `-1.5-preview` | Grok Imagine video endpoints |
| `@hypit/gpt-image` | `gpt-image-2` | `gpt-image-2-{text,image}-to-image` |
| `@hypit/nano-banana` | `nano-banana-2`, `-pro` | `nano-banana-2`, `nano-banana-pro` |
| `@hypit/seedream` | `seedream-5-lite` | `seedream/5-lite-{text,image}-to-image` |
| `@hypit/background-removal` | `remove-background` | `recraft/remove-background` |

KIE accepts the GPT Image 2 `4:3`, `3:4` and `4:5` ratios. Its restrictions are combinations rather
than a blacklist: `auto` is 1K-only, `1:1` is unavailable at 4K, and `4:5` is 1K-only. The KIE
Endpoint checks those exact combinations before upload or paid submission without narrowing the
model package's Provider-neutral vocabulary.

KIE's Grok Imagine endpoints accept up to seven reference images, but only one at 1080p. This is
also checked by the KIE Endpoint; the Grok model packages retain their model-level seven-image
capacity.

There is deliberately no Grok image capability and no MiMo capability in this release. Seedream's
`nsfwCheck` is explicit author request content; KIE cannot silently enable or disable it. A
customer-specific “spicy” treatment belongs in a Recipe that selects and parameterizes exact model
requests, not in Provider routing.

## Local Runtime

Declarative activation names an ordinary CredentialRef, not an environment-specific Provider field:

```json
"kie.personal": {
  "use": "@hypit/provider-kie",
  "config": {
    "apiKey": { "store": "os", "key": "kie.api-key" },
    "defaultConcurrency": 8,
    "capabilityConcurrency": {
      "seedance-2.5": 4,
      "gpt-image-2": 3
    }
  }
}
```

The selected writable CredentialStore then enables `hypit auth login kie.personal --runtime
hypit.runtime.json`; KIE contributes the credential description and the generic CLI contains no KIE
branch.

```ts
import { createKieProvider } from "@hypit/provider-kie";
import { credentialRef } from "@hypit/runtime";

const kie = createKieProvider({
  instance: "kie.personal",
  apiKey: credentialRef("env", "KIE_API_KEY"),
  defaultConcurrency: 8,
  capabilityConcurrency: {
    "seedance-2.5": 4,
    "gpt-image-2": 3,
  },
});
```

`defaultConcurrency` is the total capacity of this configured KIE Endpoint across all Builds. Each
optional `capabilityConcurrency` entry narrows the capacity of one exact KIE model inside that total. By
default the Endpoint instance is the shared-resource identity. Set Profile `pool` only when multiple
Endpoint instances really use the same account or deployment quota. Another Provider is independent
unless the Profile explicitly gives it that same real-resource identity.
One Need execution acquires its total and model-specific capacity claims atomically. These are shared-resource
limits, not parent and child queues.

`submissionIntervalMs` spaces submissions within one Provider instance. It is a frequency limit,
not a concurrency slot, and is not shared across separate instances by the `pool` setting.
Polling errors retain the task and its capacity. A local operation deadline records failure and
continues observing termination; unsupported cancellation cannot release a still-running task.

An advanced embedding adds `kie` to its Endpoint list beside a complete, explicit set of Runtime
service packages and selections. The `.svml` Module Closure separately contains only the model
Manifests actually imported by the author document; installing KIE does not add author intent.

## Paid-operation law

1. Reference `BlobRef`s are read from the current Build's working byte area and uploaded through KIE's file
   stream API. KIE temporary URLs never enter author source or generated Product identity.
2. A successful `createTask` response is persisted as one asynchronous Operation. Because KIE does not document an
   idempotency key, an ambiguous network/5xx submission is not automatically retried.
3. Once a `taskId` exists, later Worker polling continues only that same task. Poll/download errors cannot create a new
   paid generation.
4. Successful result URLs are converted to short-lived download URLs, bounded while streaming,
   immediately written into that Build's working byte area, and removed from durable
   result metadata.
5. The selected Runtime Execution Store owns shared capacity across Builds. This Provider contributes
   one KIE-total claim plus narrower exact-capability claims and a conservative create-task interval; it does not introduce Redis or another source of
   Build truth.

The automated suite uses an adversarial fake KIE service. It covers submission ambiguity,
continuation of accepted tasks, polling, bounded downloads and failures without spending money or
requiring deployment credentials.
