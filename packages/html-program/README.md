# @hypit/html-program

`@hypit/html-program` owns Hypit's portable, frame-addressed HTML visual program.
It compiles a `Composition`, including its owned absolute `Timeline`, into one `HtmlProgram`.
It does not launch a browser, encode video, mix audio, or select a local Provider.

## Boundary

An `HtmlProgram` contains:

- the integer frame domain and canvas;
- one self-contained HTML document;
- typed byte dependencies and their conservative frame usage;
- typed compositable Surface dependencies;
- typed source-video frame functions.

The page exposes one ABI:

```ts
window.__hypitFrameProgram.prepare(spans?: readonly FrameSpan[]): Promise<void>
window.__hypitFrameProgram.applyFrame(frame: number): Promise<void>
```

`frame` is an absolute integer in `[0, frameCount)`. The page emits
`hypit-frame` with the same integer. It never converts the request to seconds and
does not require sequential playback, so independent workers can enter at any
legal frame.

`prepare(spans)` is the explicit execution boundary. With `spans`, the page first
removes unrelated Presents while their resource URLs are still inert, then
activates and initializes only the selected work. Without `spans`, it prepares
the whole Program for playback. The Provider passes the same absolute selection
to Artifact staging and to this page ABI; the page does not obtain render policy
from a hidden browser global or infer it from worker assignment.

`HtmlProgram.videoSources` is the compiler-owned terminal source-sampling plan. Direct media keeps the selected
visual stream and its complete exact `TemporalMap`. An already rendered Surface keeps its explicit frame relation
and `PictureInterpretation`: a Surface is already a discrete frame carrier, so its occurrence is represented by
compact `sourceFrame`/`sourceRate` runs without adding a second continuous-time evaluator. A Provider
uses this plan to decode the source samples it needs; it must not recover sampling semantics by
parsing generated markup. Resource URLs in the HTML remain inert
`hypit-artifact://` placeholders until execution materializes the program.
Each placeholder names an `HtmlProgram`-local Artifact id. The paired `BlobRef`
is the byte dependency; its Result-store resource identity is not copied into
the generated HTML and may be rebound independently. Component-owned
`HtmlVisual` markup may author a locator from one of its declared Artifact
resources; compilation localizes that locator before publishing the Program.

Direct image Artifacts, prepared video sources and compositable Surfaces all retain the same complete
`PictureInterpretation`; HTML data attributes merely carry that fact into this Program. A Provider
must check that it can implement every input interpretation. It must not infer
colour meaning from filenames, containers or generated markup.

`HtmlVisual` owns the meaning of every resource it introduces. Its payload declares each dependency as
either `data` (bytes that are never presented by HTML or CSS) or `picture` (one still image plus its
complete `PictureInterpretation`). `htmlVisual(...)` derives the generic `VisualProgram.artifacts`
resource closure from those declarations, and `readHtmlVisual(...)` requires the two representations to
match exactly. Compilation lowers the same declaration into a discriminated `HtmlArtifact`: `bytes`
when presentation meaning is absent or carried by another typed table, and `picture` when the browser
will present the still directly. This is one lowering chain, not a second registry of Artifact purposes.

`data` cannot declare an `image/*`, `audio/*` or `video/*` Blob and must not be installed as an image,
audio, video or CSS-media source. Component setup may fetch and interpret those bytes as package data.
An `application/octet-stream` dependency is accepted only on that package contract; neither compiler nor
Provider inspects authored DOM to invent a purpose. A `picture` dependency must declare `image/*`, and the Provider still verifies that the staged
bytes decode to exactly one frame with the declared colour interpretation. Timed media belongs in an
owned media or Surface `VisualElement`, whose prepared stream, clock and sampling plan are explicit.

Every timed media element owns one stable display plane. Authored layout, crop,
transform and selector identity stay on that plane; the native video and a
Provider-owned decoded payload slot are private children. All sampled runs of
one timed Surface share the same plane. A Provider replaces pixels inside the
slot and never adds a sibling to the authored flex/grid or selector tree.

Each timed media source carries its authored `TemporalMap` directly. Executors bind the shared sided
Temporal Map evaluator once at their boundary and evaluate each occurrence-local Program frame with
the `after` side. Reverse boundaries propagate the resulting source side to exact decoded-sample
selection; there is no renderer-private frame-selection wrapper or second clock model.

## Execution ABI

This package also owns the method-neutral requests and result types for executing
an `HtmlProgram`:

