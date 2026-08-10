# @narratage/ranking

Four independent progressive-ranking author components over one private schedule utility:

- `TierBoard`
- `Column`
- `TopThree`
- `TypewriterList`

The package owns variant-specific Programs and Styles. It consumes explicit Selection/Moment,
SemanticMap, ProgramSpace, SpatialFrame, font, image and optional sound edges, then lowers to peer
`VisualTrack` and optional `AudioTrack` values. It adds no Ranking field to Core, Composition or
Visual IR.

Each `*Style` declaration compiles one SVS Recipe and exact font reference into its visual Style
plus a private named `.sound` Style output. A Ranking component connects both outputs when authored
sound exists; no sound produces no audio branch.

Visible author copy may be literal or an ordinary graph `Text` reference. Column and TopThree use
`label={copy}`, while Typewriter uses `title={copy}` and `text={copy}`. When a reference is used, the
graph first materializes the package-owned item shell from that exact Text and then shares the one
result across schedule, event and render work. Tier row names remain Style configuration because
they define the board vocabulary rather than dynamic item copy.

```svml
<import as="copy" from="@narratage/text@1"/>

<copy:Value id="winner">No hidden runtime choice</copy:Value>

<ranking:Column id="priorities" map={timing.map} space={speech.space}
  frame={layout.ranking} during={story.selection.ranking}
  triggers={story.moment.ranking-items} terminal={story.moment.ranking-end}
  style={ranking-style}>
  <ranking:ColumnItem label={winner}/>
</ranking:Column>
```

See [`../../spec/ranking-track.md`](../../spec/ranking-track.md) for the normative pre-release model.
