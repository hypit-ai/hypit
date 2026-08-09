# SVML Depth-Stack Deck Track

Status: design authority for the official depth-stack Deck migration. It records the behavior used
by the old Deck implementation, but it is not a frozen public ABI and does not define a universal
Deck protocol.

## 1. Conclusion

A Deck is not a Media Item mode and is not the third primitive of Media Track. It is a higher-order
visual component whose members happen to use media material.

The first official implementation is provisionally `@narratage/deck-track`. Its honest author
meaning is a **depth-stack Deck**:

```text
ordered Cards
semantic activation points
current Card
visible previous/future neighborhood
relative-depth layout
whole-collection state transition
ordinary VisualTrack output
```

It is a peer of Media Track, Text, Caption and Ranking:

```text
Media Item / Sequence ─┐
Depth-Stack Deck ──────┤
Text ──────────────────┼─> ordinary VisualTrack values ─> Composition
Caption ───────────────┤
Ranking ───────────────┘
```

Core, Film, Composition and HyperFrames do not know that a contribution came from a Deck.

## 2. Why Deck is outside Media Track

A Media Item answers how one material appears. A Media Sequence answers how members replace one
another on one shared surface. A depth-stack Deck answers a different question: how an entire
ordered collection changes pose when its current member changes.

At one frame a Deck may simultaneously show:

- the current Card;
- several retained historical Cards;
- several future preview Cards;
- different offsets, scales, rotations, opacity and tone by relative depth;
- a transition in which every retained Card moves from its old pose to its new pose.

That is collection state, not source sampling, fitting or an outgoing/incoming pair handoff. Keeping
it inside Media Track would make one historical presentation model look like a universal media
primitive.

## 3. No universal Deck contract yet

“Deck” is currently a design family, not a shared public Type. Other useful models may have
fundamentally different topology:

- horizontal or circular Carousel;
- fan layout;
- Cover Flow;
- grid with a distinguished current member;
- freeform collage;
- time-axis history;
- a Ranking board whose board and entries evolve together.

Those packages may define different author Surfaces, validation and lowering. They need only emit
the terminal `VisualTrack` contract. We should extract a shared Deck library only after multiple
real implementations prove a smaller common law. Merely sharing the noun “Deck” is not evidence for
a central protocol.

Consequently the first package should expose an honest component name such as `DepthStack`, rather
than claiming that its fields describe every possible Deck.

## 4. Package boundary

The intended relationship is:

```text
@narratage/temporal       point location and exact trigger schedule
@narratage/spatial        Canvas, Placement Frame and fitted geometry
@narratage/media          normalized still/timed/Surface material
@narratage/media-track    focused reusable media-layer lowering implementation
@narratage/deck-track     DepthStack author Program, state and reflow lowering
@narratage/composition    terminal VisualTrack waist
```

`@narratage/deck-track` may reuse focused implementation functions from Media Track or a later
implementation-only media-lowering library. That code reuse does not make Deck a Media Track
component and does not expose a universal `MediaProgram` or `DeckProgram` through Core.

The package does not:

- generate Card images or videos;
- select Providers or credentials;
- infer Cards from URLs, directories or media metadata;
- inspect another Track or the accumulated lower composite;
- reserve a global stacking band;
- add Deck meaning to Core, Film, Composition or HyperFrames.

Every Card source, label, trigger and sound dependency is an explicit graph reference.

## 5. Illustrative author Surface

The syntax is not frozen, but package ownership should be visible:

```xml
<deck:DepthStack
  id="proof-stack"
  map={timing.map}
  space={speech.space}
  canvas={vertical}
  frame={layout.lower-proof-stack}
  until={story.selection.proof.end}
  appearance={studio.deck.proof}
>
  <deck:Card id="proof-1" source={proof1.image} at={story.moment.proof1}/>
  <deck:Card id="proof-2" source={proof2.image} at={story.moment.proof2}/>
  <deck:Card id="proof-3" source={proof3.video} at={story.moment.proof3}/>
</deck:DepthStack>
```

The component itself produces an ordinary `VisualTrack`. It is not nested in `<media:Track>` and it
is not selected through `mode="deck"`.

SVML owns topology: ordered Card membership, source edges, trigger references, terminal point,
Frame and optional label inputs. SVS owns reusable parameters: visible neighborhood, depth poses,
frame Paint and reflow motion. SVS cannot create Cards, hide source edges or choose a Provider.

## 6. Exact state model

Let authored Card activation frames be:

```text
p1 < p2 < ... < pN < T
```

where `T` is the explicit terminal point. At frame `f`:

