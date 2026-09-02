# `@hypit/provider-hypihub`

Thin Hypit Runtime Provider for a HypiHub deployment. It is an optional default gateway for
paid generation and Gemini VLM requests; callers may keep their own Provider and select HypiHub only
when its OAuth login is configured.

It maps the currently shipped image/video model capabilities to HypiHub, including image edits and
image-to-video first-frame inputs, submits jobs, polls them, downloads the first-class assets and
persists them in Hypit's configured ArtifactStore. Image references use HypiHub's documented
`reference_images` object shape (`[{ "url": "…" }]`); video references use the public
`reference_image_urls`, `reference_videos`, and `reference_audios` fields (with `ref_video_url`
for one video). First/last-frame images use `first_frame` and `last_frame`. It also
exports a small Gemini-native VLM generator for callers that previously used Vertex.

Runtime Profile example:

```json
{
  "endpoints": {
    "hypihub.default": {
      "use": "@hypit/provider-hypihub",
      "pool": "hypihub.default",
      "config": {
        "baseUrl": "https://hypit.ai",
        "apiKey": { "store": "os", "key": "hypihub.oauth" },
        "defaultConcurrency": 3,
        "pollIntervalMs": 10000
      }
    }
  }
}
```

Gemini VLM is also exposed as the provider-neutral `@hypit/gemini` Runtime capability, so an Author
Source can select the exact model while the Runtime chooses HypiHub or Vertex. Existing embedded
callers can still use the exported `createHypiHubGeminiGenerator`. Run `hypit auth login hypihub.default --runtime hypit.runtime.json` to sign in with HypiHub OAuth (and optionally set `HYPIHUB_BASE_URL`; either the origin or
an existing `/v1`/`/v1beta` base is accepted) only when choosing HypiHub. The Runtime Provider also
accepts the origin or either versioned base and normalizes it to `/v1`; missing or insufficient user
credentials should be resolved at [hypit.ai](https://hypit.ai). Referenced image, audio and video
Artifacts are uploaded automatically. The Provider first sends the file size and SHA-256 to
`POST /v1/files/uploads`; HypiHub keeps small files on the established `POST /v1/files` route and
returns a private S3 multipart policy for large files. Large parts are then uploaded concurrently
through short-lived S3 Transfer Acceleration URLs, so the media bytes do not make an extra trip
through the HypiHub application server. A failed part alone is retried with a fresh signed URL.

The server owns the size threshold, part size, concurrency, and URL lifetime. Clients do not need
to duplicate that policy. `uploadPartTimeoutMs` (default five minutes) and `uploadPartAttempts`
(default three) only control client retry behavior. During a rolling server upgrade, an exact 404
from the policy endpoint falls back to the established multipart API. Signed S3 URLs are never
included in Provider error messages. Uploads remain deduplicated by Artifact digest within one
Runtime operation. Embedded callers may override the entire transport with `publicAssetUrl`.

The provider also serves `@hypit/whisperx#whisperx-alignment` through HypiHub's synchronous
`/v1/audio/transcriptions` endpoint using `victor-upmeet/whisperx`. It always requests
`verbose_json` with both segment- and word-level timestamps, then converts HypiHub's OpenAI-shaped
seconds into Hypit's 16 kHz sample-domain `AlignedTranscriptEvidence`. Override the model with
`whisperxModel` only when the HypiHub catalog exposes a compatible replacement.

HypiHub exposes MiMo VoiceDesign by default. Set `audio: false` only when the user explicitly selects
another VoiceDesign Provider. Hypit does not expose MiMo preset-voice or voice-cloning models.
