# `@hypit/visual-adjustment`

Visual Adjustment produces ordinary terminal `VisualTrack` values whose items transform the Picture
already accumulated before that Track's parent-Scope placement. It does not select Track identities
and does not own a new picture source. Its parent Film Scope places the Adjustment Track through
sibling declaration order; use Film `Stack` when an adjustment must be local to a group.

The package owns only occurrence assembly: an identity, one resolved Window and one typed unary
Picture effect. Concrete effects belong to official, project or ecosystem packages. The official
starter set is `@hypit/visual-treatment`.

```xml
<import as="adjust" from="@hypit/visual-adjustment@1"/>
<import as="treatment" from="@hypit/visual-treatment@1"/>

<treatment:Color id="cinematic" contrast="1.08" saturation="0.9" hue="-2"/>

<adjust:Track id="look" timeline={story.timeline}>
  <adjust:Adjustment id="cinematic" during={story.body} effect={cinematic}/>
</adjust:Track>
```

Every effect produces `VisualAdjustmentEffect`, a renderer-programme carrier. Visual Adjustment
does not interpret its format or enumerate effect names. A renderer accepts the formats it can lower
and reports unsupported formats at that boundary. Several effects are several ordered Adjustment
occurrences, so composition order stays explicit.

The Studio companion projects occurrence timing and identity. Effect packages own parameter panels.
**Include in preview** is separate session state owned by Studio: it temporarily evaluates the
selected occurrence as identity without changing Source or exported results.

`preview/preview.svml` is the visual acceptance work. It places one reusable VisualTrack twice in the
root VisualScope and once inside a nested Stack, then applies a whole-range transform and bounded
color and blur treatments to the nested occurrence. The foreground badge remains outside that Scope.
