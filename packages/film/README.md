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
identity, clear color, its visual/audio plan and linked editing groups.
Film has no author-selectable color-space field and does not name delivery formats or renderers.
Its recursive Track/Stack/Process grammar is expressed by declaration-local child groups in the syntax-neutral
Author shape. Markup contributes only the `Film` spelling; direct callers and other Frontends use the
same compiler. Film consumes a completed Timeline and resolves Compound placement through a typed
Temporal Window and a source Instant.
Child order is visual structure, so Film needs no second numeric ordering channel. Visual occurrence
identity belongs to Film; Track value identity, Present identity and timing remain in their own typed
values. Final rendering is a separate author package and capability.

`Compound` references a local audiovisual Composition. Its `during` Window selects the parent
placement interval, and `from` selects the starting Instant on the source Timeline. The selected
source duration equals the parent interval duration. Multiple occurrences can share the same source
Composition while retaining their own intervals. Frame rates and canvas dimensions must match.
Compound members may appear at the Film root or inside a Stack; their visual sibling position sets
the stacking order, and their audio joins the parent mix. The Film Companion declares the source,
placement and source-position attributes for editor discovery.

```xml
<film:Film id="parent" canvas={canvas.canvas} timeline={parentTime.timeline}
  appearance={recipes.film.main}>
  <film:Stack id="sequences">
    <film:Compound id="opening" source={opening.composition}
      during={parentTime.opening} from={openingTime.inPoint}/>
  </film:Stack>
</film:Film>
```

Composition placement intersects visual and audio content with the selected interval. Media Maps
are sliced and rebased; animation clocks and audio level origins preserve the authored progress.
Each occurrence preserves its local canvas clear during its placed interval. Splitting an occurrence
creates two parent Windows and source Instants referencing the same Composition. Editing that source
updates both occurrences.

`Link` is a direct Film child that preserves a group of clips for coordinated editing. Each
`Member` selects a Track already included in the Film and a clip identity within that Track:

```xml
<film:Link id="camera-take">
  <film:Member source={picture.visual} clip="take-1"/>
  <film:Member source={sound.audio} clip="take-1-sound"/>
</film:Link>
```

A Link requires at least two distinct members. Each Track/clip pair belongs to at most one Link.
Film validates Track membership and checks clip identities when assembling the evaluated Tracks.
Positions and source ranges stay on the linked clips; editors preserve their relative offsets
when moving a group. Splitting, trimming and unlinking are explicit source editing transactions.
The Film Companion declares the Link/Member vocabulary for editor discovery.

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
