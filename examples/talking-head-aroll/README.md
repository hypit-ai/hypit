# Talking Head A-roll

Complete four-take Seedance Mini talking-head film with measured captions.

Supply these ignored local assets before checking or building:

- `presenter-clean.png`
- `presenter-alt.png`
- `presenter-voice.mp3`

Every take uses the same voice-timbre reference. The visual reference sequence is base, alternate,
alternate, base.

`@narratage/seedance-speaker` binds the reusable project SVS Recipe, Script dialogue and explicit
references into a Prompt Kit Invocation. The generic `@narratage/prompt-kit` author compiler applies the
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
pnpm narratage lock-packages examples/talking-head-aroll/svml.packages.lock \
  --package @narratage/artifact \
  --package @narratage/narrative \
  --package @narratage/media \
  --package @narratage/program-space \
  --package @narratage/speech \
  --package @narratage/speech-evidence \
  --package @narratage/semantic-map \
  --package @narratage/visual-ir \
  --package @narratage/composition \
  --package @narratage/svs \
  --package @narratage/script \
  --package @narratage/estimate \
  --package @narratage/prompt-kit \
  --package @narratage/generation \
  --package @narratage/seedance \
  --package @narratage/seedance-speaker \
  --package @narratage/speech-alignment \
  --package @narratage/speech-basis \
  --package @narratage/speech-spine \
  --package @narratage/whisperx \
  --package @narratage/caption \
  --package @narratage/caption-gemini \
  --package @narratage/film \
  --package @narratage/hyperframes \
  --package @narratage/media-pipeline \
  --package @narratage/render-hyperframes \
  --package @narratage/run-text \
  --root .

pnpm narratage lock-packages examples/talking-head-aroll/svml.runtime-packages.lock \
  --package @narratage/provider-kie \
  --package @narratage/provider-media-local \
  --package @narratage/provider-whisperx-local \
  --package @narratage/provider-google-vertex \
  --package @narratage/provider-hyperframes-local \
  --root .
```

Inspect all authored outputs—including `*.prompt` and `*.program`—without a paid call:

```sh
pnpm narratage check examples/talking-head-aroll/main.svml \
  --package-lock examples/talking-head-aroll/svml.packages.lock \
  --root .
```

Inspect the exact paid plan before submitting it:

```sh
pnpm narratage plan examples/talking-head-aroll/build.svrun \
  --package-lock examples/talking-head-aroll/svml.packages.lock \
  --root .
```

Build the complete film after starting the local WhisperX sidecar and exposing `KIE_API_KEY`,
`GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`:

```sh
pnpm narratage build examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --package-lock examples/talking-head-aroll/svml.packages.lock \
  --root . \
  --build-id talking-head-film-001 \
  --follow

pnpm narratage get talking-head-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --name final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

Run the same downstream film from the four archived generated shots without another Seedance
submission:

```sh
pnpm narratage build examples/talking-head-aroll/reuse-generated.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --package-lock examples/talking-head-aroll/svml.packages.lock \
  --root . \
  --build-id talking-head-film-reuse-001 \
  --follow
```

`reuse-generated.svrun` names four shot aliases from `talking-head-film-001`, exposes each
verified Record as a zero-input Candidate and explicitly satisfies the corresponding
logical output as `substitute`. Reverse demand therefore removes all four Seedance branches while
keeping media normalization, WhisperX, Gemini planning, Film and rendering reachable. This is a new
Build, not a continuation or automatic cache hit.

This public fixture is intentionally brand-neutral. It preserves the topology and the explicit
fresh/reuse Run shapes used by an internal paid acceptance, but does not claim that its source bytes
or generated Records are the private delivery inputs from that run.

The package lock lists independent packages. It is not a hidden video bundle, and the video CLI
contains no authoring or Run-language package by default.
