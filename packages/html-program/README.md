# @hypit/html-program

`@hypit/html-program` owns Hypit's portable, frame-addressed HTML visual program.
It compiles a `Composition`, including its owned absolute `Timeline`, into one `HtmlProgram`.
It does not launch a browser, encode video, mix audio, or select a local Provider.

## Boundary

An `HtmlProgram` contains:

- the integer frame domain and canvas;
- the Composition's renderer-neutral working-picture semantics;
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

`HtmlProgram.videoSources` is the compiler-owned terminal source-sampling plan. For direct media it keeps the selected
visual stream and complete exact `TemporalMap`; for an already rendered Surface it keeps its frame relation. A Provider
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
must check that it can implement every input interpretation and the working picture. It must not infer
colour meaning from filenames, containers or generated markup.

Nested Compositions remain recursive programmes rather than intermediate video Artifacts. During one
root compilation, repeated references to the same in-memory child Composition reuse its compiled
`HtmlProgram`; this cache is request-local and has no author-visible identity. A child document stays
inert until its occurrence enters the selected render spans. The parent projects those spans through
the occurrence map and passes the resulting child spans to `prepare`, so unrelated child work remains
uninitialized. A child `applyFrame` is still invoked for every requested parent frame: the compiler
does not guess that repeated child-frame numbers make an arbitrary component stateless.

Child media sources remain part of the root terminal sampling plan. Compilation composes the parent
occurrence Map with each child source Map and records a Programme-private child-document path plus the
target element identity. A Provider therefore decodes each selected source sample once under its own
execution policy and routes it to the exact nested document; it does not render, save and reopen a
child video. The path is an execution address inside this `HtmlProgram`, not Composition metadata or
an author identity.

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
Components may use this when ordinary Visual IR elements do not express
their shared behaviour.

The HTML compiler also lowers generic Composition `VisualProcess` values. Track-level Processes keep
their named contributions and independent clocks inline. Scope-level Processes render each named input
scope into one request-private transparent Picture before invoking the package-owned programme. The typed
`processPasses` count tells a Provider whether these input surfaces are required; it does not identify an
effect or prescribe PNG, GPU textures or another transfer mechanism. The HTML format does not know
transition or matte effect names.

The current format rejects a nested Composition whose child `HtmlProgram` itself requires Scope Process
input surfaces. Current Providers execute those passes in the root document only. This is an explicit
renderer-format limit, not a Composition limit: a future recursive surface executor can remove it without
changing Film, VisualScope or effect declarations.

Asynchronous resources must be prepared before drawing. A frame callback may
not race capture. The page ABI and Provider readiness checks settle declared
fonts, images and frame listeners before pixels are accepted.

## Nested compositions

A Composition visual source lowers recursively to a child `HtmlProgram`; it is not rendered to an
intermediate video. The compiler resolves the authored Temporal Map to exact child-frame identities,
and the generated document starts a child browsing context only when its parent render selection needs
that occurrence. One parent document stores a repeated in-memory child Composition document once while
each occurrence retains independent runtime state. Frame tables use a shorter lossless private encoding
only when it is actually smaller. Child source-media plans are likewise lifted into the root Program by
exact Map composition and retain their nested target address. Documents without nested Composition sources contain none of this
runtime or data. These are HtmlProgram execution details, not Composition fields or author metadata.

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
