# `@hypit/nle-local`

Direct local application port for one persistent `hypit.nle@1` project.

The package opens the selected project, loads only its named Present Component and Operator packages, resolves
primary files through Media Asset documents, lowers the snapshot through AVIR, executes any explicitly selected
external Picture Source terminals, closes their transient products through the invocation-selected Picture root and one
`AudioProgram`, then executes Chromium, local audio rendering and FFmpeg mux against one request-private
`FileResourceStore`.

```bash
hypit nle export edit.nle.json --to output.mp4
hypit nle export edit.nle.json --to output.mp4 --frame-rate 30000/1001
hypit nle export edit.nle.json --to output.mp4 --resolution 3840x2160
hypit nle export edit.nle.json --to output.mp4 --picture-target gpu-composition
hypit nle export edit.nle.json --start-frame 900 --end-frame-exclusive 1050 --to review.mp4
hypit nle frames edit.nle.json --at-frame 0,300,900 --to review-frames
hypit nle frames edit.nle.json --start-frame 900 --end-frame-exclusive 1050 --step-frames 15 --to review-frames
hypit nle review edit.nle.json --start-frame 900 --end-frame-exclusive 1050 --at-frame 900,975,1049 --to review
```

All three subcommands accept `--json`. The final machine result uses stdout and progress uses stderr, so an
Agent or shell can sequence bounded file tasks without parsing human progress text. The NLE command module is
one explicitly assembled CLI command module that owns the `nle` root; it does not discover commands or call
the Media, Runtime or Workbench CLI modules internally.

Full delivery, focused delivery and sparse PNG capture lower the same NLE snapshot into the same terminal
programmes. Frame addresses are absolute on the selected output frame grid and intervals are half-open.
A focused MP4 selects the identical interval from `HtmlProgram` and `AudioProgram`; sparse capture asks the
Picture Programme for only the listed frames and does not encode an intermediate MP4. None of these review
requests creates a Result, Media Asset or persistent preview record.

`nle review` derives `review.mp4` and `frames/*.png` from one explicitly selected interval. It loads packages,
binds Media, links AVIR and executes Picture Terminals once, then gives the same closed Picture Programme to
frame capture and clip delivery. The bundle directory is the only retained output and request-private products
are deleted when the command finishes.

Long-lived applications can retain that earlier boundary explicitly. `prepareNodeNleProgramme()` creates one
`PreparedNodeNleProgramme` from package resources, Media bindings and the NLE→AVIR link. Preview,
`capturePreparedNleFrames()`, `reviewPreparedNleProgramme()` and `exportPreparedNleProgramme()` then close that
same graph with their own frame rate, range, resolution and Picture target. Prepared inputs live for one
application-owned Programme generation; rendered frames, audio and muxed files are written to a request-owned
overlay and never accumulate in the prepared resource domain. This is a lifecycle object, not a hash cache,
persisted manifest or cross-generation dependency guess.

The focused interval enters AVIR demand before Picture Terminal binding. A `range` Source therefore receives
only that Source-local interval; a `sequential` Source receives the smallest required prefix from its declared
origin, and a `whole` Source accurately retains whole-domain execution. Sparse capture propagates the smallest
continuous interval containing its requested absolute frames, then captures only their rebased local indices.
Output PNG names and the API result retain the original absolute Programme frame identities.

`--picture-target html` remains the default. `gpu-composition` selects the AVIR GPU root for this export only,
lowers its `GpuCompositionProgram` to WebGPU/Dawn and reuses the same Chromium capture and delivery providers.
The selection is not written to the NLE Project, AVIR or Timeline View. Prepared moving media enters this path as
direct `PreparedPictureSampling`; HTML-owned component or Operator islands are materialized only at their explicit
cross-Terminal boundary.
The GPU output profile selects a final Picture terminal through `AudiovisualOutputTerminalBinding`.
When that terminal differs from the authored root terminal, execution planning creates a transient sink island and product edge; it does not inject another node into authored AVIR.

The CLI remains a local file task. It creates no Build, Runtime, Endpoint, Result or durable prepare state.
The exported `exportLocalNleProject()` function accepts an injected delivery executor for embedding
and tests; the default implementation selects `@hypit/html-chromium-local` and the direct
`@hypit/media-local/execution` functions. No Provider module is loaded.
The local application does not know Manim or any other foreign Picture programme format. A loaded component package
that projects a Source to a named non-HTML Terminal also contributes one exact
`hypit.nle-local-picture-terminal` facet from `@hypit/nle-audiovisual-local` for that same identity. The Host groups selected Sources by identity and
invokes only that facet. Missing, duplicate and misidentified executors fail accurately; there is no programme-format
inference, global registry or fallback Terminal.

`@hypit/nle-audiovisual-local` owns `createLocalNlePictureTerminalFacet()`. For example,
`@hypit/audiovisual-manim-local` exports `createLocalManimNlePictureTerminalFacet({ terminal })`; the component owner
includes that returned facet alongside its NLE and HTML-video facets. Manim's transparent WebM remains request-owned
and enters the same `HtmlProgram.videoSources` collection as ordinary media; it is never published as a Media Asset or
an intermediate project MP4. Package-declared Scene files are staged from the existing terminal resource facet into
the same request-private store.
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
CLI application. It is only terminal presentation over these direct local delivery and capture ports; selecting the package's
main API does not activate the command.
