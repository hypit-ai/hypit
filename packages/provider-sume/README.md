# `@hypit/provider-sume`

Optional Provider, not installed with Hypit. Install in the video project:

```bash
npm install @hypit/provider-sume
```

Hypit Runtime Provider for a [Sume](https://docs.sume.com/public-api) API key. Each capability
submits one asynchronous job to `https://api.sume.com` with a `Bearer` API key, polls
`GET /v1/jobs/{id}/status` until the job is terminal, reads the generated files from
`GET /v1/jobs/{id}/result` and stores them in the current Build.

| Capability | Sume model | Submit path |
| --- | --- | --- |
| `@hypit/seedance@1#seedance-2` | `seedance-2` | `/v1/video-router/generate` |
| `@hypit/seedance@1#seedance-2-fast` | `seedance-2-fast` | `/v1/video-router/generate` |
| `@hypit/seedance@1#seedance-2-mini` | `seedance-2-mini` | `/v1/video-router/generate` |
| `@hypit/seedance@1#seedance-2.5` | `seedance-2.5` | `/v1/video-router/generate` |
| `@hypit/minimax-h3@1#minimax-h3` | `minimax-h3` | `/v1/video-router/generate` |
| `@hypit/grok-imagine@1#grok-imagine-video-1.5-preview` | `grok-imagine-video-1.5` | `/v1/video-router/generate` |
| `@hypit/pixverse@1#pixverse-v6` | `pixverse-v6` | `/v1/video-router/generate` |
| `@hypit/pixverse@1#pixverse-c1` | `pixverse-c1` | `/v1/video-router/generate` |
| `@hypit/gpt-image@1#gpt-image-2` | `openai/gpt-image-2` | `/v1/images` |
| `@hypit/nano-banana@1#nano-banana-2` | `google/nano-banana-2.1` | `/v1/images` |
| `@hypit/nano-banana@1#nano-banana-pro` | `google/nano-banana-pro` | `/v1/images` |
| `@hypit/seedream@1#seedream-5-lite` | `bytedance-seed/seedream-5-lite` | `/v1/images` |

Sume's [video](https://docs.sume.com/models/videos.md) and [image](https://docs.sume.com/models/images.md)
catalogs list further models; this Provider maps only the models the Distribution already describes.
Sume serves Nano Banana 2 as its successor, Nano Banana 2.1, so a `nano-banana-2` request renders on
`google/nano-banana-2.1`.

Video jobs carry the opening and closing frames as `image_url` and `end_image_url`, and references as
`reference_image_urls`, `reference_video_urls` and `reference_audio_urls`. Image jobs carry their
references as `input_references`. Every submission uses `mode: "async"`. `duration`, `aspect_ratio`,
`resolution` and `generate_audio` keep their authored values, except that MiniMax H3's `768P` is sent
as `768p`, PixVerse's `quality` travels as `resolution`, and Nano Banana's `jpg` output format is sent
as `jpeg`. A Grok Imagine 1.5 image travels as the first frame, and the first frame then sets the
shape, so the authored aspect ratio is not sent with it.

Service limits this Provider reports as unsupported before uploading any reference:

- Seedance has no `web_search` field. An authored `false` is dropped; an authored `true` is refused.
- Seedance 2.5 takes 4 to 30 seconds, so `duration="-1"` for an automatic length is refused.
- MiniMax H3 takes 5 to 15 seconds.
- Grok Imagine 1.5 takes a prompt alone or one first-frame image, does not render `2:3` or `3:2`, and
  needs an explicit aspect ratio without an image.
- PixVerse V6 and C1 take a prompt or reference images, without frames, reference videos, a seed or
  multi-clip, for 2 to 15 seconds, and do not render `2:3`, `3:2` or `auto`.
- GPT Image 2 has no `background` field, accepts up to ten reference images and does not render
  `3:2`, `2:3`, `2:1`, `1:2`, `3:1`, `1:3`, `21:9` or `9:21`.
- Nano Banana 2.1 accepts up to ten reference images.
- Seedream 5.0 lite renders at 2K, which is `quality="basic"`; accepts up to ten reference images;
  does not render `21:9`; and has no switch to turn its content check off, so `nsfw-check="false"` is
  refused.

Seedance visual references carry `person-reference`; the Provider accepts the declaration and
transmits nothing for it, since Sume's request body has no field for it.

Referenced Resources are uploaded through `POST /v1/files/generate-upload-url`: the Provider PUTs the
bytes to the returned presigned URL and sends the returned public `media.sume.com` URL in the job. One
Resource is uploaded once per Runtime operation. Embedded callers may replace that transport with
`publicAssetUrl(artifact, resources, fields)`, which must return a public HTTPS URL Sume can fetch.

Runtime Profile example:

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {
    "local": {
      "use": "@hypit/credential-store-local"
    }
  },
  "endpoints": {
    "sume.default": {
      "use": "@hypit/provider-sume",
      "pool": "sume.default",
      "config": {
        "apiKey": { "store": "local", "key": "sume.api-key" },
        "defaultConcurrency": 2,
        "pollIntervalMs": 5000
      }
    }
  },
  "bindings": {}
}
```

`baseUrl` defaults to `https://api.sume.com`. Store the API key with
`hypit auth login sume.default --runtime hypit.runtime.json`. `defaultConcurrency` defaults to 2,
which is the number of jobs Sume's free plan runs at once; raise it to the workspace's plan limit.
Optional `requestTimeoutMs`, `operationTimeoutMs` and `actionLimits` bound single HTTP calls, the
whole remote job and action concurrency. Each submission sends the Runtime operation as its
`Idempotency-Key`, so a retried submission of the same body resolves to the same job and is charged
once.

HTTP failures keep Sume's `error.code`, message, `details`, `request_id` and any
`retry_after_seconds`; a failed or canceled job keeps its error code, message and the upstream
provider's message. Any URL inside a surfaced reason is redacted, since an upload or result URL is an
access capability rather than diagnostic content. Polling transport failures and HTTP 429/5xx
preserve the same job. Sume's `retry_after_seconds` takes precedence over the standard `Retry-After`
header; either wait is capped at the original operation deadline, where the next poll concludes
timeout without querying early.
