# `@hypit/provider-tokendance`

Hypit Runtime Provider for a [TokenDance](https://tokendance.space) account. It submits generation
requests with a TokenDance API key through the gateway protocols TokenDance documents for each model
and stores the returned files in the current Build.

| Capability | TokenDance model | Protocol |
| --- | --- | --- |
| `@hypit/seedance@1#seedance-2` | `seedance-2.0` | Ark `POST /ark/v3/generations/tasks`, polled at `GET /ark/v3/generations/tasks/{id}` |
| `@hypit/seedance@1#seedance-2-fast` | `seedance-2.0-fast` | same |
| `@hypit/seedance@1#seedance-2-mini` | `seedance-2.0-mini` | same |
| `@hypit/seedance@1#seedance-2.5` | `seedance-2.5` | same |
| `@hypit/seedream@1#seedream-5-lite` | `seedream-5.0-lite` | Ark `POST /ark/v3/images/generations`, synchronous |
| `@hypit/minimax-h3@1#minimax-h3` | `minimax-h3` | MiniMax `POST /minimax/v2/video_generation`, polled at `GET /minimax/v2/query/video_generation/{id}` |

The TokenDance catalogue at `GET /gateway/v1/models` lists further models; this Provider maps only
the models the Distribution already describes.

Video requests write the prompt and each media input as one item of the protocol's `content`
array with its `role` (`first_frame`, `last_frame`, `reference_image`, `reference_video`,
`reference_audio`), then `resolution`, `ratio`, `duration` and, for Seedance, `generate_audio`;
`web-search="true"` adds `tools: [{ "type": "web_search" }]`. Seedance visual references may carry
`person-reference`; the Provider accepts the declaration and transmits nothing for it, since the Ark
protocol has no such field. Seedance 2.0 and 2.5 reject reference images and videos that contain a
real human face; TokenDance offers no way to register authorized portrait material, so such a request
fails with the service's moderation error.

Seedream requests send the Ark `size` in pixels: the authored `quality` selects the 2K, 3K or 4K
tier and `aspect-ratio` the entry from the Ark reference table for Seedream 5.0 lite. Output uses
`response_format: "url"` and `watermark: false`. `nsfw-check` has no Ark field and is not sent.

Service limits this Provider reports as unsupported before submitting:

- Seedance 2.5 frame mode (`first-frame` present) requires `aspect-ratio="adaptive"`.
- MiniMax H3 text-to-video requires an explicit `aspect-ratio`; frame and reference modes may omit it.

Reference media travel inline as `data:` URLs where the protocol documents Base64 input: images and
audio for Ark, every media kind for MiniMax. An Ark reference video needs a public URL; configure
`publicAssetUrl` when embedding the Provider, otherwise such a request fails before submission.

Runtime Profile example:

```json
{
  "endpoints": {
    "tokendance.default": {
      "use": "@hypit/provider-tokendance",
      "pool": "tokendance.default",
      "config": {
        "apiKey": { "store": "platform", "key": "tokendance.api-key" },
        "defaultConcurrency": 3,
        "pollIntervalMs": 10000
      }
    }
  }
}
```

`baseUrl` defaults to `https://tokendance.space/gateway`. Store the API key with
`hypit auth login tokendance.default --runtime hypit.runtime.json`. Optional `requestTimeoutMs`,
`operationTimeoutMs` and `actionLimits` bound single HTTP calls, the whole remote task and action
concurrency. Task and HTTP failures keep TokenDance's `error.code` and message, with any signed URL
in the message redacted.
