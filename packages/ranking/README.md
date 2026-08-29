# @hypit/ranking

Progressive-ranking author components over a shared schedule utility:

- `Column`
- `TopThree`

The package consumes SemanticTrack timing, spatial frames, fonts, optional icons and sound, then
lowers each component to peer `VisualTrack` and optional `AudioTrack` values. Styles are compiled
from typed SVS Recipes and exact font references. Visible copy may be literal or an existing graph
`Text` reference.

`Column` assigns rows by explicit rank. Non-preset rows own disjoint reveal windows inside the
board lifetime; preset rows are settled from the first frame. `TopThree` assigns up to three items
to explicit trigger instants and a terminal instant.

```svml
<ranking:Column id="priorities" semantic={speech.semantic} canvas={vertical}
  frame={layout.ranking} during={story.segment.ranking} style={ranking-style}>
  <ranking:ColumnItem rank="1" label="Winner" during={story.selection.winner}/>
  <ranking:ColumnItem rank="2" preset="true" label="Already placed"/>
</ranking:Column>
```
