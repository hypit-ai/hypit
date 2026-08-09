# SVML Ranking Track Migration

Status: normative design for the official Ranking migration. It records the author model and
lowering laws to implement after the shared temporal projection package. It is not a compatibility
promise for the historical Twinit node format or a frozen public ABI.

## 1. What Ranking means

Ranking is a video-domain author component that presents one ordered collection as a progressive
visual state. It is not a Core concept, a generic Track mode, a Provider or a renderer feature.

The old system placed four materially different behaviors behind one `ranking_track` node and a
`rankingType` switch. The new system uses one physical package, `@narratage/ranking@1`, but exposes
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

## 2. Evidence from the old implementation

The reviewed old-project inventory contains 21 migrated Ranking nodes:

| Historical variant | Reviewed uses | Item counts seen |
|---|---:|---|
| Tier | 10 | 5–6 |
| Typewriter | 5 | 5 |
| Column | 3 | 4–5 |
| Top Three | 3 | 3 |

The inventory proves that all four meanings are real, but not that their old representation should
survive. The old implementation had these structural problems:

1. one UI/node identity changed meaning by switching a mode and disconnecting its dynamic ports;
2. the same item `start/end` pair meant visibility, animation phase, successor handoff or nothing,
   depending on the renderer;
3. Top Three ignored item end times, while Typewriter used their union only to decide whether the
   paper was mounted;
4. renderers inspected all sibling segments, sorted or counted them, and manufactured group state
   after the generic Track Program had already lost that meaning;
5. one global z-index prevented the board and individual icons from interleaving with peer Tracks;
6. raw URLs, environment font names, Remotion component ids and three mirrored registries leaked
   environment/renderer details into the component;
7. short windows could silently suppress motion sound instead of rejecting an impossible schedule.

Migration preserves the useful visual capabilities, not these accidental semantics.

## 3. Author-facing shape

The exact XML spelling will be fixed with the temporal Surface parser. The intended shape is:

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

## 4. The group sees siblings; rendered Tracks do not

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

## 5. Common phase model

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

## 6. Spatial layout and stacking

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

## 7. Media, fonts and sound

Images and sounds enter through explicit `MediaArtifactRef` edges. Fonts enter through explicit,
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

## 8. Run-Graph behavior

The author graph exports ordinary logical `visual` and, when authored, `audio` results. Targets,
Candidates and replacement are governed by the same Run Graph laws as every other component.
Ranking adds no cache, pin or preview primitive.

Replacing the visual result does not mutate the audio result. Replacing both outputs with one
multi-output Candidate is also possible through ordinary explicit output mapping. Once every
demanded original output is satisfied by selected Candidates, demand analysis prunes the original
Ranking branch and its temporal/media ancestors. No special Ranking execution rule is required.

## 9. Migration order and acceptance

Implementation order:

1. implement the shared temporal projection and triggered-schedule laws;
2. create `@narratage/ranking@1` with four separate Programs/Styles and one private schedule utility;
3. lower TierBoard and Column first, because together they prove cumulative and exclusive stage
   semantics plus independent stacking;
4. lower TopThree;
5. lower TypewriterList using exact font/layout primitives;
6. add optional AudioTrack lowering from the same schedule;
7. add real-browser visual witnesses and one author-Surface graph check per component.

Acceptance requires:

- trigger/item cardinality, stable identities and all boundary failures are tested;
- `T < O` visibly proves a final settled suffix;
- short stages reject impossible animation rather than repairing it;
- board and per-item Presents interleave with a peer Track at unrelated absolute z positions;
- visual and sound event frames agree exactly;
- missing optional images work only for variants that declare them optional;
- fonts and media are content-addressed dependencies;
- each component can revise its own Program without changing Core, Runtime, Composition,
  Hyperframes or another Ranking component;
- installing a fifth component package requires no central family registry change.

The migration intentionally does not preserve historical node JSON, mode switching, old dynamic
ports, renderer ids or Remotion components. Historical projects are evidence and visual references,
not a compatibility obligation for an unreleased language.
