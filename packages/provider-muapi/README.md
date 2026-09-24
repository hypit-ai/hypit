# `@hypit/provider-muapi`

Hypit Runtime Provider for a [MuAPI](https://muapi.ai) account. The first
surface maps `@hypit/seedance@1#seedance-2.5` to MuAPI's documented
`seedance-2.5-text-to-video` and `seedance-2.5-image-to-video` model paths.
It submits one asynchronous task, polls the prediction result, downloads the
expiring output URL and stores the video in the current Build.

| Hypit capability | MuAPI model path |
| --- | --- |
| `@hypit/seedance@1#seedance-2.5` without a first frame | `seedance-2.5-text-to-video` |
| `@hypit/seedance@1#seedance-2.5` with a first frame | `seedance-2.5-image-to-video` |

MuAPI exposes a large model catalogue, but this package advertises only the
capability whose input and output contract is installed in this Hypit
Distribution. Additional model families should be added as focused mappings
once their schemas and limits are verified.

The current surface accepts prompt, resolution, duration, aspect ratio and an
optional first image. Last-frame, omni-reference, reference-video,
reference-audio, web-search and generated-audio inputs are rejected before any
file upload or generation submission because these fields are not part of the
documented endpoints above.

Referenced images are uploaded with MuAPI's `POST /api/v1/upload_file` endpoint
and are limited to the documented 10 MB image limit. Configure `publicAssetUrl`
when embedding the Provider if the deployment already publishes workspace
resources. Generated output URLs are downloaded immediately because MuAPI
output links are temporary.

Runtime Profile example:

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {
    "platform": { "use": "@hypit/credential-store-platform" }
  },
  "endpoints": {
    "muapi.default": {
      "use": "@hypit/provider-muapi",
      "pool": "muapi.default",
      "config": {
        "apiKey": { "store": "platform", "key": "muapi.api-key" },
        "defaultConcurrency": 3,
        "pollIntervalMs": 10000
      }
    }
  },
  "bindings": {}
}
```

`baseUrl` defaults to `https://api.muapi.ai`. Store the API key with
`hypit auth login muapi.default --runtime hypit.runtime.json`. Optional
`requestTimeoutMs`, `operationTimeoutMs` and `actionLimits` bound individual
HTTP calls, the whole remote task and action concurrency.
