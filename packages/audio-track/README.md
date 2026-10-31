# `@hypit/audio-track`

Audio Track is the plain sound-placement package:

```text
Audio Clip = prepared audio source + absolute Window + sampling + mix
Audio Track authoring = additive set of Audio Clips
terminal AudioTrack = closed source/mix signal graph
```

Its package-owned declaration shape owns Track, Clip and nested Map/Curve structure. Exact duration,
relative-point, rate and cubic-position literal parsing comes from Temporal's syntax-neutral API; Markup contributes
only tag and field spelling. Audio Track depends on Temporal because its ClipSpec and terminal
program genuinely contain Window and Map values.

Timeline supplies the program clock, not hidden audio. Each Clip names its own prepared source and
destination Window. The Track publishes `.program` for declared tooling and `.audio` as an ordinary
peer contribution to Film.

A Track can contain zero Clips. It retains its identity and Timeline and contributes a silence signal until Clips are added.

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
target and source intervals through an exact rational rate; `wrap-from`/`wrap-until` makes a selected
source interval periodic. A Map without rate, anchors or wrap fits its source interval across its
target interval. Multiple non-overlapping Maps form one
partial function, and gaps are silence.

`Curve` supplies a monotone cubic source-position piece over a target range. Its four required source
positions are `source-at-start`, `source-control-1`, `source-control-2` and `source-at-end`; target
bounds are optional. It is the same exact temporal relation used by visual occurrences, not an audio
effect or a named speed mode. The chosen audio Renderer remains responsible for reconstruction. The
default local Renderer evaluates affine, reverse, hold, wrap, gap, cubic and multi-stage occurrence
and preparation maps as source-position relations. It performs ordinary signal resampling; a component
that requires another reconstruction must reference an explicit package-owned `reconstruction` value
instead of relying on a hidden Renderer mode. `@hypit/audio-stretch` supplies the official
`PreservePitch` value; its speed remains in the Map rather than being repeated in the reconstruction.

Audio Track preserves the same exact target-to-source relation algebra without deciding how a sound
terminal reconstructs zero, reverse or changing rates. A selected Renderer owns that signal policy
and its supported subset; the Track does not encode one Provider's resampler or time-stretch limits as
author law.

The terminal AudioTrack retains the exact absolute target interval, exact fades and exact Clip-local
sampling Map. AudioProgram projects absolute programme and mix boundaries onto the 48 kHz execution
grid while retaining that complete Map, so rational Timeline clocks do not acquire an earlier
one-sample phase error and a renderer does not inherit a premature playback mode.

Speech, music, ambience and effects are equal Audio Clips. A source that helped determine Timeline
duration or anchors leaves no special marker in the audio-placement path. Reusing one prepared
source in two Clips creates two independent occurrences.

Audio Track has no generic `Presentation`, `Style` or `Use`. It lowers its Clips to source nodes and
one additive mix in the terminal graph. Ducking, crossfades, continuing speaker roles and other
relationships spanning multiple Clips remain ordinary components. They may calculate level
automation or consume closed AudioTracks and publish a new processed graph; the base package and
Core do not acquire a catalogue of sound roles or effects.

Using PreparedMedia here consumes only its audio member and does not make its picture visible. Author picture independently with
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
