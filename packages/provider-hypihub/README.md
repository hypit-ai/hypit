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
Artifacts are uploaded automatically through `POST /v1/files`, then their returned HTTPS capability
URLs are used in image and video requests. One referenced Resource is uploaded once within one
Runtime operation. Embedded callers may override that transport with `publicAssetUrl`.

The default remote alignment model is `victor-upmeet/whisperx`; `transcriptionModel` may select another
HypiHub model that exposes the `transcriptions` route. `hypit doctor` reads the authenticated model
catalog to verify configured capabilities; ordinary preflight never makes that request. Each paid
offer can quote one exact Need from the current model card in HypiHub credits. Changing prices are not
copied into Hypit, and unsupported pricing modes remain explicitly unknown.

HypiHub exposes MiMo VoiceDesign by default. Set `audio: false` only when the user explicitly selects
another VoiceDesign Provider. Hypit does not expose MiMo preset-voice or voice-cloning models.
