# `@hypit/deck-track`

The official, deliberately narrow depth-stack Deck author package.

`DepthStack` owns ordered Cards, semantic activation points, a finite visible neighborhood,
relative-depth poses and one deterministic whole-collection reflow. Card pixels reuse the focused
Media layer lowerer, but Deck is not a Media mode and exports only an ordinary peer `VisualTrack`.

```xml
<import as="copy" from="@hypit/text@1"/>

<copy:Value id="proof-label">Evidence, not inference</copy:Value>
<deck:Label id="proof-label-style" content={proof-label}
  font={fonts.ui} size="34" color="#ffffff"/>

<deck:DepthStack
  id="proof-stack"
  map={timing.map}
  space={speech.space}
  canvas={vertical}
  frame={layout.proof-stack}
  until={story.selection.proof}
  appearance={studio.deck.proof}
>
  <deck:Card id="proof-1" source={proof1.image} extent={proof1.extent}
    at={story.moment.proof1} label={proof-label-style}/>
  <deck:Card id="proof-2" source={proof2.video} at={story.moment.proof2}/>
</deck:DepthStack>
```

The parent Recipe owns visibility, relative-depth pose progression, frame Paint, whole-group
motion and reflow. A Card Recipe may additionally select explicit future/past playback. Timed
`continue` is legal only with an active `loop-start` clock, so preview and trail sampling can never
silently depend on renderer playback history.

Optional labels are separate exact-font values and are referenced by Cards. Filenames, URLs and
media metadata are never treated as label truth.

`deck:Label` accepts either literal body copy or `content={Text}`. It binds that copy to exact font
and label appearance in a small explicit Fragment. The Deck Track receives the resulting label as
one normal edge; it never reads filenames, URLs or hidden media metadata.

The package has no Provider, Need, queue, credential, global z band or cross-Track input. Another
Deck family can install independently and lower to the same terminal `VisualTrack` without changing
this package, Core, Film, Composition or HyperFrames.
