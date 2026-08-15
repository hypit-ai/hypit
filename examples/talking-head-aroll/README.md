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

Synchronize both package locks from the Run Source and Runtime Profile:

```sh
cd examples/talking-head-aroll
../../narratage runtime use svml.runtime.json
../../narratage packages sync build.svrun
```

Inspect the authored graph—including the visible `*.prompt` Text output and `*.program`—without a paid call:

```sh
../../narratage check main.svml
```

Inspect the exact paid plan before submitting it:

```sh
../../narratage plan build.svrun
```

Build the complete film after preparing the managed local WhisperX service and exposing `KIE_API_KEY`,
`GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`:

```sh
../../narratage runtime up

../../narratage build build.svrun --follow

../../narratage get <build-id> \
  --name final.video \
  --to output/final.mp4
```

`build` returns after durable submission unless `--follow` is present. Even with `--follow`, the
terminal remains an observer; interrupting it leaves the Worker and Build running.

Run the same downstream film from the four archived generated shots without another Seedance
submission:

```sh
../../narratage build reuse-generated.svrun --follow
```

Before this second command, replace `REPLACE_WITH_BUILD_ID` in `reuse-generated.svrun` with the
automatic id printed by the first Build. The Run exposes four shot aliases from that exact Build,
each as a zero-input Candidate, and explicitly satisfies the corresponding logical output. Reverse
demand therefore removes all four Seedance branches while
keeping media normalization, WhisperX, Gemini planning, Film and rendering reachable. This is a new
Build, not a continuation or automatic cache hit.

This brand-neutral fixture demonstrates the same topology with two explicit Run shapes: fresh
generation and reuse through zero-input Build-Record Candidates. Local source assets and generated
Records are intentionally not committed.

The package lock lists independent packages. It is not a hidden video bundle, and the video CLI
contains no authoring or Run-language package by default.
