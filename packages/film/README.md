# `@hypit/film`

The author declaration, Fragment and assembly Producers receive the same Timeline through a `timeline` input.
Partial, overlapping or absent semantic coverage all use that complete range.

Official package-owned assembly layer between peer Tracks and the generic Composition waist.
Film is an ordinary author component and an optional Target, not a Core root or a privileged video
type.

The official video Distribution installs Film as an ordinary default npm dependency. Film owns its
author declaration, assembly Producers and Studio film companion together; the reusable companion is
published as `@hypit/film/studio`. Composition remains the shared value below it, so another author
package can assemble the same public result without importing Film.

The package lowers one concrete Film declaration into a finite `FilmTrackSet` fold, then compiles
that set into `Composition`. Root `<film:Track>` accepts VisualTrack or AudioTrack; nested
`<film:Stack>` recursively groups visual members, and `<film:Process>` combines named visual input
Scopes through a package-owned effect. Every Core Operation retains a fixed
manifest-declared port list and one atomic result.

`FilmTrackSet` is an immutable lowering value, not an author-facing workflow collection. Each append
receives the previous set and newly added Track through explicit graph edges. The domain value copies
no lineage metadata. Final Composition keeps named parent memberships as assembly structure. Every
visual Track, Stack and Process receives a sibling-unique `id` from its parent Scope. Sibling array position is
the paint order, from back to front; Track-local item position follows the same rule. A Track value may
be placed repeatedly through different member ids. Root audio contributions are additive and have no
visual occurrence id or paint position. They are not keyed by AudioTrack id;
selecting equal closed signals twice contributes twice. The author declaration rejects writing the
same Source reference twice and directs intentional repeated routing through Audio Mix.

The package-owned `film` declaration compiler validates an imported generic SVS Recipe into a nominal
`FilmProgram`, receives Canvas and the selected time source through separate explicit edges,
passes the Timeline directly, type-checks each `<film:Track source={...}/>` reference and generates
the finite fold. Visual Tracks require `id`; Audio Tracks reject it. Canvas is the only
dimension truth, Timeline is the only time-range truth, and FilmProgram owns only assembly
identity, clear color and its selected working picture. Omitting `picture` preserves the SDR sRGB
working picture; a Film that needs another space references an ordinary `@hypit/media`
`WorkingPictureSpec`. Film does not name HDR formats or renderers.
Its recursive Track/Stack/Process grammar is expressed by declaration-local child groups in the syntax-neutral
Author shape. Markup contributes only the `Film` spelling; direct callers and other Frontends use the
same compiler. Film consumes a completed Timeline and has no runtime dependency on Temporal or its
Markup helpers.
Child order is visual structure, so Film needs no second numeric ordering channel. Visual occurrence
identity belongs to Film; Track value identity, Present identity and timing remain in their own typed
values. Final rendering is a separate author package and capability.

For example, after the named inputs are declared:

```svml
<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline}
  appearance={recipes.film.vertical} picture={hdr-working}>
  <film:Track id="picture" source={picture.visual}/>
  <film:Track source={mix.audio}/>
  <film:Stack id="treated">
    <film:Track id="coverage" source={coverage.visual}/>
    <film:Track id="look" source={look.visual}/>
  </film:Stack>
  <film:Track id="captions" source={captions.visual}/>
  <film:Track source={music.audio}/>
</film:Film>
```

A sibling matte is an ordinary Process. The effect package declares the exact input contract; Film
does not enumerate matte kinds or infer inputs from Track names or adjacency:

```svml
<import as="matte" from="@hypit/visual-matte@1"/>
<matte:Effect id="subject-alpha" channel="alpha" invert="false"/>

<film:Process id="cutout" effect={subject-alpha}>
  <film:Input name="content">
    <film:Track id="subject" source={subject.visual}/>
  </film:Input>
  <film:Input name="matte">
    <film:Track id="alpha" source={subjectMask.visual}/>
  </film:Input>
</film:Process>
```

Each Input is itself a recursive visual Scope and may contain Tracks, Stacks or another Process.
The Process occupies one position in its parent Scope; its private input Pictures are consumed by the
effect rather than painted again as parent siblings. Input names must exactly match the selected
`VisualProcessEffect`. Audio Tracks remain Film-root contributions and cannot appear inside a visual
Stack, Process or Input.

The public output is `main.composition`. Including a Visual Track output does not automatically include
an Audio Track output derived from the same media. An opaque upper layer can cover a performance while
its separately included audio continues;
reordering visual siblings changes stacking. A Stack explicitly closes a local visual composite, so an
Adjustment inside it cannot affect pictures outside that Stack.

The `appearance` Recipe uses `background`, for example `film.vertical { background: #18212A; }`.
The compiled FilmProgram's field is `clearColor`; it is not a Recipe key named `clear-color`.
