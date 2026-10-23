# `@hypit/audio-mix`

Audio Mix consumes closed `AudioTrack` signal graphs and publishes one new closed `AudioTrack`.
It provides the two universal operations already justified by the signal algebra: non-negative scalar
gain and explicit additive mixing. It never normalizes, limits, discovers a “master” bus, or routes by
Track name.

```svml
<mix:Track id="dialogue" timeline={story.timeline}>
  <mix:Input id="host" source={host.audio}/>
  <mix:Input id="guest" source={guest.audio} gain="0.9"/>
</mix:Track>
```

The result can be selected by Film like any other AudioTrack. More specialized processing packages
may add package-owned Process programmes to the same graph; Film remains unaware of their effects
and routing.
