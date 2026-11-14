# `@hypit/provider-hiapi`

Optional Provider, not installed with Hypit. Install in the video project:

```bash
npm install @hypit/provider-hiapi
```

Hypit Runtime Provider for a [HiAPI](https://www.hiapi.ai) account. Every capability submits one
task to `POST /v1/tasks` with the model's documented `input` fields, polls
`GET /v1/tasks/{taskId}` until the task is terminal, downloads `data.output[].url` and stores the
files in the current Build. Submission carries an `Idempotency-Key`, so a retried submission returns
the original task.

| Capability | HiAPI model |
| --- | --- |
| `@hypit/seedance#seedance-2` | `seedance-2.0` |
| `@hypit/seedance#seedance-2-fast` | `seedance-2.0-fast` |
| `@hypit/seedance#seedance-2-mini` | `seedance-2.0-mini` |
| `@hypit/seedance#seedance-2.5` | `seedance-2.5/reference-to-video` with a reference video, `seedance-2.5/image-to-video` with frames, reference images or reference audio, otherwise `seedance-2.5/text-to-video` |
| `@hypit/seedream#seedream-5-lite` | `seedream-5.0-lite/image-to-image` with references, otherwise `seedream-5.0-lite/text-to-image` |
| `@hypit/minimax-h3#minimax-h3` | `minimax-h3` |
| `@hypit/gpt-image#gpt-image-2` | `gpt-image-2/image-to-image` with references, otherwise `gpt-image-2/text-to-image` |
| `@hypit/nano-banana#nano-banana-2` | `Nano-Banana-2` |
| `@hypit/nano-banana#nano-banana-pro` | `Nano-Banana-Pro` |
| `@hypit/grok-imagine#grok-imagine-video` | `grok-imagine/image-to-video` with images, otherwise `grok-imagine/text-to-video` |
| `@hypit/grok-imagine#grok-imagine-video-1.5-preview` | `grok-imagine-1.5/image-to-video` |

HiAPI's model index at `https://www.hiapi.ai/docs/models.json` lists further models and routes;
this Provider maps only the models the Distribution already describes, on each model's standard
route.

Service limits this Provider reports as unsupported before submitting:

- `seedance-2.0-mini` has no `web_search` field; `web-search="true"` is unsupported there.
- `seedance-2.5/image-to-video` takes only `aspect-ratio="adaptive"`; `text-to-video` and
  `image-to-video` render 720p or 1080p, `reference-to-video` also 480p.
- Seedream 5.0 lite renders 2K (`quality="basic"`) or 4K (`quality="ultra"`); `high` (3K) is
  unsupported. `output-format` and `nsfw-check` have no HiAPI field and are not sent.
- `minimax-h3` renders 2K only and accepts up to five reference images; requests send
  `watermark: false`.
- GPT Image 2: `background` only at 1K; `auto` ratio only at 1K; 2K excludes `5:4`, `4:5`, `3:1`,
  `1:3`, `9:21`; 4K excludes `1:1`, `3:1`, `1:3`, `9:21`; image-to-image takes up to six references.
- Grok Imagine renders 480p or 720p; `grok-imagine-1.5/image-to-video` animates exactly one image.

Seedance visual references require `person-reference`; the Provider accepts the declaration and
transmits nothing for it, since HiAPI has no field for it.

Reference images and audio travel inline as `data:` URLs, which HiAPI documents for its Seedance
inputs, within the per-file sizes each model page states: 30 MB images and 15 MB audio for
`seedance-2.0-mini` and the Seedance 2.5 models (2.5 also caps combined images at 120 MB), 10 MB
images for `seedream-5.0-lite/image-to-image` and `grok-imagine/image-to-video`, 20 MB for
`grok-imagine-1.5/image-to-video`, 30 MB for `Nano-Banana-Pro`. The Provider checks these before
submitting. A reference video must be a public HTTPS URL; configure `publicAssetUrl` when embedding
the Provider, otherwise such a request fails before submission.

Runtime Profile example:

```json
{
  "format": "hypit.execution-environment-local@1",
  "dataRoot": ".hypit/environment/local",
  "credentials": {
    "local": {
      "use": "@hypit/credential-store-local"
    }
  },
  "endpoints": {
    "hiapi.default": {
      "use": "@hypit/provider-hiapi",
      "pool": "hiapi.default",
      "config": {
        "apiKey": { "store": "local", "key": "hiapi.api-key" },
        "defaultConcurrency": 3,
        "pollIntervalMs": 10000
      }
    }
  },
  "bindings": {}
}
```

`baseUrl` defaults to `https://api.hiapi.ai`. Store the API key with
`hypit auth login hiapi.default --runtime hypit.generation-runtime.json`. Optional `requestTimeoutMs`,
`operationTimeoutMs` and `actionLimits` bound single HTTP calls, the whole remote task and action
concurrency. HTTP failures keep HiAPI's `error_code` and message; failed tasks keep
`data.error.code` and message, with any signed URL in the message redacted.
Polling transport failures and HTTP 429/5xx preserve the same task and honor standard `Retry-After`;
the scheduled wake never passes the original operation deadline. Other errors end the local attempt.
