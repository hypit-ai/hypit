# `@hypit/provider-hypihub`

Thin Hypit Runtime Provider for a HypiHub deployment. It is an optional default gateway for
paid generation and WhisperX alignment requests. Select it for a chosen HypiHub account, with OAuth
or an API key in the configured Credential Store; other Providers remain ordinary Profile choices.

`doctor` is read-only. If a stored OAuth access token needs refresh, it reports that account access
and refresh validity remain unchecked; it does not rotate credentials or conclude that their Store
is read-only. Authorized execution and pricing reads retain the normal refresh-and-persist path.
An actual refresh rejection calls for reconnecting the selected account.

Its mapping table declares the image/video/speech model capabilities it implements, including image edits and
image-to-video first-frame inputs, submits jobs, polls them, downloads the first-class assets and
admits them into the current Build's working byte area. Image references use HypiHub's documented
`reference_images` object shape (`[{ "url": "…" }]`); video references use the public
`reference_image_urls`, `reference_videos`, and `reference_audios` fields. A single reference video
remains in `reference_videos`; `ref_video_url` is reserved for a model's source-video port. First/last-frame images use `first_frame` and `last_frame`.

Seedance 2.5 (`@hypit/seedance` model `2.5`) maps to `seedance-2.5` and supports
`480p`, `720p` and `1080p`. The Provider passes the authored `resolution` to `POST /v1/videos`;
omitting it in the Seedance Surface defaults to `720p`.

The current HypiHub GPT Image 2 route has these service-specific limits:

| Resolution | Ratios unavailable at this Endpoint | `background` |
| --- | --- | --- |
| `1K` | none | optional |
| `2K` | `5:4`, `4:5`, `3:1`, `1:3`, `9:21` | omit |
| `4K` | `3:1`, `1:3`, `9:21` | omit |

HypiHub owns this support check independently: it leaves the GPT Image model package unchanged. When the service surface changes, this Provider can change without changing
the model or another Provider.

Model identity is preserved across input modes: Seedream 5 Lite references use the Lite image-edit
route, and Grok 1.5 Preview remains the Preview model. A deployment's current catalogue may offer
newer models or omit one implemented here. Availability and unsupported-input errors retain their
service explanation; they do not imply expired credentials or authorize substituting another model.

For moving portraits, [Volcengine Matting](../volcengine-matting/README.md) maps
`@hypit/volcengine-matting@1#matte-portrait-video` to `POST /v1/videos` with
`model: "matte-portrait-video"`, `ref_video_url` and `format` (`WEBM` by default, or `MOV`).
Both formats carry transparency. The source video uses the same upload transport as other video
references; the returned job uses the same polling and asset collection lifecycle. The selected
account's `/v1/models` establishes availability. The processed video enters ordinary Normalize,
then either semantic alignment for a Script performance or Media Track for B-roll.

[Background Removal](../background-removal/README.md) declares a separate single-image capability.
This Provider does not currently implement it; select a project Provider for that operation.

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