- `@hypit/html-program@1#rasterize-visual` accepts a program, an explicit
  `VisualDeliverySpec` and an optional absolute Timeline `FrameSpan`, and returns a
  `TimelineVisual` that records the implemented requirement;
- `@hypit/html-program@1#rasterize-frames` accepts an sRGB/full-range
  `FrameOutputPictureSpec` and any strictly increasing set of absolute frames, and returns a
  self-describing `FrameImages` value with that picture interpretation, the original
  absolute frame identities and matching PNG Artifacts.

These Capabilities describe demanded results, not a browser, FFmpeg, a machine,
or a particular Provider. `@hypit/provider-html-local` is one implementation.
CPU PNG transfer, GPU shared textures and hardware encoder surfaces are Provider-private
execution mechanisms and never become Program fields or graph Results.

## HTML visuals

`hypit.html-visual@1` is the low-level extension for component-owned HTML,
CSS and synchronous frame drawing. Its setup function returns
`render(localFrame)`. Setup receives `(root, data, context)`, where `context.durationFrames` is the
owning contribution's exact duration; `localFrame` is relative to that Visual Present or Visual Process.
Package-local byte dependencies are declared in the same value through the typed `dependencies` field;
the old untyped second `htmlVisual` argument does not exist.
`htmlVisualElement(root)` closes one package-owned HTML element tree behind this format. Layout,
attributes, CSS declarations and HTML keyframes are validated here; Composition receives only the
Programme envelope and its typed named slots. Components use typed media, text and Surface leaves as
slot values instead of copying their resource facts into markup.

The HTML compiler also lowers generic Composition `VisualProcess` values. Track-level Processes keep
their named contributions and independent clocks inline. Scope-level Processes render each named input
scope into one request-private transparent Picture before invoking the package-owned programme. The typed
`processUsages` topology gives each Process its compiler order, exact stage keys and
absolute half-open usage spans. A Provider projects the requested frames onto those facts before it
executes the addressed stages; it does not rediscover Process work by scanning the DOM. The topology
does not prescribe PNG, GPU textures or another transfer mechanism. The HTML format does not know
transition or matte effect names.

Asynchronous resources must be prepared before drawing. A frame callback may
not race capture. The page ABI and Provider readiness checks settle declared
fonts, images and frame listeners before pixels are accepted.

## HTML picture adjustments

`hypit.html-adjustment@1` is the renderer-owned format for applying CSS `filter`,
`opacity` and affine `transform` states to the picture already accumulated below an
Adjustment's visual stack position. Construct it with `htmlAdjustment(...)` and place the
returned programme on a Composition `VisualAdjustment`. One complete keyframe is static; two or
more complete keyframes interpolate on the owning occurrence's normalized progress and must include
positions 0 and 1.

The compiler folds Visual Items in each VisualScope's local stack order. A Present appends
its owned source picture; a Process appends the picture produced from its named inputs; an Adjustment
wraps the complete local picture prefix; a
later Present stays outside that wrapper. Canvas clear color is the root picture; nested
Stacks begin from transparency and enter their parent as one picture. At every requested absolute frame, an Adjustment applies its programme
inside `span` and optional `visibility`, and is the identity outside them.
Unsupported Adjustment formats fail at compilation. The current HTML format
does not accept URL filters or Artifact dependencies; formats that own LUTs,
masks or other resources should define and validate their own payload instead
of hiding those facts in this one.

## Ownership rules

- Visual semantics stay in Composition and component packages.
- Absolute time stays in Timeline.
- Half-open render selections reuse Timeline's `FrameSpan`; HTML adds only document-bound checks.
- HTML lowering and the frame-page ABI stay here.
- Browser lifecycle, filesystem staging, source decoding, screenshots and encoding stay in a Provider.
- Audio program compilation stays in `@hypit/audio-program`; concrete audio processing and final mux stay in the
  selected Provider implementation.

There is no raw-HTML reverse compiler. A snapshot or Provider receives the typed
`HtmlProgram` produced by compilation; generated HTML is not treated as a second
source language.

## Browser playback

Hosts use `@hypit/html-playback` to add frame playback to a compiled `HtmlProgram`
and `AudioProgram`. The adapter provides `__hypitSeekFrame`,
`__hypitPlayFrame` and `__hypitSetMuted`; the host supplies playback controls
and serves the referenced materials.

When the document contains Visual Adjustments, its renderer runtime additionally exposes
`__hypitSetAdjustmentBypassed(occurrencePath, adjustmentId, bypassed)`. Studio uses this exact-addressed
control for temporary comparison. Its default state is always false, it is not serialized into the
`HtmlProgram`, and Providers do not call it during capture or export.
