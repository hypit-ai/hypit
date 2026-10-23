# Place sound through Audio Track

Read this for normalized speech, music, ambience and effects. [Sound direction](../playbooks/craft/sound-mix.md)
owns mix judgment; this page owns the ordinary author relation.

## Place one ordinary Clip occurrence

```text
Audio Clip = normalized audio source + absolute Window + source-time + mix
Audio Track = additive set of Audio Clips
```

```svml
<time:Window id="reveal-hit-window" timeline={program.timeline}
  from={reveal} for="600ms"/>

<audio:Track id="mix" timeline={program.timeline}>
  <audio:Clip id="voice" source={speaker-media.media} during={program.speaker}/>
  <audio:Clip id="music" source={music-media.media} during={program.window}
    gain="0.18" fade-in="12f" fade-out="18f">
    <audio:Map target-at="end" source-at="end" rate="1"
      wrap-from="start" wrap-until="end"/>
  </audio:Clip>
  <audio:Clip id="reveal-hit" source={hit-media.media}
    during={reveal-hit-window} gain="0.45" fade-out="3f"/>
</audio:Track>
```

Speech, music, ambience and effects use the same Clip form. `during` accepts a named absolute Window;
Timeline authoring or a domain projector creates it upstream.

A source can determine Timeline duration and still require an explicit Audio Clip before its sound
is heard. Reusing the same source in two Clips creates two audible occurrences.

## Keep sampling and mix explicit

Omission uses bounded native playback from source start; source that ends before the Window leaves
silence. `audio:Map` expresses target/source bounds, paired anchors, rate and optional periodic wrap.
A fit Map stretches its source interval over its target while preserving pitch; `min-rate` and
`max-rate` can bound the accepted change. Multiple non-overlapping Maps form one piecewise relation.

`gain` is a linear multiplier. Fade lengths apply to the whole Clip Window. Overlapping Clips mix as
peers.

## Put shared behavior in a component

Ducking, crossfades, speaker handoffs and other behavior spanning several Clips belong to a project
or reusable component. It can calculate envelopes or publish its own AudioTrack for Film.

## Combine closed audio contributions

Use Audio Mix when the required relationship is explicit gain followed by additive mixing:

```svml
<import as="mix" from="@hypit/audio-mix@1"/>
<mix:Track id="dialogue" timeline={program.timeline}>
  <mix:Input id="host" source={host.audio}/>
  <mix:Input id="guest" source={guest.audio} gain="0.9"/>
</mix:Track>
```

`dialogue.audio` is one closed AudioTrack for Film. Each Input id names that routing occurrence;
gain defaults to `1`. Audio Mix does not normalize or limit. A relationship that needs ducking,
sidechain control, reverb sends or role-specific behavior still belongs to the component that owns
that behavior.

Audio Track publishes `.audio` for Film and `.program` for declared tooling. Film includes audio
outputs explicitly. Using synchronized media in [Visual Track](visual-clips.md) does not select its
audio, so include one intended voice path and avoid accidental duplication. At the Film root these
closed signals add as a multiset: Track ids do not merge or replace equal-named signals.