Remote transcription exposes the same `@hypit/whisperx` alignment capability implemented by the local
WhisperX Provider. The Runtime Profile selects which Endpoint serves it. Run
`hypit auth login hypihub.default --runtime hypit.runtime.json` to sign in with HypiHub OAuth when
choosing HypiHub. A Profile may set `baseUrl`
to the selected deployment's origin or an existing `/v1`/`/v1beta` base. The Runtime Provider
normalizes it to `/v1`; missing or insufficient user
credentials should be resolved at [hypit.ai](https://hypit.ai). Referenced image, audio and video
Resources are uploaded through a session from `POST /v1/files/uploads`, followed by the private
regional multipart instructions returned by HypiHub. The Provider follows the server-selected part
size and part concurrency, retries a failed part with a fresh signed URL, completes or cancels that
one upload, and then passes the returned HTTPS URL to generation or transcription. One
Resource identity with the same declared person-reference classification is uploaded once within one Runtime operation. Hypit keeps no upload catalog or
cross-Build cache. Seedance visual references can carry `personReference` in their media fields;
the mapping declares it as a resource-transport field and the upload session receives
`is_person_reference`, preserving true, false and omission. It stays out of the generation body.
HypiHub stores the authored classification and prepares the applicable upstream person reference;
this Provider does not detect faces or select an upstream private-avatar group.

Embedded callers may replace transport with `publicAssetUrl(artifact, resources, fields)`. That
callback receives the declared resource fields and must preserve any required service preparation,
such as uploading a marked person reference through HypiHub before returning its URL.

OAuth login stores the access token, refresh token and expiry as one opaque credential value. The
browser callback only confirms that authorization returned to the CLI; the CLI reports success after
the bounded token exchange and Credential Store write complete. `oauthRequestTimeoutMs` controls that
exchange and defaults to 30 seconds, independently of the longer inference request timeout. The
Provider refreshes that value shortly before expiry or after an unauthorised response when the
selected Store is writable. Its Endpoint receives only the credential slot it declared and a narrow
operation for replacing that same slot; it cannot enumerate the Store, choose another key or read
another Endpoint's credentials. A raw credential remains an ordinary static API key.

The service currently requires whole-file and per-part SHA-256 values as fields of its signed upload
protocol. They exist only while transferring bytes; Hypit never uses them as Resource identity,
Result metadata, lookup keys or reuse evidence. Signed URLs and their query credentials are removed
from surfaced upload errors.

The default remote alignment model is `victor-upmeet/whisperx`; `transcriptionModel` may select another
HypiHub model that exposes the `transcriptions` route. `hypit doctor` reads the authenticated model
catalog to verify configured capabilities; ordinary preflight never makes that request. The package
declares HypiHub's public pricing page, `https://hypit.ai/commercial/pricing/`, as its price source.
For each selected Need, `readPricing` resolves the corresponding HypiHub model and returns the service's
authenticated `GET /v1/pricing?model=<model>` response unchanged together with that URL. It covers
generation, alignment, Voice Design and Voice Clone through the same mechanism;
the Provider does not maintain a second list of billing formulas or calculate a request total.

The Provider declares its implemented speech capabilities alongside image, video and alignment.
Voice Design produces an accepted voice-reference Resource, and Voice Clone uses that
reference to produce independent speech. All of them use `POST /v1/audio/speech`:

| Package | Capability | HypiHub model | Request fields |
| --- | --- | --- | --- |
| `@hypit/mimo-speech` | `mimo-v2.5-tts-voicedesign` | `mimo-v2.5-tts-voicedesign` | `input`, `voice_description` |
| `@hypit/mimo-speech` | `mimo-v2.5-tts-voiceclone` | `mimo-v2.5-tts-voiceclone` | `input`, `reference_audio`, optional `prompt` |
| `@hypit/fishaudio-speech` | `voice-design-1` | `fishaudio/voice-design-1` | `input`, `voice_description` |
| `@hypit/fishaudio-speech` | `voice-clone` | `fishaudio/voice-clone` | `input`, `reference_audio`, constant `voice_description` title |
| `@hypit/elevenlabs-speech` | `eleven_ttv_v3` | `eleven_ttv_v3` | `input`, `voice_description` |

Each returned preview becomes one member of the audio set. These Model packages do not expose preset
voices. When another selected Endpoint offers the same capability (such as local WhisperX or a project-owned speech
Provider), the Runtime Profile's `bindings` say which Endpoint serves it.

Execution policy remains local to this Provider:

| Profile field | Default | What it controls |
| --- | ---: | --- |
| `requestTimeoutMs` | 300 seconds | ordinary Provider HTTP requests |
| `oauthRequestTimeoutMs` | 30 seconds | OAuth token exchange and refresh |
| `pricingRequestTimeoutMs` | 30 seconds | authenticated pricing requests |
| `operationTimeoutMs` | 20 minutes | one remote asynchronous operation |
| `uploadConcurrency` | 8 | whole file sessions per origin/credential within this process |
| `uploadPartTimeoutMs` | 5 minutes | one upload part |
| `uploadPartAttempts` | 3 | attempts for one upload part |
| `downloadAttempts` | 3 | attempts to collect one result |

`defaultConcurrency` controls the total shared capacity of this Profile's HypiHub pool. Optional `capabilityConcurrency`
sets narrower group limits, for example `{ "seedance-2-mini": 2, "transcription": 1 }`.
Image/video/speech groups use the exact capability name; WhisperX uses `transcription`. These limits
coordinate this Runtime's requests; HypiHub remains
responsible for service-wide account limits. Immediate speech/transcription slots cover the
active HTTP invocation, while asynchronous image/video slots cover remote work until completion or local execution failure.

For asynchronous image/video jobs, `actionLimits` configures the common `submit`, `poll` and `collect`
admission budgets. Each accepts `concurrency` and `rate: { limit, periodMs }`, shared by the pool.
These limits count lifecycle actions; Provider-specific upload parts and HTTP requests remain inside
those actions. Synchronous speech and transcription retain their ordinary request capacity.

A submission, polling or collection error ends the local attempt. Known job IDs and credential
references remain available in Result receipts; a timeout with no ID is recorded as such. A job can
be inspected at `/jobs/<id>` and its generated assets at `/jobs/<id>/assets` on the selected API base.
The next production attempt uses a new Run and Build. Runtime bindings never switch from a user's
own Provider to HypiHub after a key, quota or transport failure.

`uploadConcurrency` bounds whole files inside the Provider transport. Uploader instances in the same
process share the limit for the same service origin and current credential; the smallest outstanding
limit applies. Token refresh can change that grouping. Separate processes are not coordinated by this
local limit. It is a positive safe integer; HypiHub still enforces its own account quota. Part
concurrency is separately negotiated by HypiHub for each file. These are transport limits inside a
Runtime action, not additional Build admission limits.

Signing, completing and cancelling a known upload session may retry temporary transport failures
within at most four attempts and the smaller of `requestTimeoutMs` or 120 seconds. A new upload
session is retried only after an explicit temporary 429 rejection; an unknown creation result ends
the attempt. Daily and storage quota errors fail immediately. Active part workers finish before the
session is cancelled. An unconfirmed cancellation logs its upload ID without exposing signed URLs.
OAuth refresh retries the rejected control request on the same session. None of this resumes a
failed Build or changes the selected Provider.
