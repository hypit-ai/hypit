# `@hypit/provider-monid`

Hypit Runtime Provider for a [Monid](https://monid.ai) workspace. It runs Monid's generation
endpoints through `POST /v1/run`, polls `GET /v1/runs/{runId}` until the run is terminal, downloads
every returned file and stores it in the current Build.

| Capability | Monid endpoint |
| --- | --- |
| `@hypit/seedance@1#seedance-2` | `bytedance` `/v1/video/seedance-2.0` |
| `@hypit/seedance@1#seedance-2-fast` | `bytedance` `/v1/video/seedance-2.0-fast` |
| `@hypit/seedance@1#seedance-2-mini` | `bytedance` `/v1/video/seedance-2.0-mini` |
| `@hypit/seedance@1#seedance-2.5` | `bytedance` `/v1/video/seedance-2.5` |
| `@hypit/minimax-h3@1#minimax-h3` | `minimax` `/v1/video/minimax-h3` |
| `@hypit/wan@1#wan-2.7-image` | `alibaba` `/v1/image/wan2.7-image` |
| `@hypit/wan@1#wan-2.7-image-pro` | `alibaba` `/v1/image/wan2.7-image-pro` |

Monid's catalogue lists further generation endpoints, including the H3 Fast, Max and Max Turbo
variants, Hailuo 2.3 and the Kling, Gemini and Qwen families; their models are not the ones the
Distribution describes. Input schemas are published through the authenticated `inspect` operation,
which is where the request bodies below come from.

The video endpoints relay a BytePlus ModelArk request: one `content` array holding the prompt and
each media input as a typed item with its `role` (`first_frame`, `last_frame`, `reference_image`,
`reference_video`, `reference_audio`), then `resolution`, `ratio` and `duration`.

The Seedance endpoints add `generate_audio`. Monid documents no web search field for them, so
`web-search="true"` is unsupported, and Seedance 2.5 frame mode (`first-frame` present) requires
`aspect-ratio="adaptive"`. Seedance visual references may carry `person-reference`; the Provider
accepts the declaration and transmits nothing for it, since the endpoint has no field for it.
Seedance rejects reference images and videos that contain a real human face; Monid offers no way to
register authorized portrait material, so such a request fails with the upstream moderation error.

MiniMax H3 names its model in the body and takes neither of those two fields. The endpoint requires
a resolution, so a request that states none is sent at `2K`, the resolution the HypiHub Provider
also selects. It also requires a ratio that is not `adaptive` for text-to-video, while frame mode
resolves the framing from the uploaded image and reference-to-video defaults to adaptive: a
text-to-video request carrying no `aspect-ratio` is reported unsupported before any reference is
resolved, and the other two modes are sent as `adaptive`. H3 returns its video at `content.url`
rather than the ModelArk `video_url`.

The Wan image endpoints take their fields directly: `prompt`, `images` as plain URLs, `size` for the
band, `n`, `enable_sequential`, `thinking_mode`, `watermark` and `seed`. Both variants accept the
same fields, and the Pro variant adds the `4K` band. Two service limits are reported before any
reference is resolved: `4K` renders from a prompt alone, without reference images or an image set,
and a request renders at most four pictures outside an image set. An image set returns several
files, so collection downloads each one.

The endpoints also document a custom colour palette and per-image bounding boxes. Neither has a
representation in the model port vocabulary, which carries scalars and media rather than object
arrays, so the Provider transmits neither.

Reference media are uploaded through the workspace file system Monid provides for this purpose
(`sfs`): `/put` signs an upload for `hypit/<resource>.<ext>`, the bytes are `PUT` to that URL, and
`/cat` mints a one-day download URL that the generation endpoint fetches. Uploaded files stay in the
workspace until removed with `/rm`. Embedded callers may replace this transport with
`publicAssetUrl`.

A run ends with Monid's own status (`COMPLETED`, `FAILED`, `BLOCKED`, `STOPPED`, `TIMED_OUT`) and,
when completed, the provider's HTTP status in `providerResponse`. A completed run whose provider
answered 4xx or 5xx fails with that status and the provider's error message; a `BLOCKED` run keeps
Monid's `reason`. Signed URLs in messages are redacted.

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
    "monid.default": {
      "use": "@hypit/provider-monid",
      "pool": "monid.default",
      "config": {
        "apiKey": { "store": "platform", "key": "monid.api-key" },
        "defaultConcurrency": 3,
        "pollIntervalMs": 10000
      }
    }
  },
  "bindings": {}
}
```

`baseUrl` defaults to `https://api.monid.ai`. Store the API key with
`hypit auth login monid.default --runtime hypit.runtime.json`. Optional `requestTimeoutMs`,
`operationTimeoutMs` and `actionLimits` bound single HTTP calls, the whole remote run and action
concurrency; file-system runs poll at most every five seconds within `requestTimeoutMs`.
