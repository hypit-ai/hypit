# `@hypit/provider-beatapi`

Hypit Runtime Provider for a [BeatAPI](https://docs.beatapi.io/quick-guide) account. Each capability
posts one task to `https://api.beatapi.io` with a `Bearer` API key, polls `GET /v1/tasks/{task_id}`
until it reaches `succeeded`, downloads every entry of `output.media` and stores the files in the
current Build.

| Capability | BeatAPI model | Task path |
| --- | --- | --- |
| `@hypit/seedance@1#seedance-2` | `seedance-2` | `/v1/videos/tasks` |
| `@hypit/seedance@1#seedance-2-fast` | `seedance-2-fast` | `/v1/videos/tasks` |
| `@hypit/seedance@1#seedance-2-mini` | `seedance-2-mini` | `/v1/videos/tasks` |
| `@hypit/seedance@1#seedance-2.5` | `seedance-2.5` | `/v1/videos/tasks` |
| `@hypit/minimax-h3@1#minimax-h3` | `minimax-h3` | `/v1/videos/tasks` |
| `@hypit/grok-imagine@1#grok-imagine-video-1.5-preview` | `grok-imagine-video-1.5` | `/v1/videos/tasks` |
| `@hypit/gpt-image@1#gpt-image-2` | `gpt-image-2` | `/v1/images/tasks` |
| `@hypit/nano-banana@1#nano-banana-2` | `nano-banana-2` | `/v1/images/tasks` |
| `@hypit/nano-banana@1#nano-banana-pro` | `nano-banana-pro` | `/v1/images/tasks` |

BeatAPI documents further models, including Veo, Kling, Wan 3.0 and HappyHorse; this Provider maps
only the models the Distribution already describes.

One BeatAPI alias serves every input mode, so the request shape alone decides which arrays travel:
`reference_images`, `reference_videos` and `reference_audios` carry subject references, while the
opening and closing frames travel as one ordered `images` array. `duration`, `aspect_ratio`,
`resolution` and Seedance's `generate_audio` keep their authored values. Nano Banana 2 spells its
JPEG output `jpeg`, so an authored `output-format="jpg"` is sent as that.

Service limits this Provider reports as unsupported before uploading any reference:

- Seedance has no `web_search` field, and `seedance-2-mini` renders no generated audio. An authored
  `false` is dropped; an authored `true` is refused.
- Seedance 2 does not render 1080p together with reference images.
- Seedance 2.5 takes 4 to 30 seconds, so `duration="-1"` for an automatic length is refused.
- MiniMax H3 orders its two frames first then last, so a last frame needs a first frame.
- Grok Imagine 1.5 accepts at most one image at 1080p.
- GPT Image 2 has no `background` field.
- Nano Banana 2 accepts up to ten reference images and does not render `1:4`, `4:1`, `1:8` or `8:1`.

Seedance visual references carry `person-reference`; the Provider accepts the declaration and
transmits nothing for it, since BeatAPI's task body has no field for it.

Referenced Resources are uploaded to `POST /v1/files` with `purpose=input`, and the returned HTTPS
URL travels in the task body. The service accepts PNG, JPEG and WebP images and MP3, WAV, AAC and
M4A audio up to 50 MB each, and MP4 and MOV video up to 100 MB; a reference outside those types or
sizes is reported before submission. One Resource is uploaded once per Runtime operation. Embedded
callers may replace that transport with `publicAssetUrl(artifact, resources, fields)`, which must
return a URL BeatAPI can fetch.

Runtime Profile example:

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {
    "platform": {
      "use": "@hypit/credential-store-platform"
    }
  },
  "endpoints": {
    "beatapi.default": {
      "use": "@hypit/provider-beatapi",
      "pool": "beatapi.default",
      "config": {
        "apiKey": { "store": "platform", "key": "beatapi.api-key" },
        "defaultConcurrency": 3,
        "pollIntervalMs": 10000
      }
    }
  },
  "bindings": {}
}
```

`baseUrl` defaults to `https://api.beatapi.io`. Store the API key with
`hypit auth login beatapi.default --runtime hypit.runtime.json`. Optional `requestTimeoutMs`,
`operationTimeoutMs` and `actionLimits` bound single HTTP calls, the whole remote task and action
concurrency. Each submission sends the Runtime operation as its `Idempotency-Key`, so a retried
submission of the same body resolves to the same task.

HTTP failures keep BeatAPI's `error.code`, message, `request_id` and any `retry_after_seconds`; a
`failed` task keeps its `error_code` and `error_message`. Any URL inside a surfaced reason is
redacted, since a hosted result URL is an access capability rather than diagnostic content.
