# SVML Ranking Track

## 1. What Ranking means

Ranking is a video-domain author component that presents one ordered collection as a progressive
visual state. It is not a Core concept, a generic Track mode, a Provider or a renderer feature.

One physical package, `@narratage/ranking@1`, exposes
four independent author components:

- `ranking:TierBoard` — place revealed items into named tier rows;
- `ranking:Column` — show one current item on a stage, then settle it into a numbered column;
- `ranking:TopThree` — progressively reveal up to three items and accent the current item;
- `ranking:TypewriterList` — type ordered text rows onto a persistent paper/list surface.

One package is the right unit for shared validation, schedule construction, layout utilities and
paint primitives. Four components are the right unit for author meaning. There is no public
`rankingType`, mode-selection input, dynamic-port registry or Runtime renderer registry.

A third party can publish another Ranking package without registering a type in Core or modifying
this package. Installing and importing that package contributes its own Surface, Types, validators
and fragment compiler through the ordinary module mechanism.

## 2. Author-facing shape

The executable author Surface is:

```svml
<import as="ranking" from="@narratage/ranking@1"/>
<import as="fonts" from="@narratage/fonts-open@1"/>
<import as="studio" source="./studio.svs"/>

<fonts:Stack id="ranking-fonts" family="inter" weight="700"/>

<ranking:ColumnStyle id="column-style"
  recipe={studio.ranking.column}
  font={ranking-fonts}/>

<ranking:Column id="tools"
  space={speech.space}
  map={timing.map}
  during={story.selection.ranking-board}
  triggers={story.moment.next-rank}
  terminal={story.moment.ranking-complete}
  style={column-style}>
  <ranking:ColumnItem label="Fourth" icon={fourth.image}/>
  <ranking:ColumnItem label="Third" icon={third.image}/>
  <ranking:ColumnItem label="Second" icon={second.image}/>
  <ranking:ColumnItem label="First" icon={first.image}/>
</ranking:Column>
```

`during` supplies the explicit outer window. `triggers` supplies an ordered Moment occurrence set.
`terminal` is the explicit end of the final active stage; it may precede the outer end so the fully
settled result remains visible. The component requires the number of trigger occurrences to equal
the number of child items and zips them in authored order.

The outer Selection and terminal Moment each use strict `one` semantics. The trigger Moment uses
strict `each` semantics. Zero or multiple outer/terminal occurrences, zero triggers and any
trigger/item cardinality mismatch are compile errors; the component never selects a convenient
occurrence.

This positional zip is declared by these four components. It is not generic Core behavior. An
alternative third-party Surface may give each item its own Moment edge and lower to the same
package facts.

Style declarations remain separate from use. SVS supplies named generic Recipe data; each
variant-specific `*Style` component owns the allowed keys and compiles the Recipe plus explicit font
edges into a typed package-owned Style. Semantic item values such as tier row, label, icon and entry
behavior are not paint properties and do not belong in SVS.

## 3. The group sees siblings; rendered Tracks do not

A progressive ranking cannot be compiled by treating every child as an isolated Track item. Row
placement, successor handoff, active-item state and the settled prefix depend on the ordered group.
That does not mean items inspect one another at render time.

The author component first compiles the complete child list and trigger set into one package-private
schedule:

```ts
type RankingSchedule = {
  readonly outer: FrameSpan;
  readonly terminalFrame: number;
  readonly entries: readonly {
    readonly itemId: string;
    readonly triggerOccurrenceId: string;
    readonly triggerFrame: number;
    readonly stage: FrameSpan;
    readonly cumulative: FrameSpan;
  }[];
};
```

This is an explicit Graph value between deterministic Operations, not metadata smuggled through an
image, Track or media Artifact. It is owned and versioned by the Ranking package and is not added to
Core, Composition or the shared Track waist.

```text
Moment set + SemanticMap + ProgramSpace + outer/terminal projection + ordered item ids
                                      │
                                      ▼
                              RankingSchedule
                                │          │
             Style + content ───┘          └── SFX clips + gains
                     │                              │
                     ▼                              ▼
                VisualTrack                    AudioTrack
```

The schedule Operation preserves source order and stable occurrence identities. It never sorts by
physical time. After frame quantization it requires:

```text
outer.start <= p1 < p2 < ... < pN < terminal <= outer.end
```

Every invalid or equal-frame sequence fails atomically. The visual and optional audio lowerers
consume the same schedule, so motion and sound cannot drift while remaining independently
demandable branches of the Run Graph.

## 4. Common phase model

For outer window `[B, O)`, triggers `p1 ... pN` and terminal `T`, entry `i` receives:

```text
active stage       [p_i, p_(i+1))    or [p_N, T)
cumulative life    [p_i, O)
settled life       [stage.end, O)
```

