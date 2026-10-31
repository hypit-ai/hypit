# `@hypit/visual-combine`

Visual Combine concatenates the ordered Item programmes of completed `VisualTrack` values and
publishes one new ordinary `VisualTrack`. It adds no Window, time mapping, transition or rendering
step. A `Use` keeps its source Track's internal order; `Use` declaration order is the complete
back-to-front order between sources.

```svml
<import as="combine" from="@hypit/visual-combine@1"/>

<combine:Track id="motion" timeline={story.timeline}>
  <combine:Use id="opening" source={opening.visual}/>
  <combine:Use id="comparison" source={comparison.visual}/>
  <combine:Use id="editor" source={editor.visual}/>
  <combine:Use id="outro" source={outro.visual}/>
</combine:Track>
```

The result is available as `{motion.visual}` and can enter Film or another Visual Combine like any
other VisualTrack. Sources may be disjoint or overlap. During an overlap, later Uses paint above
earlier Uses. Visual Combine never sorts by Window, infers a transition, or rejects overlap.

This operation is equivalent in Picture semantics to placing the source Tracks as adjacent members
of the same Film Scope, except that the result has one new Track occurrence when Film consumes it.
It does not render, flatten or close the sources. A source-free Adjustment in a later source still
transforms the picture accumulated below its paint position. Wrapping the combined Track in a Film
Stack is equivalent in Picture semantics to placing the original Tracks in that Stack in the same
order: the Stack starts the whole programme from Transparent. Use an explicit Transition, Process or
project component when an overlap needs a relation beyond ordered painting.

Every Use has an explicit identity. Visual Combine namespaces top-level Visual Item ids by that
identity so independently authored Tracks may reuse local names. It preserves `subjectId`, spans,
visibility, sampling and renderer programmes. All sources must belong to the selected Timeline.

The direct package operation accepts the complete ordered Use list and builds the result in one
linear pass. Author Graph Operations retain fixed manifest-declared ports, so declaration lowering
does not add a variadic Core exception: it namespaces each Use once, concatenates package-private
blocks through a balanced pure reduction, and publishes only the final ordinary VisualTrack.
No prefix Set, author metadata or retained Result is created.
