# `@narratage/seedance-kits`

Data-only authoring Kits for recurring Seedance semantics. They are `TextTemplate` source modules,
not model wrappers, Providers or new execution nodes.

Each Kit is rendered by the domain-neutral `text:Render` Surface. Its Text output then feeds one of
the three low-level `@narratage/seedance` invocation modes. Reference media and duration remain
ordinary explicit graph edges:

```svml
<import as="text" from="@narratage/text@1"/>
<import as="seedance" from="@narratage/seedance@1"/>
<import as="broll-kit" source="../../packages/seedance-kits/kits/broll-v1.svs"/>

<text:Render id="broll-prompt" template={broll-kit.broll-v1} recipe={studio.broll}>
  <text:Set name="story" text={copy.broll}/>
</text:Render>

<seedance:ReferenceVideo id="broll" model="mini" prompt={broll-prompt}
  duration={broll-duration.duration} resolution="720p" aspect-ratio="9:16">
  <seedance:Reference image={scene}/>
  <seedance:Reference image={product}/>
</seedance:ReferenceVideo>
```

The six templates are:

- `broll-v1`: silent visual micro-story;
- `podcast-v1`: two fixed podcast views with two voices;
- `call-v1`: two live video-call reverse views;
- `street-interview-v1`: one shared street scene, two voices and microphone handoff;
- `motion-reference-v1`: preserve the subject and transfer body motion only;
- `camera-reference-v1`: preserve the subject and transfer camera language only.

The first four retain the useful orthogonal prompt axes from Twinit. Historical aliases that emitted
identical prose were removed. Speed, trim, last-frame extraction and audio extraction are ordinary
media operations and intentionally do not live in these templates.
