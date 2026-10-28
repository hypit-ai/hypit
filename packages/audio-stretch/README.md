# `@hypit/audio-stretch`

`@hypit/audio-stretch` supplies explicit audio reconstruction policies. The Temporal Map on an
Audio Clip still owns the exact target-to-source relation; this package only says how the selected
source positions become an audible signal.

```xml
<import as="audio" from="@hypit/audio-track@1"/>
<import as="stretch" from="@hypit/audio-stretch@1"/>

<stretch:PreservePitch id="natural-speed"/>

<audio:Track id="dialogue" timeline={story.timeline}>
  <audio:Clip source={voice.media} during={story.fast}
              reconstruction={natural-speed}>
    <audio:Map target-start="0s" target-end="4s"
               source-start="0s" rate="2"/>
  </audio:Clip>
</audio:Track>
```

Omitting `reconstruction` keeps ordinary point sampling. `PreservePitch` does not contain a speed:
the exact speed and source interval remain facts of the Clip's Temporal Map. Renderers may support a
defined subset of Map relations and must reject unsupported relations instead of silently changing
the requested reconstruction.
