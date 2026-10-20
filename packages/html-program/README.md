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

Hosts import `injectRuntimeShim` from `@hypit/html-program/playback` to add
frame playback to materialized HTML. The script provides `__hypitSeekFrame`,
`__hypitPlayFrame` and `__hypitSetMuted`; the host supplies playback controls
and serves the referenced materials.