`[B, p1)` may show an explicitly authored empty board, but has no implicit active item. `[T, O)` is
the optional fully-settled suffix with no active item. These facts are package-owned sibling
sequencing built on the shared temporal projection algebra in
[`track-authoring.md`](./track-authoring.md); they are not a new `Stage` contract.

### TierBoard

- the board occupies `[B, O)`;
- every item is visible cumulatively from its trigger to `O`;
- `entry="direct"` animates directly into its final tier cell after the trigger;
- `entry="stage"` appears at the shared stage point, remains there for its active stage, moves into
  the final cell before the stage ends and then stays settled;
- the item owns a required image and tier-row id; source order within a row determines its cell;
- impossible appear/move durations are compile errors, never silently shortened or omitted.

### Column

- the numbered board occupies `[B, O)`;
- exactly one item occupies the large stage during each active stage;
- when its stage ends, that item becomes part of the settled column until `O`;
- label is required, image is optional, and rank is the authored item order;
- overlapping current items are structurally impossible after a valid schedule.

### TopThree

- at most three items are accepted;
- each item is revealed cumulatively from its trigger to `O`;
- only the item for the current active stage receives the active ring/accent motion;
- `[T, O)` shows all revealed items without an active accent;
- label is required, image is optional, and slot is the authored item order.

### TypewriterList

- the paper occupies `[B, O)` and blank rows may be structurally reserved before their trigger;
- row `i` begins typing at `p_i` and remains visible until `O`;
- typing duration is derived deterministically from Unicode grapheme count and the Style's speed;
- typing and an optional winner mark must fit inside the item's active stage or compilation fails;
- title, optional explicit emphasis span and row strings are author content, not LLM fields.

Typewriter is retained in the Ranking package because its author meaning is an ordered progressive
ranking, despite its heavy use of text layout. It may share low-level exact-font/layout utilities
with the future Text implementation, but it must not depend on or masquerade as a generic Text
Track Program.

## 5. Spatial layout and stacking

Each component owns one outer placement box and its internal layout algorithm. A Tier cell, Column
row or Top Three slot is not a generic per-item spatial locator. Allowing arbitrary spatial inputs
on those children would destroy the component's meaning.

Placement and stacking remain independent:

- the outer box determines the coordinate system for board, stage and items;
- the Style resolves an absolute board stack order and defaults for stage/items;
- every child may explicitly override its own absolute item stack order;
- board, stage decoration and each item lower to separate `VisualPresent` values where independent
  interleaving is required;
- one resulting `VisualTrack` is not a stacking context, so a peer Track Present may appear between
  the board and any icon.

No package must emit multiple Tracks merely to obtain multiple z positions. Stable `tieBreak`
values derive from authored component/item identity, never evaluation order.

All normalized geometry is relative to the explicit outer box. Required variant dimensions include:

- Tier: row definitions/colors, board/label widths, stage point, cell gaps, icon fit/radius and
  appear/move durations;
- Column: board box, row height/gap, stage point/size, cell/icon geometry, rank palette and
  appear/move durations;
- Top Three: center/width, label line, icon size, ring width/palette and reveal/accent motion;
- Typewriter: paper theme/paint, padding, row gap, title/item typography, rotation, typing speed and
  winner-marker paint/motion.

Paint, geometry and motion parameters are validated by the owning `*Style` component. Unknown
Recipe properties fail. There is no arbitrary CSS escape hatch.

## 6. Media, fonts and sound

Images and sounds enter through explicit `BlobArtifact` edges. Fonts enter through explicit,
content-addressed font stack edges. Ranking never stores a URL, asks the Runtime to choose a font,
or names a renderer component.

Optional sound effects are ordinary authored inputs:

- appear sound starts at the item's trigger;
- move sound is derived from the same scheduled move phase used by the visual lowerer;
- gain and clip choice live in the Style/explicit sound inputs;
- configured sound produces a peer `AudioTrack`; no sound produces no demanded audio branch;
- sound playback never enters Hyperframes or a visual Track.

Ranking itself is deterministic and has no Need, Provider, queue, credential or environment
adapter. If an input image is generated, that upstream generation remains another Graph component.

## 7. Run-Graph behavior

The author graph exports ordinary logical `visual` and, when authored, `audio` results. Targets,
Candidates and replacement are governed by the same Run Graph laws as every other component.
Ranking adds no cache, pin or preview primitive.

Replacing the visual result does not mutate the audio result. Replacing both outputs with one
multi-output Candidate is also possible through ordinary explicit output mapping. Once every
demanded original output is satisfied by selected Candidates, demand analysis prunes the original
Ranking branch and its temporal/media ancestors. No special Ranking execution rule is required.
