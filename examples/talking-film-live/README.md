# Two-take live acceptance

This example deliberately exercises the real path rather than a placeholder path:

```text
Script -> deterministic Estimate -> two Seedance Mini 480p generations
       -> media normalization -> Speech Spine -> WhisperX -> SemanticMap
       -> Vertex Gemini Caption plan -> Caption Track
       -> Selection-located Text Track -> Film -> HyperFrames -> audio mix -> mux
```

Both English lines resolve to five seconds with `pace="normal"`, `padding="0.3"`, a four-second
minimum and `ceil` rounding. The generated presenter image is intentionally ignored by Git under
`assets/`; supply or regenerate `assets/presenter.png` before checking or building.

Prerequisites for the exact checked-in Runtime Profile:

- `KIE_API_KEY` for the two paid Seedance Mini generations;
- `GOOGLE_CLOUD_PROJECT` naming a project with Vertex AI enabled;
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` containing the credential JSON, not a committed path or
  secret file;
- `ffmpeg`, `ffprobe`, Chrome/HyperFrames and the prepared local WhisperX sidecar.

Prepare and health-check WhisperX as described in
[`../../services/whisperx/README.md`](../../services/whisperx/README.md). `narratage check` validates
source, Run Graph and exact Runtime capability coverage before scheduling, but it does not make a
paid Provider request or promise that remote credentials and service health are valid.

Run the complete graph through the explicit Run Graph and declarative local Runtime Profile:

The checked-in `svml.packages.lock` selects each author, Run and deterministic compute package
independently; there is no implicit video bundle. Regenerate it after changing one of those package
implementations with the package list documented in the lock file.
The independent `svml.runtime-packages.lock` selects only KIE, local media, local WhisperX, Vertex
and local HyperFrames deployment adapters; adding another Provider does not change the CLI.

```bash
pnpm narratage build examples/talking-film-live/build.svrun \
  --runtime examples/talking-film-live/svml.runtime.json \
  --package-lock examples/talking-film-live/svml.packages.lock \
  --root . \
  --build-id talking-film-live \
  --follow

pnpm narratage inspect talking-film-live \
  --runtime examples/talking-film-live/svml.runtime.json

pnpm narratage get talking-film-live \
  --runtime examples/talking-film-live/svml.runtime.json \
  --name final.video \
  --to examples/talking-film-live/output/final.mp4
```

`build.svrun` owns the selected Target and fidelity. `svml.runtime.json` owns Provider instances,
permissions and concurrency. The Build archives all accepted intermediate Records and referenced
Artifacts even when no destination path is requested. `get` only makes an optional copy of the
already archived named target. The existing `svml.runtime.ts` shows the advanced executable
embedding API and remains supported.

To reuse the paid shot outputs from a verified earlier Build, add two zero-input Build Record
Candidates and their explicit Satisfaction edges to another `.svrun`:

```xml
<?svml using="@narratage/run-markup@1"?>
<svrun version="1" targets="delivery">
  <author source="./main.svml"/>
  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>
  <build-record id="opening" build="prior-build-id" output="opening-take.video"/>
  <build-record id="answer" build="prior-build-id" output="answer-take.video"/>
  <satisfy output="opening-take.video" candidate="opening" fidelity="substitute"/>
  <satisfy output="answer-take.video" candidate="answer" fidelity="substitute"/>
</svrun>
```

The second Run compiles a new Build whose two shot outputs are explicitly selected substitute
Existing values. It therefore contains no Seedance Operations or KIE Needs. Substitute fidelity
propagates through the rebuilt media normalization, WhisperX, SemanticMap, Tracks, Film and
HyperFrames path instead of being washed back to exact.
