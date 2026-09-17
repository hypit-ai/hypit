# `@hypit/provider-monid`

Hypit Runtime Provider for a [Monid](https://monid.ai) workspace. It runs Monid's `bytedance`
Seedance endpoints through `POST /v1/run`, polls `GET /v1/runs/{runId}` until the run is terminal,
downloads the returned `video_url` and stores the video in the current Build.

| Capability | Monid endpoint |
| --- | --- |
| `@hypit/seedance@1#seedance-2` | `bytedance` `/v1/video/seedance-2.0` |
| `@hypit/seedance@1#seedance-2-fast` | `bytedance` `/v1/video/seedance-2.0-fast` |
| `@hypit/seedance@1#seedance-2-mini` | `bytedance` `/v1/video/seedance-2.0-mini` |
| `@hypit/seedance@1#seedance-2.5` | `bytedance` `/v1/video/seedance-2.5` |

Monid's catalogue also lists MiniMax H3 and other generation endpoints; their input schemas are
published only through the authenticated `inspect` operation, so this Provider maps the Seedance
endpoints whose request body Monid documents publicly.

The run `input` is the BytePlus ModelArk request the endpoint relays: one `content` array holding
the prompt and each media input as a typed item with its `role` (`first_frame`, `last_frame`,
`reference_image`, `reference_video`, `reference_audio`), then `resolution`, `ratio`, `duration` and
`generate_audio`. Monid documents no web search field for these endpoints, so `web-search="true"`
is unsupported. Seedance 2.5 frame mode (`first-frame` present) requires `aspect-ratio="adaptive"`.
Seedance visual references may carry `person-reference`; the Provider accepts the declaration and
transmits nothing for it, since the endpoint has no field for it.

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
  }
}
```

`baseUrl` defaults to `https://api.monid.ai`. Store the API key with
`hypit auth login monid.default --runtime hypit.runtime.json`. Optional `requestTimeoutMs`,
`operationTimeoutMs` and `actionLimits` bound single HTTP calls, the whole remote run and action
concurrency; file-system runs poll at most every five seconds within `requestTimeoutMs`.
