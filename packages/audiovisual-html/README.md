# `@hypit/audiovisual-html`

One-way terminal lowering from a resolved `@hypit/audiovisual` Picture Programme into the
`@hypit/html-program` renderer contract.

The package is intentionally downstream. `@hypit/audiovisual` remains renderer-independent; this adapter
selects HTML terminal facts only after exact temporal relations and the renderer-neutral
`AudiovisualPictureOutput` sampling policy are both available.

`lowerAudiovisualPictureProgramToHtmlProgram()` accepts one Programme, its terminal Source set, one
typed Output policy and an optional explicit range Demand. A compatibility caller that omits Demand requests the complete
Programme. The adapter first validates the request through `@hypit/audiovisual-execution`, then evaluates exact relations
only at positions inside that range. It lowers every
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
output to either a package-owned opaque visual programme, a PreparedMedia Picture implementation, a transient
`PreparedPictureSampling` received from another Terminal island, or a nested
AudiovisualProgram plus its own terminal Source set. These are HTML execution forms, not AVIR Source kinds.
Operator packages publish their named-port programme as part of the typed `PictureOperator`; the adapter does
not call a resolver or recover parameters by id. It has no package scan or Operator registry. Unsupported
programme formats fail at the terminal capability boundary.

`prepared-media-source` lowers a constant PreparedMedia Picture directly to one typed image Artifact. The
Artifact remains observable across the Occurrence's output frames, but the Source never receives a fake clock
or sampling Map. The same binding handles signal Picture. One stable video occurrence carries the complete
output-to-source `TemporalMap`, including hold, loop, fractional speed and reverse pieces. `program-source` recursively
evaluates a child Programme without materializing it. The official
Cross Dissolve package publishes its complete Picture Operator and the adapter closes its inputs through
the declared named slots. The vertical proof uses two PreparedMedia video sources and that typed Operator.

`createAudiovisualHtmlTerminalExecutor()` is a real multi-Terminal consumer. It projects an incoming Source-task or
Operator-island Product into a transient typed AVIR Source, adapts its shared `PreparedPictureSampling` into the existing
stable video plane, and continues ordinary crop, remap, over and pointwise Operator lowering. The Product's `TemporalMap`
carries nominal Programme or Source-local time into the temporary stream domain, so rendering a requested subrange from
stream time zero requires no clock-name assumption. The executor does not create `PreparedMedia`, a Media Asset, project
metadata or a cache entry.

When an HTML island itself publishes an intermediate Product, the executor compiles exactly that projected subgraph into
an `HtmlProgram` and delegates materialization to an explicitly injected Host publisher. Chromium, Artifact storage,
alpha-capable encoding and cache policy remain Host concerns. The published value is still a transient execution edge and
is never written back to AVIR.

`createAudiovisualHtmlTerminalCapability()` is the matching finite capability offer. It verifies Picture structure,
pointwise HTML Operator programmes, Source implementations and required Source access before partitioning. It declares
`PreparedPictureSampling` input support and advertises the same output only when the Host has explicitly installed an
alpha-capable Product publisher. It performs no Terminal selection.

A package-owned Picture `SignalReconstruction` is read only at the terminal boundary. The portable HTML
reconstruction format currently executes exact nearest-frame selection and remains attached to the stable media
source plan; unknown formats fail accurately instead of being ignored. Blend, optical flow and model-based
reconstruction can add their own terminal formats without changing AVIR or `TemporalMap`.

The package's pure lowering API and Producer facet expose the same finite Source fold. Frame rate and Canvas are
typed Output inputs and do not enter AVIR. Source/Author Graph fragments belong to the optional Source application
rather than this NLE terminal package.

The lowerer passes one stable terminal tree directly to `compileHtmlPictureProgram()`. It does not
build a temporary Timeline, VisualTrack, Present or Composition, and `@hypit/html-program` no longer
publishes a Composition compiler.

Temporal Controls remain named exact coordinates: the lowerer supplies each stable Operator instance with
its sampled Control positions, while the package-owned programme decides how those coordinates affect its
value. Spatial-map Control is lowered by the same stable-instance path. Transition and Treatment packages
declare an explicit `progress` Control domain; their normalized progress is therefore a package projection
of a bound coordinate, not an implicit Track duration or terminal-local animation clock.

Every Operator also carries its general temporal-support contract. The current HTML executor implements the
pointwise subset and rejects look-around or tail requirements at this capability boundary; execution state,
pre-roll and latency are Terminal facts rather than AVIR Operator fields. It does not infer support from an
effect id.
