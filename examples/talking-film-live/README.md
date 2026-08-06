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

Run the complete graph with the explicitly trusted local Runtime:

```bash
pnpm svml:v2 build examples/talking-film-live/main.svml \
  --target final.video \
  --runtime examples/talking-film-live/svml.runtime.ts \
  --follow \
  --out examples/talking-film-live/output/final.mp4
```

Reuse the paid shot outputs from a verified earlier Build while rebuilding every reachable
downstream result:

```bash
pnpm svml:v2 build examples/talking-film-live/main.svml \
  --target final.video \
  --runtime examples/talking-film-live/svml.runtime.ts \
  --pin opening-take=<prior-build-id> \
  --pin answer-take=<prior-build-id> \
  --follow \
  --out examples/talking-film-live/output/final-pinned.mp4
```

The second command compiles a new Build whose two shot outputs are Existing values. It therefore
contains no Seedance Operations or KIE Needs, while Caption, media normalization, WhisperX,
SemanticMap, Tracks, Film and HyperFrames remain ordinary demanded graph work.
