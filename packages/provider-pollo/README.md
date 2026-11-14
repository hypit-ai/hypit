# `@hypit/provider-pollo`

Optional Provider, not installed with Hypit. Install in the video project:

```bash
npm install @hypit/provider-pollo
```

Hypit Runtime Provider for a [Pollo AI](https://docs.pollo.ai) API platform account. Each capability
posts `{ "input": … }` to the model's generation path with the `x-api-key` header, polls
`GET /v1/generation/{taskId}/status` until every generation reaches `succeed`, downloads each
generation's `url` and stores the files in the current Build.

| Capability | Pollo generation path |
| --- | --- |
| `@hypit/minimax-h3#minimax-h3` | `/v1/generation/minimax/minimax-h3/video` |
| `@hypit/grok-imagine#grok-imagine-video-1.5-preview` | `/v1/generation/xai/grok-imagine-video-1-5/video` |
| `@hypit/gpt-image#gpt-image-2` | `/v1/generation/openai/gpt-image-2/image` |
| `@hypit/nano-banana#nano-banana-2` | `/v1/generation/google/nano-banana-2/image` |
| `@hypit/nano-banana#nano-banana-pro` | `/v1/generation/google/nano-banana-pro/image` |

Pollo documents further models; this Provider maps only the models the Distribution already
describes. Seedance and Seedream are not offered by Pollo.

MiniMax H3 requests send `prompt`, `duration`, `resolution` and `aspectRatio`; a first frame is
`image`, a last frame `imageTail`, and reference images, videos and audio become typed entries of
`refs`. Pollo renders 480p when `resolution` is omitted.

Service limits this Provider reports as unsupported before submitting:

- Grok Imagine 1.5 animates exactly one image and has no aspect-ratio field; author
  `aspect-ratio="auto"`.
- GPT Image 2 renders `1:1`, `3:2`, `2:3`, `16:9`, `9:16`, `4:3`, `3:4`, `21:9` and `auto`;
  other ratios are unsupported. Pollo's `quality` field is left at its default.
- Nano Banana takes an explicit aspect ratio, not `auto`. `output-format` has no Pollo field and is
  not sent.

Pollo accepts reference media only by HTTP(S) URL. Configure `publicAssetUrl` when embedding the
Provider; without it, a request with reference media fails before submission, while text-only
requests proceed.

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
    "pollo.default": {
      "use": "@hypit/provider-pollo",
      "pool": "pollo.default",
      "config": {
        "apiKey": { "store": "local", "key": "pollo.api-key" },
        "defaultConcurrency": 3,
        "pollIntervalMs": 10000
      }
    }
  },
  "bindings": {}
}
```

`baseUrl` defaults to `https://pollo.ai/api/platform`. Store the API key with
`hypit auth login pollo.default --runtime hypit.generation-runtime.json`. Optional `requestTimeoutMs`,
`operationTimeoutMs` and `actionLimits` bound single HTTP calls, the whole remote task and action
concurrency. HTTP failures keep Pollo's `errorCode`, message and `requestId`; a failed generation
keeps its `failMsg`, with any signed URL in the message redacted. Pollo stores generated files for
14 days; the Provider downloads them when the task completes.
Polling transport failures and HTTP 429/5xx preserve the same task and honor standard `Retry-After`;
the scheduled wake never passes the original operation deadline. Other errors end the local attempt.
