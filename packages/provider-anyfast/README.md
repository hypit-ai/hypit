# `@hypit/provider-anyfast`

Hypit Provider for AnyFast's documented ByteDance `seedance-2.0` video endpoint.
It implements the exact `@hypit/seedance@1#seedance-2` capability through the
asynchronous workflow documented by AnyFast:

- `POST https://www.anyfast.ai/v1/video/generations`
- `GET https://www.anyfast.ai/v1/video/generations/{task_id}`
- download the presigned `result_url` after `SUCCESS`

The Provider sends `model: "seedance-2.0"` and builds the ordered `content`
array required by AnyFast. It supports text-to-video, first/last-frame image
inputs, multimodal image/video/audio references, generated audio, the documented
resolutions (`480p`, `720p`, `1080p`, `4k`), ratios and 4–15 second durations.
Web Search is sent only for text-to-video requests because that is the boundary
in the public contract.

AnyFast documents Base64 inputs for images and audio, so the Provider resolves
those Resources into request-scoped data URLs. AnyFast documents video inputs as
HTTPS URLs or `asset://` references; a video reference therefore requires the
optional `publicAssetUrl` callback when the Provider is used programmatically.
The Runtime Profile below intentionally has no hidden uploader and will refuse a
video reference before a paid task is submitted.

The API key is a platform CredentialStore value under
`anyfast.seedance-2.api-key`. It never appears in a Runtime Profile, request
body, receipt, result URL, source file or log. Result downloads never receive
the API Bearer token because AnyFast returns a presigned URL.

After selecting this Profile for a project, check and enter the key through the
same credential flow as every other Endpoint:

```bash
hypit auth status anyfast.seedance-2 --runtime ./hypit.runtime.json
hypit auth login anyfast.seedance-2 --runtime ./hypit.runtime.json
```

The login command writes to the selected platform CredentialStore. Do not replace
the `apiKey` reference with the key value in this JSON file.

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/anyfast",
  "credentials": {
    "platform": { "use": "@hypit/credential-store-platform" }
  },
  "endpoints": {
    "anyfast.seedance-2": {
      "use": "@hypit/provider-anyfast",
      "pool": "anyfast.seedance-2",
      "config": {
        "baseUrl": "https://www.anyfast.ai",
        "apiKey": { "store": "platform", "key": "anyfast.seedance-2.api-key" },
        "defaultConcurrency": 1,
        "pollIntervalMs": 10000,
        "requestTimeoutMs": 120000,
        "operationTimeoutMs": 1800000
      }
    }
  },
  "bindings": {
    "@hypit/seedance@1#seedance-2": "anyfast.seedance-2"
  }
}
```

The returned video is a candidate artifact. The surrounding production flow
still owns source-locking, deterministic compositing, the single downstream
voice mix, media QA and human review. This package does not submit a real task
until a Build explicitly invokes the Endpoint.

AnyFast's documented API has no cancellation operation. Cancelling a Hypit Build
stops local observation and makes a best-effort Provider cancellation call only
where the service supports one; an already submitted AnyFast task may continue
remotely and remain billable. Check the task in AnyFast when a local Build is
cancelled or times out.

The implementation follows the public docs supplied with this integration:
[Seedance 2.0](https://docs.anyfast.ai/zh/guides/model-api/bytedance/seedance-2-0)
and [Doubao API reference](https://docs.anyfast.ai/zh/api-reference/endpoints/doubao).
