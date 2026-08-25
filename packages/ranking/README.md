# @hypit/ranking

Three independent progressive-ranking author components over one private schedule utility:

- `TierBoard`
- `Column`
- `TopThree`

The package owns variant-specific Programs and Styles. It consumes explicit Program/Segment/Selection/Moment,
SemanticTrack, Canvas, SpatialFrame, font, image and optional sound edges, then lowers to peer
`VisualTrack` and optional `AudioTrack` values. It adds no Ranking field to Core, Composition or
Visual IR.

Each `*Style` declaration compiles one SVS Recipe and exact font reference into its visual Style
plus a private named `.sound` Style output. A Ranking component connects both outputs when authored
sound exists; no sound produces no audio branch.

Ranking Recipe vocabulary is typed at the domain boundary. `rank-colors` and
the exactly-three `slot-colors` are color lists; Tier `rows` is a list of
`{ id, label, color }` records. SVS therefore preserves those values directly
instead of hiding them in `|`- or `:`-delimited strings. Studio may render the
same schema as a palette/list through `ranking-studio`, while other editors and
diagnostic tools can consume it without depending on Studio.

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
non-preset Item owns one Segment or Selection whose projected window is its reveal interval. Every sibling
window must already be disjoint and contained by the container's Program/Segment/Selection `during` span;
invalid input is refused instead of clamped or rearranged. Reveal time, child order and rank may all differ. A preset Item
has no child `during` and is settled from the beginning of the outer window.

TierBoard follows the same window contract. A preset Item is settled from the start and has no
`during` or `entry`. Every other Item owns one Segment or Selection and explicitly chooses `entry="direct"` or
`entry="drop"`. The windows must be contained, non-empty and mutually disjoint. Presets take the
innermost cells in author order; non-preset Items then take cells from inside to outside in strict
window order, regardless of child order. Its board and explanation stage are independent: `frame`
is only the continuous colored-label/dark-content tier table, while `canvas` supplies the coordinate
space for the stage. A direct Item appears in place at its target cell with a quick scale overshoot
and soft settle. A drop Item uses the same in-place entrance on the stage, holds perfectly still
while that Item is discussed, and only follows an eased curved glide into its target cell during the
final `move-frames` ending exactly at the window boundary. It then remains settled.

TierBoard and Column accept `during="program"` when their outer lifetime is the complete
SemanticTrack domain. The author Surface projects that Program source to the same `TemporalWindow`
consumed by the Ranking schedule; the component does not learn a separate Program timing mode.

```svml
<ranking:TierBoard id="tiers" semantic={speech.semantic} canvas={vertical}
  frame={layout.tiers} during={story.segment.tiers} style={tier-style}>
  <ranking:TierItem tier="s" preset="true" icon={brand}/>
  <ranking:TierItem tier="a" entry="direct" icon={first}
    during={story.selection.first}/>
  <ranking:TierItem tier="a" entry="drop" icon={second}
    during={story.selection.second}/>
</ranking:TierBoard>
```

TopThree triggers and its terminal remain explicit `TemporalInstant` values. TierBoard and Column
outer/reveal inputs are `TemporalWindow` values. Ranking consumes those projections plus
ProgramSpace and owns only the subsequent visual schedule; it never locates Moment/Selection
frames internally.

TierBoard and Column both separate their compact `frame` from an independent Canvas stage.
`stage-x` and `stage-y` are normalized Canvas coordinates, and `stage-size` is independent from the
settled cell size. Column reveals rise from below the Canvas; Tier entries appear in place, and only
`drop` entries later move from the stage into the board.
