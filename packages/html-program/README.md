# @hypit/html-program

`@hypit/html-program` owns Hypit's portable, frame-addressed HTML visual programme and the
method-neutral requests used to execute it. It does not contain an authoring model and does not
compile `Composition`, `Timeline`, `Track` or Studio state.

## Boundary

The active visual lowering path is:

```text
AudiovisualProgram
  -> exact Output frame sampling
  -> stable Picture instances + sampled relations
  -> compileHtmlPictureProgram(...)
  -> HtmlProgram
  -> rasterize-visual / rasterize-frames capability
```

`compileHtmlPictureProgram(...)` accepts one stable Picture tree plus an explicit frame count, output
frame rate and canvas. Every terminal element declares its exact active frame spans. Its vocabulary is
terminal-local: box, package programme, typed still picture and prepared video.

An `HtmlProgram` contains:

- its rational frame rate, finite frame count and output canvas;
- one self-contained HTML document;
- typed byte dependencies and conservative frame usage;
- exact source-video sampling plans and any terminal Picture reconstruction selected for that read.

Output frame rate is a terminal sampling policy. It is not persisted back into AVIR domains,
Occurrences or temporal mappings.

## Page ABI

The page exposes:

```ts
window.__hypitFrameProgram.prepare(spans?: readonly FrameSpan[]): Promise<void>
window.__hypitFrameProgram.applyFrame(frame: number): Promise<void>
```

`frame` is an absolute integer in `[0, frameCount)`. Independent workers may enter at any legal
frame; sequential playback is not required. `prepare(spans)` projects one render request before
resources and component programmes are initialized.

Resource URLs remain inert `hypit-artifact://` placeholders until the execution host materializes
them. Each placeholder names an `HtmlProgram`-local Artifact id. The paired `BlobRef` remains the
typed byte dependency and is not recovered by parsing markup.

## Package-owned visual programmes

`hypit.html-visual@1` is the low-level extension format for component and Operator-owned HTML, CSS
and synchronous frame drawing. The programme owns named Picture slots and typed dependencies. Its
setup function receives `(root, data, context)` and returns `render(localFrame)`. `context` includes the
stable instance extent and `controlPosition(name, localFrame)` for named exact Control coordinates. A
mapped Source programme may receive a source-local render coordinate instead of the output-local index.

Dependencies are declared as either:

- `data`: non-media bytes interpreted by the package; or
- `picture`: a still image with its complete `PictureInterpretation`.

Timed media is not hidden inside HTML data. It enters through an explicit Picture Source and the
terminal records its prepared stream and complete `TemporalMap` in `videoSources`.

`hypit.html-picture-reconstruction@1` is the first portable media reconstruction format. Its current
`nearest` programme chooses the discrete source frame closest to the exact position supplied by the Map.
The format neither owns speed nor rewrites that Map; future blend or optical-flow formats may demand a
wider renderer capability instead of changing this terminal contract implicitly.

Effect-specific programme formats belong to their owning packages. This terminal only validates and
executes the generic `hypit.html-visual@1` envelope.

## Execution requests

The module publishes two capability contracts:

- `rasterize-visual`: `HtmlProgram` + `VisualDeliverySpec` + optional absolute `FrameSpan` ->
  `RenderedVisual`;
- `rasterize-frames`: `HtmlProgram` + sRGB/full-range `FrameOutputPictureSpec` + selected absolute
  frames -> typed PNG `FrameImages`.

These contracts do not name a browser, FFmpeg, filesystem, machine or Provider. Direct and Provider-backed
execution implementations may realize them differently while consuming the same programme.

## Ownership

- AVIR owns Picture relations, Occurrences, domains, mappings and Operator ports.
- Component and effect packages own their opaque execution programmes.
- Output policy owns frame rate and canvas closure.
- `@hypit/html-program` owns the terminal document, resource plan and frame-page ABI.
- Execution implementations own staging, decoding, browser lifecycle, capture and encoding.
- `@hypit/html-video` owns final visual/audio delivery assembly.

Lowering is one-way: upstream audiovisual relations produce this terminal programme, while renderers consume it.
