# @hypit/ranking

Three independent progressive-ranking author components over one private schedule utility:

- `TierBoard`
- `Column`
- `TopThree`

The package owns variant-specific Programs and Styles. It consumes explicit Segment/Selection/Moment,
SemanticTrack, SpatialFrame, font, image and optional sound edges, then lowers to peer
`VisualTrack` and optional `AudioTrack` values. It adds no Ranking field to Core, Composition or
Visual IR.

Each `*Style` declaration compiles one SVS Recipe and exact font reference into its visual Style
plus a private named `.sound` Style output. A Ranking component connects both outputs when authored
sound exists; no sound produces no audio branch.

Visible author copy may be literal or an ordinary graph `Text` reference. Column and TopThree use
`label={copy}`. When a reference is used, the graph first materializes the package-owned item shell
from that exact Text and then shares the one result across schedule, event and render work. Tier row
names remain Style configuration because they define the board vocabulary rather than dynamic item
copy.

```svml
<import as="copy" from="@hypit/text@1"/>

<copy:Value id="winner">No hidden runtime choice</copy:Value>

<ranking:Column id="priorities" semantic={speech.semantic} canvas={vertical}
  frame={layout.ranking} during={story.segment.ranking}
  style={ranking-style}>
  <ranking:ColumnItem rank="1" label={winner}
    during={story.selection.winner-reveal}/>
  <ranking:ColumnItem rank="2" preset="true" label="Already placed"/>
</ranking:Column>
```

Column separates placement from reveal time. `rank` determines the numbered row only. Every
non-preset Item owns one Selection whose projected window is its reveal interval. Every sibling
window must already be disjoint and contained by the container's Segment/Selection `during` span;
invalid input is refused instead of clamped or rearranged. Reveal time, child order and rank may all differ. A preset Item
has no child `during` and is settled from the beginning of the outer window.

TierBoard and TopThree triggers and terminals are explicit `TemporalPoint` values. Column outer and
reveal inputs remain `TemporalWindow` values. Ranking consumes those projections plus
ProgramSpace and owns only the subsequent visual schedule; it does not locate
Moment/Selection frames internally.

The Column's `frame` is the fixed left ranking rail; `canvas` supplies the independent coordinate
space for the large reveal stage. `stage-x` and `stage-y` are normalized Canvas coordinates. Each
normal reveal rises from below the Canvas, holds on that stage, then shrinks and moves into its
ranked content slot.
