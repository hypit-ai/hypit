# `@hypit/provider-higgsfield`

Hypit Runtime Provider for a [Higgsfield](https://docs.higgsfield.ai/docs) account. Every capability
posts one workflow endpoint under `https://api.higgsfield.ai`, polls the `status_url` the service
returns until the request is terminal, downloads `video.url` and stores the file in the current Build.

| Capability | Higgsfield endpoint |
| --- | --- |
| `@hypit/seedance@1#seedance-2` | `bytedance/seedance-2.0/reference-to-video` with references, `bytedance/seedance-2.0/image-to-video` with frames, otherwise `bytedance/seedance-2.0/text-to-video` |
| `@hypit/seedance@1#seedance-2.5` | `bytedance/seedance-2.5/reference-to-video` with references, `bytedance/seedance-2.5/image-to-video` with frames, otherwise `bytedance/seedance-2.5/text-to-video` |

Higgsfield names one endpoint path per model and workflow rather than carrying a model field, so a
route here is that path. The [model reference](https://docs.higgsfield.ai/docs/models.md) documents
Seedance 2.0, Seedance 2.5, Kling 3.0 and Wan 3.0 for video and the SOUL, Marketing Studio, Recraft
and Grok image models; this Provider maps the two the Distribution already describes. The
[console catalogue](https://console.higgsfield.ai) lists the rest.

Service limits this Provider reports as unsupported before submitting:

- No Seedance workflow has a `web_search` field; `web-search="true"` is unsupported.
- Automatic duration (`-1`) is unsupported; every workflow takes whole seconds.
- Seedance 2.5 renders 480p or 720p here, not the model's 1080p. Seedance 2.0 renders 480p to 4k.
- `image-to-video` frames from the supplied image and declares no `aspect_ratio` field, so it takes
  `aspect-ratio="adaptive"`. `text-to-video` and `reference-to-video` require an explicit ratio.

Seedance visual references require `person-reference`; the Provider accepts the declaration and
transmits nothing for it, since Higgsfield has no field for it.

## Reference media

Higgsfield accepts input media only as a public URL, so each reference travels through its
[presigned upload](https://docs.higgsfield.ai/docs/concepts/file-uploads.md): `POST
/files/generate-upload-url` for a ticket, then `PUT` to the returned storage URL with the headers it
supplies. The account key goes only to the Higgsfield API, never to the storage URL. The documented
content types are `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif`, `audio/wav`,
`audio/x-wav` and `video/mp4`; another type is refused before submission rather than silently
dropped. Configure `publicAssetUrl` when embedding the Provider to publish references yourself
instead.

## Credentials

A Higgsfield credential is a key ID and a secret, created in the
[Console](https://console.higgsfield.ai). Store the pair as one `KEY_ID:KEY_SECRET` secret; requests
carry it as `Authorization: Key KEY_ID:KEY_SECRET`.

```bash
hypit auth login higgsfield.default
```

## Runtime Profile example

```json
{
  "format": "hypit.runtime-local@1",
  "dataRoot": ".hypit/runtimes/local",
  "credentials": {
    "os": {
      "use": "@hypit/credential-store-os"
    }
  },
  "endpoints": {
    "higgsfield.default": {
      "use": "@hypit/provider-higgsfield",
      "config": {
        "baseUrl": "https://api.higgsfield.ai",
        "apiKey": {
          "store": "os",
          "key": "higgsfield.api-key"
        }
      }
    }
  },
  "bindings": {
    "@hypit/seedance@1#seedance-2": "higgsfield.default",
    "@hypit/seedance@1#seedance-2.5": "higgsfield.default"
  }
}
```

`config` also accepts `defaultConcurrency`, `actionLimits`, `pollIntervalMs`, `requestTimeoutMs` and
`operationTimeoutMs`. Requests are cancellable only while every job is still queued, which the
Endpoint reports as `too-late` once generation has started.