```text
current(f) = greatest i such that pi <= f
```

Before `p1`, the component is outside its active state unless an explicit initial-state policy says
otherwise. At and after `T`, it is outside the active state except for its explicitly authored exit
motion.

The package validates authored occurrence order. It never sorts equal, reversed or missing trigger
points into a seemingly valid presentation.

Visibility is an explicit package parameter:

```ts
type DepthStackVisibility = {
  readonly previous: number;
  readonly next: number;
  readonly wrap: boolean;
};
```

Every visible Card receives an integer relative depth around `current(f)`. A pure layout function
maps that depth to its pose:

```ts
type DepthStackPose = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotationDeg: number;
  readonly opacity: number;
  readonly stacking: number;
  readonly tone?: DeckCardTone;
};
```

The public author model should expose named pose/visibility Recipes, not require authors to repeat
the complete table inline.

## 7. Reflow is a collection transition

When Card `i` becomes current, every Card visible in either the old or new state obtains an old pose
and a new pose. The reflow transition interpolates between those poses with one exact duration and
one easing law.

This differs from a Media Sequence handoff:

```text
Sequence transition   coordinates outgoing member + incoming member
Deck reflow           coordinates the union of old-visible + new-visible Cards
```

They must not share one `transitionStyle` union. A Card may additionally have owned current-card
emphasis, but it cannot mutate pixels belonging to another Track.

The renderer evaluates state and pose as pure functions of the absolute frame. It does not retain
mutable “previous frame” state. Therefore arbitrary-frame rendering, chunked Lambda rendering and
out-of-order frame evaluation remain deterministic.

## 8. Card material and playback

Each Card may reuse the same explicit layer, Content Fit, clipping and frame-Paint laws as a Media
Item. That is implementation reuse, not author-model inheritance.

Timed Card sources must define how they sample while not current:

```text
future preview   hold source head, or sample an explicitly selected visible clock
current Card     sample according to its authored active-phase occupancy
past trail       hold source tail, continue, or hide according to explicit policy
```

Still material needs no playback policy. A video must never silently finish while it is only a
future preview.

Card labels are optional explicit Text inputs. The Deck package may reuse typography lowering, but
it cannot derive Text truth from filenames, URLs or hidden image metadata.

The initial DepthStack is visual-only. If a later Deck component exposes source audio, it must do so
as a separate explicit `AudioTrack` projection with an authored current-member/handoff law; audio
must never become audible merely because a Card's container contains a stream.

## 9. Stacking

Deck Track has no track-level z-index and creates no stacking context. The board/background and
individual Cards may lower to separate absolute-stack Presents when peer Tracks need to interleave
between them.

Relative depth determines only ordering among owned Cards. Temporary ordering during reflow exists
only inside that explicit relationship. It does not allocate a global z band.

## 10. Migration from Twinit

Retain from the old Deck implementation:

- explicit authored Card order;
- semantic trigger-driven current state;
- configurable previous/future visibility;
- finite or explicit wrapping behavior;
- depth offset, scale, alternating rotation, opacity and tone;
- whole-group entry, sustain and exit motion;
- full-group interpolated reflow;
- frame Paint, padding, radius, border and shadow;
- deterministic frame-local evaluation.

Retire:

- treating Deck as a B-roll or Media mode;
- implicit `linkNext` topology;
- placement semantics hidden behind “usually below the face”;
- automatic labels from source metadata;
- lower-composite transitions;
- lane-global sound defaults;
- any registry entry in Core, Film, Composition or HyperFrames.

## 11. Implementation and acceptance order

1. implement the shared Temporal and Spatial slices;
2. expose `DepthStack` and explicit ordered Cards;
3. resolve exact trigger state and finite visibility;
4. reuse focused media-layer lowering for Card contents;
5. add pure relative-depth pose resolution;
6. add collection reflow and whole-group lifecycle motion;
7. prove still and timed inactive-playback behavior;
8. migrate one real old-system Deck and freeze only after the acceptance matrix passes.

Required evidence includes:

- previous-only, next-only and mixed neighborhoods;
- zero, one and many visible neighbors;
- finite boundaries and explicit wrapping;
- missing, equal and reversed trigger rejection;
- depth pose, alternating rotation, opacity and tone;
- cut and interpolated whole-collection reflow;
- still and timed Card sampling laws;
- optional exact-font labels;
- whole-group entry/sustain/exit without overwriting Card poses;
- byte-identical frames under sequential, partitioned and out-of-order rendering;
- installation of another Deck package without changing Core or the first DepthStack package.
