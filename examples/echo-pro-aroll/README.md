# Echo Pro A-roll

Complete four-take Seedance Mini talking-head film with measured captions.

Supply these ignored local assets before checking or building:

- `presenter-clean.png`
- `presenter-with-echo.png`
- `presenter-voice.mp3`

Every take uses the same voice-timbre reference. The visual reference sequence is clean, product,
product, clean.

`@svml/seedance-speaker` binds the reusable project SVS Recipe, Script dialogue and explicit
references into a Prompt Kit Invocation. The generic `@svml/prompt-kit` author compiler applies the
separately imported `official-ugc-v1.svs` mapping. It emits an ordered Prompt Program and exact
Seedance Speech Program while compiling `main.svml`; neither operation is a Runtime task.
The four generated videos are normalized and concatenated into one Speech Spine. One canonical
audio projection goes through WhisperX, direct Script alignment produces the complete SemanticMap,
Gemini plans Cue cuts and the `important` field without seeing timing, and the resulting Caption
VisualTrack joins the peer speech visual/audio Tracks in Film. HyperFrames renders and muxes the
single `final.video` target.

The current deterministic estimate is 12, 15, 15 and 15 seconds. The Recipe deliberately caps a
take at Seedance's 15-second request limit.

Create the explicit package lock used by this development-workspace example:

```sh
pnpm svml lock-packages examples/echo-pro-aroll/svml.packages.lock \
  --package @svml/artifact \
  --package @svml/contracts \
  --package @svml/media \
  --package @svml/svs \
  --package @svml/script \
  --package @svml/estimate \
  --package @svml/prompt-kit \
  --package @svml/generation \
  --package @svml/seedance \
  --package @svml/seedance-speaker \
  --package @svml/speech-align \
  --package @svml/speech-take \
  --package @svml/speech-program \
  --package @svml/whisperx \
  --package @svml/caption \
  --package @svml/caption-gemini \
  --package @svml/film \
  --package @svml/hyperframes \
  --package @svml/media-pipeline \
  --package @svml/hyperframes-render \
  --package @svml/run-text \
  --root .

pnpm svml lock-packages examples/echo-pro-aroll/svml.runtime-packages.lock \
  --package @svml/provider-kie \
  --package @svml/provider-media-local \
  --package @svml/provider-whisperx-local \
  --package @svml/provider-google-vertex \
  --package @svml/provider-hyperframes-local \
  --root .
```

Inspect all authored outputs—including `*.prompt` and `*.program`—without a paid call:

```sh
pnpm svml check examples/echo-pro-aroll/main.svml \
  --package-lock examples/echo-pro-aroll/svml.packages.lock \
  --root .
```

Inspect the exact paid plan before submitting it:

```sh
pnpm svml plan examples/echo-pro-aroll/build.svrun \
  --package-lock examples/echo-pro-aroll/svml.packages.lock \
  --root .
```

Build the complete film after starting the local WhisperX sidecar and exposing `KIE_API_KEY`,
`GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`:

```sh
pnpm svml build examples/echo-pro-aroll/build.svrun \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --package-lock examples/echo-pro-aroll/svml.packages.lock \
  --root . \
  --build-id echo-pro-film-001 \
  --follow

pnpm svml get echo-pro-film-001 \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --name final.video \
  --to examples/echo-pro-aroll/output/final.mp4
```

Run the same downstream film from the four archived generated shots without another Seedance
submission:

```sh
pnpm svml build examples/echo-pro-aroll/reuse-generated.svrun \
  --runtime examples/echo-pro-aroll/svml.runtime.json \
  --package-lock examples/echo-pro-aroll/svml.packages.lock \
  --root . \
  --build-id echo-pro-film-reuse-001 \
  --follow
```

`reuse-generated.svrun` names the four public shot aliases from `echo-pro-film-001`, exposes each
verified historical Record as a zero-input Candidate and explicitly satisfies the corresponding
logical output as `substitute`. Reverse demand therefore removes all four Seedance branches while
keeping media normalization, WhisperX, Gemini planning, Film and rendering reachable. This is a new
Build, not a continuation or automatic cache hit.

The package lock lists independent packages. It is not a hidden video bundle, and the video CLI
contains no authoring or Run-language package by default.
