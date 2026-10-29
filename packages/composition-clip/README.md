# @hypit/composition-clip

Reuses one closed `Composition` in a parent Timeline. A concrete `CompositionOccurrence`
owns the shared temporal pullback; visual and audio uses then publish ordinary
`VisualTrack` and `AudioTrack` values without materializing an intermediate movie.

```xml
<import as="nest" from="@hypit/composition-clip@1"/>

<nest:Occurrence id="intro-use" timeline={main.timeline}
  source={intro.composition} during={intro-window}/>

<nest:Visual id="intro-picture" timeline={main.timeline}
  picture={look.picture} occurrence={intro-use.occurrence} frame={canvas.bounds}/>

<nest:Audio id="intro-sound" timeline={main.timeline}
  occurrence={intro-use.occurrence} gain="1" fade-in="0f" fade-out="0f"/>
```

`Occurrence` is the only owner of the target-to-child `TemporalMap`; optional `Map`
or `Curve` children use the same relation syntax as ordinary visual and audio clips.
`Visual` and `Audio` are independent projections, so a parent Film may select either
or both without enable flags. Visual nesting currently requires the child and parent
to share one exact `WorkingPictureSpec`. Audio nesting uses the fixed 48 kHz stereo
programme environment.
