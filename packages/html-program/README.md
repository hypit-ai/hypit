# @hypit/html-program

`@hypit/html-program` owns Hypit's portable, frame-addressed HTML visual program.
It compiles a `Composition` and its absolute `Timeline` into one `HtmlProgram`.
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
window.__hypitFrameProgram.prepare(): Promise<void>
window.__hypitFrameProgram.applyFrame(frame: number): Promise<void>
```

`frame` is an absolute integer in `[0, frameCount)`. The page emits
`hypit-frame` with the same integer. It never converts the request to seconds and
does not require sequential playback, so independent workers can enter at any
legal frame.

`HtmlProgram.frameSources` is the compiler-owned source-time plan. A Provider
uses it to decode exact video frames; it must not recover sampling semantics by
parsing generated markup. Resource URLs in the HTML remain inert
`hypit-resource://` placeholders until execution materializes the program.

## Execution ABI

This package also owns the method-neutral requests and result types for executing
an `HtmlProgram`:

- `@hypit/html-program@1#rasterize-visual` accepts a program and an optional
  absolute half-open frame range, and returns `TimelineVisual`;
- `@hypit/html-program@1#rasterize-frames` accepts any strictly increasing set
  of absolute frames, and returns PNG BlobRefs in request order.

These Capabilities describe demanded results, not a browser, FFmpeg, a machine,
or a particular Provider. `@hypit/provider-html-local` is one implementation.

## HTML visuals

`hypit.html-visual@1` is the low-level extension for component-owned HTML,
CSS and synchronous frame drawing. Its setup function returns
`render(localFrame)`, where `localFrame` is an integer relative to the owning
Present. Components may use this when ordinary Visual IR elements do not express
their shared behaviour.

Asynchronous resources must be prepared before drawing. A frame callback may
not race capture. The page ABI and Provider readiness checks settle declared
fonts, images and frame listeners before pixels are accepted.

## HTML picture adjustments

`hypit.html-adjustment@1` is the renderer-owned format for applying CSS `filter`,
`opacity` and affine `transform` facts to the picture already accumulated below an
Adjustment's visual stack position. Construct it with `htmlAdjustment(...)` and place the
returned programme on a Composition `VisualAdjustment`.

The compiler folds Visual Items in each VisualScope's local stack order. A Present appends
its owned source picture; an Adjustment wraps the complete local picture prefix; a
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
- HTML lowering and the frame-page ABI stay here.
- Browser lifecycle, filesystem staging, source decoding, screenshots and encoding stay in a Provider.
- Audio program compilation stays in Media Operations; concrete audio processing and final mux stay in the
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
