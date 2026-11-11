# `@hypit/nle-local`

Direct local application port for one persistent `hypit.nle@1` project.

The package opens the selected project, loads only its named Present and Adjustment Component packages, resolves
primary files through Media Asset documents, lowers the snapshot through AVIR to `HtmlProgram` and
`AudioProgram`, then executes Chromium, local audio rendering and FFmpeg mux against one request-private
`FileResourceStore`.

```bash
hypit nle export edit.nle.json --to output.mp4
hypit nle export edit.nle.json --to output.mp4 --frame-rate 30000/1001
hypit nle export edit.nle.json --to output.mp4 --resolution 3840x2160
```

This is a local file task. It creates no Build, Runtime, Endpoint, Result or durable prepare state.
The exported `exportLocalNleProject()` function accepts an injected delivery executor for embedding
and tests; the default implementation selects `@hypit/html-chromium-local` and the direct
`@hypit/media-local/execution` functions. No Provider module is loaded.
Its `projectRoot` input is the application-owned filesystem boundary; `projectFile` may live in a
subdirectory and keep references such as `../media/clip/clip.media.json` relative to itself.

Ordinary export never installs tools. `--chrome-path`, `--ffmpeg-path` and `--ffprobe-path` select
already installed executables explicitly; managed tool provisioning is environment setup rather
than NLE project preparation or Runtime execution.

`--frame-rate` chooses output sampling and never reinterprets the project's exact rational times.
`--resolution` chooses a same-aspect output pixel grid and never rewrites Item layouts or Component
coordinates. A different aspect is rejected because contain, cover, stretch and reframe are distinct
author decisions rather than resolution aliases.

The package-owned `@hypit/nle-local/cli` export contributes the `nle` root to an explicitly assembled
CLI application. It is only terminal presentation over this direct local export port; selecting the package's
main API does not activate the command.
