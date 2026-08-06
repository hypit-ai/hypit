# Talking-film graph check

This fixture compiles the complete author graph: Script, generated-media requests, Speech Spine,
WhisperX alignment, display-only Gemini Caption planning, B-roll, Caption, Text, Film and
explicit HyperFrames rendering. `check` and `plan` do not invoke Seedance, WhisperX, Gemini or
HyperFrames.

```bash
pnpm svml:v2 check examples/talking-film-graph-check/main.svml
pnpm svml:v2 plan examples/talking-film-graph-check/main.svml --target final.video
```

The Gemini planner receives immutable left-side display atoms and resolved style runs only. Its generic
`CaptionPlan` joins the independent `CompleteSemanticMap` in `@svml/caption`; neither the planner
nor the Vertex Provider has text-rewriting or timing authority.
