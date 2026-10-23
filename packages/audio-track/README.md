# `@hypit/audio-track`

Audio Track is the plain sound-placement package:

```text
Audio Clip = normalized audio source + absolute Window + sampling + mix
Audio Track authoring = additive set of Audio Clips
terminal AudioTrack = closed source/mix signal graph
```

Timeline supplies the program clock, not hidden audio. Each Clip names its own normalized source and
destination Window. The Track publishes `.program` for declared tooling and `.audio` as an ordinary
peer contribution to Film.

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
    during={reveal-hit-window} gain="0.45"/>
</audio:Track>
```

`during` consumes a resolved Window. Timeline authoring or a domain projector declares that value
upstream; Audio Track neither constructs time ranges nor recognizes semantic, beat or other domains.

`gain` is a linear multiplier and fades default to zero. Omitting Map means bounded partial identity:
target start maps to source start at native rate, and excess Window time is silent. One `Map` relates
target and source intervals through an exact positive rate; `wrap-from`/`wrap-until` makes a selected
source interval periodic. A Map without rate, anchors or wrap fits its source interval across its
target interval while preserving pitch; optional `min-rate`/`max-rate` bounds make that fit fail
instead of silently exceeding an authored safety range. Multiple non-overlapping Maps form one
partial function, and gaps are silence.

Audio deliberately does not inherit visual-only laws such as a zero-rate held frame or reverse
picture sampling. It owns positive, pitch-preserving tempo mapping in the same small algebraic shape,
without placing an audiovisual policy in Core.

Speech, music, ambience and effects are equal Audio Clips. A source that helped determine Timeline
duration or anchors leaves no special marker in the audio-placement path. Reusing one normalized
source in two Clips creates two independent occurrences.

Audio Track has no generic `Presentation`, `Style` or `Use`. It lowers its Clips to source nodes and
one additive mix in the terminal graph. Ducking, crossfades, continuing speaker roles and other
relationships spanning multiple Clips remain ordinary components. They may calculate level
automation or consume closed AudioTracks and publish a new processed graph; the base package and
Core do not acquire a catalogue of sound roles or effects.

Using synchronized media here does not make its picture visible. Author picture independently with
[`@hypit/visual-track`](../visual-track/README.md).

## Distribution and Studio

Audio Track is an independently versioned official Author Package. The official Hypit video
Distribution installs it by an ordinary npm dependency, while Source selects it explicitly with
`<import from="@hypit/audio-track@1" .../>`. The package owns its Clip/Track authoring model, runtime
facet and specialized Studio companion in one activation and one release lifecycle.

The terminal `Composition.AudioTrack` ABI remains owned by Composition rather than this package.
Other components can therefore publish an AudioTrack without depending on Audio Track, and Studio's
generic terminal fallback can still display those contributions. Package managers and ordinary
lockfiles select the physical package version; Hypit does not add another version or installation
mechanism.
