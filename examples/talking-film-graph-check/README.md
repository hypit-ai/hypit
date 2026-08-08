# Talking-film graph check

This fixture compiles the complete author graph: Script, generated-media requests, Speech Spine,
WhisperX alignment, display-only Gemini Caption planning, B-roll, Caption, Text, Film and
explicit HyperFrames rendering. `check` and `plan` do not invoke Seedance, WhisperX, Gemini or
HyperFrames.

```bash
pnpm narratage check examples/talking-film-graph-check/main.svml \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
pnpm narratage check examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
pnpm narratage plan examples/talking-film-graph-check/build.svrun \
  --package-lock examples/talking-film-graph-check/svml.packages.lock --root .
```

The Gemini planner receives immutable ordered display words and resolved Style runs only. Its generic
`CaptionPlan` joins the independent `CompleteSemanticMap` in `@narratage/caption`; neither the planner
nor the Vertex Provider has text-rewriting or timing authority. `@narratage/caption-fine` alone owns
the concrete `important` field, Recipe interpretation and visual renderer.
