# `@hypit/nle-local`

Direct local application port for one persistent `hypit.nle@1` project.

The package opens the selected project, loads only its named component and effect packages, resolves
primary files through Media Asset documents, lowers the snapshot through AVIR to `HtmlProgram` and
`AudioProgram`, then executes Chromium, local audio rendering and FFmpeg mux against one request-private
`FileResourceStore`.

```bash
hypit nle export edit.nle.json --to output.mp4
hypit nle export edit.nle.json --to output.mp4 --frame-rate 30000/1001
```

This is a local file task. It creates no Build, Runtime, Endpoint, Result or durable prepare state.
The exported `exportLocalNleProject()` function accepts an injected delivery executor for embedding
and tests; the default implementation selects the local Chromium and media functions directly.

`--frame-rate` chooses output sampling and never reinterprets the project's exact rational times.
