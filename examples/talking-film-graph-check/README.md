# Talking-film graph check

This fixture compiles the complete author graph: Script, generated-media requests, Speech Spine,
WhisperX alignment, display-only Gemini Caption planning, Media Track, Caption, Text, Film and
explicit HyperFrames rendering. `check` and `plan` do not invoke Seedance, WhisperX, Gemini or
HyperFrames.

```bash
cd examples/talking-film-graph-check
narratage check main.svml
narratage check build.svrun
narratage plan build.svrun
```

The Gemini planner receives readable indivisible display atoms and resolved Style runs only. Its
generic `CaptionPlan` joins the independent `CompleteSemanticMap` in `@narratage/caption`; neither
the planner nor the Vertex Provider has text-rewriting or timing authority.
`@narratage/caption-fine` alone owns Recipe interpretation and the concrete visual renderer.
