# `@hypit/audiovisual-html`

One-way terminal lowering from a resolved `@hypit/audiovisual` Picture Programme into the
`@hypit/html-program` renderer contract.

The package is intentionally downstream. `@hypit/audiovisual` does not import it, and AVIR contains
no HtmlProgram, DOM, CSS, Timeline, Canvas or legacy Composition value. The adapter selects terminal
terminal facts only after exact temporal relations and an Output sampling policy are both available.

`lowerAudiovisualPictureProgramToHtmlProgram()` accepts one Programme, its terminal Source set and one
typed Output policy. It evaluates exact relations at the requested output positions, but lowers every
graph path to one stable terminal element rather than copying the DOM tree once per frame. It lowers:

- `transparent` to an empty terminal box;
- `sample` through an explicit typed `AudiovisualHtmlSource` binding;
- temporal `alias`, spatial `crop` and static `remap` structurally;
- ordered `over` without deriving paint order from Track; and
- `apply` through the typed Operator's own opaque programme and named slots.

The HTML adapter inverts AVIR's canonical parent-to-source Spatial Map exactly once to obtain CSS's
source-to-parent placement transform. It supports affine CSS matrices and projective CSS `matrix3d` placement.
The typed Output carries an explicit viewport-to-Programme Picture Map: the target must match the selected
zero-origin Canvas, while the source must match the Programme root Space. Output raster extent therefore does
not rewrite or have to equal the authored Programme Space.

Source packages publish terminal values independently from `ProgramSource`. A value binds one nominal Source
output to either a package-owned opaque visual programme, a fully interpreted still picture, a PreparedMedia
picture implementation, or a nested
AudiovisualProgram plus its own terminal Source set. These are HTML execution forms, not AVIR Source kinds.
Operator packages publish their named-port programme as part of the typed `PictureOperator`; the adapter does
not call a resolver or recover parameters by id. It has no package scan or Operator registry. Unsupported
programme formats fail at the terminal capability boundary.

`still-picture-source` lowers a constant Picture directly to one typed image Artifact. The Artifact remains
observable across the Occurrence's output frames, but the Source never receives a fake clock or sampling Map.
`prepared-media-source` handles time-varying media. One stable video occurrence carries the complete
output-to-source `TemporalMap`, including hold, loop, fractional speed and reverse pieces. `program-source` recursively
evaluates a child Programme without materializing it. The official
Cross Dissolve package publishes its complete Picture Operator and the adapter closes its inputs through
the declared named slots. The vertical proof uses two PreparedMedia video sources and that typed Operator.

A package-owned Picture `SignalReconstruction` is read only at the terminal boundary. The portable HTML
reconstruction format currently executes exact nearest-frame selection and remains attached to the stable media
source plan; unknown formats fail accurately instead of being ignored. Blend, optical flow and model-based
reconstruction can add their own terminal formats without changing AVIR or `TemporalMap`.

`createAudiovisualHtmlFragment()` and `createAudiovisualProgramHtmlSourceFragment()` make Source-set folds and
terminal compilation ordinary AuthorGraph operations. Frame rate and Canvas are typed Output inputs; they do
not enter AVIR. If no HTML target is demanded, Kernel pruning omits these terminal branches.

The lowerer passes one stable terminal tree directly to `compileHtmlPictureProgram()`. It does not
build a temporary Timeline, VisualTrack, Present or Composition, and `@hypit/html-program` no longer
publishes a Composition compiler.

Temporal Controls remain named exact coordinates: the lowerer supplies each stable Operator instance with
its sampled Control positions, while the package-owned programme decides how those coordinates affect its
value. Spatial-map Control is lowered by the same stable-instance path. Transition and Treatment packages
declare an explicit `progress` Control domain; their normalized progress is therefore a package projection
of a bound coordinate, not an implicit Track duration or terminal-local animation clock.

Every Operator also carries its general temporal-support contract. The current HTML executor implements the
pointwise subset and rejects look-around, sequential pre-roll, latency or tail requirements at this capability
boundary; it does not infer support from an effect id.
