# `@hypit/provider-hypihub`

Thin Hypit Runtime Provider for a HypiHub deployment. It is an optional default gateway for
paid generation, Gemini VLM and WhisperX alignment requests; callers may keep their own Provider and select HypiHub only
when its OAuth login is configured.

It maps the currently shipped image/video model capabilities to HypiHub, including image edits and
image-to-video first-frame inputs, submits jobs, polls them, downloads the first-class assets and
admits them into the current Build's working byte area. Image references use HypiHub's documented
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

Gemini VLM is exposed as the Provider-neutral `@hypit/gemini` Runtime capability, and remote
transcription is exposed as the same `@hypit/whisperx` alignment capability implemented by the local
WhisperX Provider. An Author
Source can select the exact model while the Runtime chooses HypiHub or Vertex. Existing embedded
callers can still use the exported `createHypiHubGeminiGenerator`. Run `hypit auth login hypihub.default --runtime hypit.runtime.json` to sign in with HypiHub OAuth (and optionally set `HYPIHUB_BASE_URL`; either the origin or
an existing `/v1`/`/v1beta` base is accepted) only when choosing HypiHub. The Runtime Provider also
accepts the origin or either versioned base and normalizes it to `/v1`; missing or insufficient user
credentials should be resolved at [hypit.ai](https://hypit.ai). Referenced image, audio and video
Resources are uploaded through a session from `POST /v1/files/uploads`, followed by the private
regional multipart instructions returned by HypiHub. The Provider follows the server-selected part
size and concurrency, retries only a failed part with a fresh signed URL, completes or cancels that
one upload, and then passes the returned HTTPS URL to generation, Gemini or transcription. One
Resource identity is uploaded once within one Runtime operation. Hypit keeps no upload catalog or
cross-Build cache. Embedded callers may replace this transport with `publicAssetUrl`.

The service currently requires whole-file and per-part SHA-256 values as fields of its signed upload
protocol. They exist only while transferring bytes; Hypit never uses them as Resource identity,
Result metadata, lookup keys or reuse evidence. Signed URLs and their query credentials are removed
from surfaced upload errors.

The default remote alignment model is `victor-upmeet/whisperx`; `transcriptionModel` may select another
HypiHub model that exposes the `transcriptions` route. `hypit doctor` reads the authenticated model
catalog to verify configured capabilities; ordinary preflight never makes that request. The package
declares HypiHub's public pricing page, `https://hypit.ai/commercial/pricing/`, as its price source;
`hypit plan --runtime <profile>` prints it beside each request this Endpoint would serve. Per-model
credit costs are never copied into Hypit.

HypiHub declares MiMo Voice Design and Voice Clone together with every other capability it serves; it
never hides one. Voice Design produces an accepted voice-reference Resource, and Voice Clone uses
that reference to produce independent speech. Hypit does not expose MiMo preset voices. When another
selected Endpoint offers the same capability (a local WhisperX, a Vertex Gemini, or the official MiMo
Provider), the Runtime Profile's `bindings` say which Endpoint serves it.

Execution policy remains local to this Provider. A profile may set `requestTimeoutMs`,
`operationTimeoutMs`, `uploadPartTimeoutMs`, `uploadPartAttempts`, `downloadAttempts`,
`geminiRateLimitAttempts` and `geminiRateLimitRetryDelayMs`; defaults are respectively 300 seconds,
20 minutes, 5 minutes, 3 attempts, 3 attempts, 4 attempts and 2 seconds. `defaultConcurrency`
controls the total shared capacity of this Profile's HypiHub pool. Optional `capabilityConcurrency`
sets narrower group limits, for example `{ "seedance-2-mini": 2, "gemini": 3, "transcription": 1 }`.
Image/video/speech groups use the exact capability name; all Gemini capabilities share `gemini`, and
WhisperX uses `transcription`. These limits coordinate this Runtime's requests; HypiHub remains
responsible for service-wide account limits. Immediate speech/Gemini/transcription slots cover the
active HTTP invocation, while asynchronous image/video slots remain held until the remote job ends.

For asynchronous jobs, a polling error retains the same job and its capacity. An operation deadline
records failure but continues observing remote termination without downloading the output. Unknown
submission acknowledgements are never automatically resubmitted. Runtime bindings never switch from
a user's own Provider to HypiHub after a key, quota or transport failure.

Multipart concurrency is different: HypiHub
selects it for one upload session, and it does not create a Build queue or a second Runtime pool.
