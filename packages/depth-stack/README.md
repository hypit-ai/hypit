# `@hypit/depth-stack`

Install in the video project alongside Hypit:

```bash
npm install @hypit/depth-stack
```

The package-owned DepthStack declaration accepts `timeline={program.timeline}` plus absolute reveal and terminal Instants.
Those Instants may be authored directly or published by a domain projector upstream.

The official, deliberately narrow depth-stack Deck author package.

`DepthStack` owns ordered Cards, activation points, a finite visible neighborhood,
relative-depth poses and one deterministic whole-collection reflow. Card pixels reuse Visual Track's
focused material lowerer, but Deck is not a Visual Clip mode and exports only an ordinary peer
`VisualTrack`.

```xml
<import as="copy" from="@hypit/text@1"/>

<copy:Value id="proof-label">Evidence, not inference</copy:Value>
<deck:Label id="proof-label-style" content={proof-label}
  font={fonts.ui} size="34" color="#ffffff"/>

<deck:DepthStack
  id="proof-stack"
  timeline={speech.timeline}
  frame={layout.proof-stack}
  until={proof-end}
  appearance={recipes.deck.proof}
>
  <deck:Card id="proof-1" source={proof1.image} extent={proof1.extent}
    at={proof1} label={proof-label-style}/>
  <deck:Card id="proof-2" source={proof2.video} at={proof2}/>
</deck:DepthStack>
```

The parent Recipe owns visibility, relative-depth pose progression, frame Paint and reflow. A Card
Recipe may additionally select explicit future/past behavior. The Deck derives every held or
continuing temporal sampling map from the Card's declared activation and the current stage; it does not
require a hidden looping mode on the material and never depends on renderer playback history.
Continue advances by exact programme time while the source may keep a different or variable frame cadence.
Only the selected renderer resolves that relation onto decoded source samples.

Optional labels are separate exact-font values and are referenced by Cards. Filenames, URLs and
media metadata are never treated as label truth.

The declaration resolves named `TemporalInstant` references for every Card and for the terminal boundary.
Card append and completion consume those Instants directly; they do not locate semantic identities or
manufacture a one-frame terminal Window internally.

`deck:Label` accepts either literal body copy or `content={Text}`. It binds that copy to exact font
and label appearance in a small explicit Fragment. The DepthStack receives the resulting label as
one normal edge; it never reads filenames, URLs or hidden media metadata.

The package has no Provider, Need, queue, credential, global z band or cross-Track input. Another
Deck family can install independently and lower to the same terminal `VisualTrack` without changing
this package, Core, Film, Composition or the `HtmlProgram`.

The package also owns its Studio companion and publishes it from `@hypit/depth-stack/studio`.
Studio observes the same card behavior, activation instants and appearance recipe; it is not a
separately selected or versioned product.
