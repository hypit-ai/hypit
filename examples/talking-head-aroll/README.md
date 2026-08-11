# Talking Head A-roll

Complete four-take Seedance Mini talking-head film with measured captions.

Supply these ignored local assets before checking or building:

- `presenter-clean.png`
- `presenter-alt.png`
- `presenter-voice.mp3`

Every take uses the same voice-timbre reference. The visual reference sequence is base, alternate,
alternate, base.

The data-only `seedance-kits/speaker` template and project SVS Recipe feed generic Text rendering.
Each resulting Text output connects to an exact `seedance:ReferenceVideo` beside explicit image,
audio and duration edges; prompt assembly is therefore part of the graph, not hidden Speaker logic.
The four generated videos are normalized and concatenated into one Speech Spine. One canonical
audio projection goes through WhisperX, direct Script alignment produces the complete SemanticMap,
Gemini plans Cue cuts without seeing timing, and the resulting Caption
VisualTrack joins the peer speech visual/audio Tracks in Film. HyperFrames renders and muxes the
single `final.video` target.

The current deterministic estimate is 12, 15, 15 and 15 seconds. The Recipe deliberately caps a
take at Seedance's 15-second request limit.

Create the explicit package lock used by this development-workspace example:

```sh
node --run narratage -- lock-packages examples/talking-head-aroll/svml.packages.lock \
  --package @narratage/artifact \
  --package @narratage/narrative \
  --package @narratage/media \
  --package @narratage/program-space \
  --package @narratage/speech \
  --package @narratage/speech-evidence \
  --package @narratage/semantic-map \
  --package @narratage/spatial \
  --package @narratage/visual-ir \
  --package @narratage/composition \
  --package @narratage/svs \
  --package @narratage/script \
  --package @narratage/estimate \
  --package @narratage/text \
  --package @narratage/generation \
  --package @narratage/seedance \
  --package @narratage/speech-alignment \
  --package @narratage/speech-basis \
  --package @narratage/speech-spine \
  --package @narratage/whisperx \
  --package @narratage/caption \
  --package @narratage/caption-fine \
  --package @narratage/caption-gemini \
  --package @narratage/fonts-open \
  --package @narratage/film \
  --package @narratage/hyperframes \
  --package @narratage/media-pipeline \
  --package @narratage/render-hyperframes \
  --package @narratage/run-markup \
  --package-root .

node --run narratage -- lock-packages examples/talking-head-aroll/svml.runtime-packages.lock \
  --package @narratage/local \
  --package @narratage/store-sqlite \
  --package @narratage/artifact-store-fs \
  --package @narratage/credential-store-env \
  --package @narratage/provider-kie \
  --package @narratage/provider-media-local \
  --package @narratage/provider-whisperx-local \
  --package @narratage/provider-google-vertex \
  --package @narratage/provider-hyperframes-local \
  --package-root .
```

After package implementation changes, retain these explicit selections without repeating the long
list:

```sh
node --run narratage -- lock-packages examples/talking-head-aroll/svml.packages.lock --refresh
node --run narratage -- lock-packages examples/talking-head-aroll/svml.runtime-packages.lock --refresh
```

Inspect the authored graph—including the visible `*.prompt` Text output and `*.program`—without a paid call:

```sh
node --run narratage -- check examples/talking-head-aroll/main.svml \
  --runtime examples/talking-head-aroll/svml.runtime.json
```

Inspect the exact paid plan before submitting it:

```sh
node --run narratage -- plan examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json
```

Build the complete film after preparing the managed local WhisperX service and exposing `KIE_API_KEY`,
`GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`:

```sh
node --run narratage -- runtime up examples/talking-head-aroll/svml.runtime.json

node --run narratage -- build examples/talking-head-aroll/build.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --build-id talking-head-film-001 \
  --follow

node --run narratage -- get talking-head-film-001 \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --name final.video \
  --to examples/talking-head-aroll/output/final.mp4
```

`build` returns after durable submission unless `--follow` is present. Even with `--follow`, the
terminal remains an observer; interrupting it leaves the Worker and Build running.

Run the same downstream film from the four archived generated shots without another Seedance
submission:

```sh
node --run narratage -- build examples/talking-head-aroll/reuse-generated.svrun \
  --runtime examples/talking-head-aroll/svml.runtime.json \
  --build-id talking-head-film-reuse-001 \
  --follow
```

`reuse-generated.svrun` names four shot aliases from `talking-head-film-001`, exposes each
verified Record as a zero-input Candidate and explicitly satisfies the corresponding
logical output as `substitute`. Reverse demand therefore removes all four Seedance branches while
keeping media normalization, WhisperX, Gemini planning, Film and rendering reachable. This is a new
Build, not a continuation or automatic cache hit.

This brand-neutral fixture demonstrates the same topology with two explicit Run shapes: fresh
generation and reuse through zero-input Build-Record Candidates. Local source assets and generated
Records are intentionally not committed.

The package lock lists independent packages. It is not a hidden video bundle, and the video CLI
contains no authoring or Run-language package by default.
