# `@hypit/visual-matte`

Official package-owned sibling matte effects for the generic visual Process relation.

A matte combines two already-formed Pictures. `content` is the Picture that remains visible;
`matte` supplies either alpha or luminance. The package does not inspect media, detect subjects,
move Tracks or choose sibling order. Each input is an ordinary recursive Film scope and may contain
one Track, several Tracks, a Stack or another Process.

```svml
<import as="matte" from="@hypit/visual-matte@1"/>

<matte:Effect id="alpha-matte" channel="alpha" invert="false"/>

<film:Film id="main" canvas={vertical.canvas} timeline={time.timeline} appearance={recipes.film}>
  <film:Process id="cutout" effect={alpha-matte}>
    <film:Input name="content">
      <film:Track id="subject" source={subject.visual}/>
    </film:Input>
    <film:Input name="matte">
      <film:Track id="subject-matte" source={subjectMask.visual}/>
    </film:Input>
  </film:Process>
</film:Film>
```

`channel` is `alpha` or `luminance`; the SDR luminance path uses alpha-weighted BT.709 coefficients
over the staged sRGB Picture. `invert` is explicit. The two input names are part of the
effect contract and Film rejects missing, repeated or additional inputs. The matte Picture is
consumed by the Process and is not painted as a peer. Both Pictures retain their own Timeline spans,
sampling, internal stacking and authored behavior.

This is distinct from a component-local `VisualMaskElement`: a local mask owns both element trees
inside one Present, while a sibling matte relates independently formed Picture scopes. It is also
distinct from a Transition: a Transition owns the intersection of adjacent Clip occurrences, while
a matte has no adjacency rule and remains structurally active for the Film Timeline.

The HTML renderer evaluates Process inputs as request-private Picture surfaces in recursive order.
This extra work occurs only when a Film contains a Process; the surfaces are not Results, authored
media or reusable metadata. Chromium and SDR Electron execute the same effect contract. The current
HDR10 Electron path rejects Process input passes because an 8-bit intermediate would change the
working Picture; HDR support requires a float shared-texture implementation of the same renderer-private
boundary rather than another author declaration.

The current HTML lowering executes Scope Process surfaces in the root Composition document. A matte
inside a nested child Composition is rejected explicitly until that renderer executes child-document
surfaces recursively; this does not change the matte effect or Film declaration.
