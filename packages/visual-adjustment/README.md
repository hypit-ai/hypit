# `@hypit/visual-adjustment`

Visual Adjustment produces ordinary terminal `VisualTrack` values whose items transform the picture
already accumulated before that Track's parent-Scope placement. It does not select Track identities
and does not own a new picture source. Its parent Film Scope places the Adjustment Track through sibling
declaration order; use Film `Stack` when an adjustment must be local to a group.

One Recipe combines orthogonal color, blur, opacity and affine parameters. Effects are parameters,
not separate component types:

```svs
<sheet version="1">
  look.cinematic {
    contrast: 1.08;
    saturation: 0.9;
    hue: -2;
    blur: 0;
  }
</sheet>
```

```svml
<adjust:Track id="look" timeline={story.timeline}>
  <adjust:Adjustment id="cinematic" during={story.body}
    appearance={recipes.look.cinematic}/>
</adjust:Track>
```

The package currently owns an HTML Adjustment programme. Composition retains only the renderer
programme carrier; unsupported renderers fail at their compilation boundary rather than silently
approximating the effect.

Its Studio Companion projects affine parameters under **Where** and color, blur and opacity under
**How**. Those fields edit the referenced Recipe. **Include in preview** is separate session state
owned by Studio: it temporarily evaluates this terminal contribution as identity without changing
the Recipe, Source or exported result.

`preview/preview.svml` is the visual acceptance work. It places one reusable VisualTrack twice in the
root VisualScope and once inside a nested Stack, then applies a whole-range transform and a bounded
grade to the nested occurrence. The foreground badge remains outside that local adjustment scope.
