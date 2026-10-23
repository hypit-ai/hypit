# `@hypit/film`

The Surface, Fragment and assembly Producers receive the same Timeline through a `timeline` input.
Partial, overlapping or absent semantic coverage all use that complete range.

Official package-owned assembly layer between peer Tracks and the generic Composition waist.
Film is an ordinary author component and an optional Target, not a Core root or a privileged video
type.

The official video Distribution installs Film as an ordinary default npm dependency. Film owns its
author Surface, assembly Producers and Studio film companion together; the reusable companion is
published as `@hypit/film/studio`. Composition remains the shared value below it, so another author
package can assemble the same public result without importing Film.

The package lowers one concrete Film declaration into a finite `FilmTrackSet` fold, then compiles
that set into `Composition`. Root `<film:Track>` accepts VisualTrack or AudioTrack; nested
`<film:Stack>` recursively groups only visual Tracks and Stacks. Every Core Operation retains a fixed
manifest-declared port list and one atomic result.

`FilmTrackSet` is an immutable lowering value, not an author-facing workflow collection. Each append
receives the previous set and newly added Track through explicit graph edges. The domain value copies
no lineage metadata. Final Composition keeps named parent memberships as assembly structure. Every
visual Track and Stack receives a sibling-unique `id` from its parent Scope. Sibling array position is
the paint order, from back to front; Track-local item position follows the same rule. A Track value may
be placed repeatedly through different member ids. Root audio contributions are additive and have no
visual occurrence id or paint position. They are not keyed by AudioTrack id;
selecting equal closed signals twice contributes twice. The author Surface still rejects writing the
same Source reference twice and directs intentional repeated routing through Audio Mix.

The official Structured Surface validates an imported generic SVS Recipe into a nominal
`FilmProgram`, receives Canvas and the selected time source through separate explicit edges,
passes the Timeline directly, type-checks each `<film:Track source={...}/>` reference and generates
the finite fold. Visual Tracks require `id`; Audio Tracks reject it. Canvas is the only
dimension truth, Timeline is the only time-range truth, and FilmProgram owns only assembly
identity and clear color.
Child order is visual structure, so Film needs no second numeric ordering channel. Visual occurrence
identity belongs to Film; Track value identity, Present identity and timing remain in their own typed
values. Final rendering is a separate author package and capability.

For example, after the named inputs are declared:

```svml
<film:Film id="main" canvas={vertical.canvas} timeline={speech.timeline}
  appearance={recipes.film.vertical}>
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

The public output is `main.composition`. Including a Visual Track output does not automatically include
an Audio Track output derived from the same media. An opaque upper layer can cover a performance while
its separately included audio continues;
reordering visual siblings changes stacking. A Stack explicitly closes a local visual composite, so an
Adjustment inside it cannot affect pictures outside that Stack.

The `appearance` Recipe uses `background`, for example `film.vertical { background: #18212A; }`.
The compiled FilmProgram's field is `clearColor`; it is not a Recipe key named `clear-color`.
