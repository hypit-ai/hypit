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

Run the complete graph through the explicit Run Graph and declarative local Runtime Profile:

```bash
pnpm svml:v2 build examples/talking-film-live/build.svrun \
  --runtime examples/talking-film-live/svml.runtime.json \
  --follow \
  --out examples/talking-film-live/output/final.mp4
```

`build.svrun` owns the selected Target and fidelity. `svml.runtime.json` owns Provider instances,
permissions and concurrency. The existing `svml.runtime.ts` shows the advanced executable embedding
API and remains supported.

To reuse the paid shot outputs from a verified earlier Build, add two zero-input Build Record
Candidates and their explicit Satisfaction edges to another `.svrun`:

```xml
<svrun version="1" source="./main.svml" targets="delivery">
  <target-set id="delivery">
    <target output="final.video" accepts="substitute"/>
  </target-set>
  <build-record id="opening" build="prior-build-id" output="opening-take"/>
  <build-record id="answer" build="prior-build-id" output="answer-take"/>
  <satisfy output="opening-take" candidate="opening" fidelity="substitute"/>
  <satisfy output="answer-take" candidate="answer" fidelity="substitute"/>
</svrun>
```

The second Run compiles a new Build whose two shot outputs are explicitly selected substitute
Existing values. It therefore contains no Seedance Operations or KIE Needs. Substitute fidelity
propagates through the rebuilt media normalization, WhisperX, SemanticMap, Tracks, Film and
HyperFrames path instead of being washed back to exact.
