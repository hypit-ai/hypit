# `@hypit/caption`

Clock-free caption content, source-local timing, and the first data-driven audiovisual component.

Caption deliberately separates five facts:

- `CaptionDocument` owns words, correspondence units, and authored cue grouping. It contains no time.
- `LocalCaptionTiming` maps unit identities to exact sided regions in one named local temporal domain.
- `CaptionSelection` says which document content one component instance owns.
- `CaptionStyle` is an opaque family-owned presentation value.
- `CaptionPresentation` is one component instance's ordered, source-local style/visibility policy.

The package does not know whether timing came from WhisperX, an SRT/WebVTT adapter, authored data, or
another matcher. Those producers converge on `LocalCaptionTiming`; they do not create different Caption
or NLE paths.

## Component path: one instance, one parent Source

`caption.Component` consumes the four typed facts and publishes one `ProgramSource`. Selecting three cues
does not create three Cards, Sources, Occurrences, rectangles, or NLE items. Cue elements and their display
schedule are internal to the component implementation. Authors may still declare any number of independent
Caption component instances, with overlapping or disjoint selections, when the work actually calls for them.

```svml
caption.Component "captions" {
  document: @transcript
  timing: @transcript-timing
  style: @main-caption-style
  selection: { cues: [cue-one, cue-two, cue-three] }
  width: 1920px
  height: 1080px

  override "host" {
    roles: [HOST]
    style: @host-caption-style
  }
  override "guest" {
    roles: [GUEST]
    style: @guest-caption-style
  }
  override "pause-middle" {
    cues: [cue-two]
    hidden: true
  }
  override "impact-ending" {
    cues: [cue-three]
    style: @impact-caption-style
  }
}
```

Overrides are evaluated in source order and the last matching rule wins. Role rules naturally cover
non-contiguous turns; a cue rule can hide one passage or restyle just one passage. These rules do not split
the document, alter unit timing, or create additional parent Sources. Styles in one presentation must share
the same family, so a rendering family keeps ownership of its parameters and behavior.

The parent Programme uses that Source exactly like media or another component. Source-bound time reuses the
video output's complete occurrence-to-source `TemporalMap`, so trim, slip, speed, reverse, hold, and loop do
not require Caption-specific synchronization:

```svml
source "video" { value: @prepared-video }
source "captions" { value: @captions }

occurrence "video" {
  source: @source.video
  at: 0s
  outputs: { picture: {} }
}

occurrence "captions" {
  source: @source.captions
  outputs: { picture: {} }
  time { bound: source to: @occurrence.video.picture }
}
```

There is no Caption clock, Timeline registration, or parent expansion of cue geometry. Terminal sampling is
supplied separately by the selected audiovisual renderer.

## Editorial import path: materialize ordinary Component blocks

The same `CaptionDocument + LocalCaptionTiming + CaptionPresentation` can instead be baked once into an NLE
transaction. `createCaptionNleMaterialization` resolves the chosen cues, visibility and styles, quantizes exact
source-local regions as exact rational NLE times, and emits one direct Component item for each visible
cue. A hidden cue emits no item. Each resulting block owns its start, duration, caption Component symbol, text, style
parameters and rectangle, so later move, trim, restyle or delete operations are ordinary NLE edits and do not
write back to the transcript or Caption component.

The built-in `basic` Component is only a minimal package-owned HTML implementation. Other style families must
select their own Component explicitly; the NLE does not interpret family parameters or grant Caption a special
Item kind.

## Cue projection and owner edits

Caption owns a syntax-neutral projection of its internal cues. The projection returns cue identity, text,
role, source-local regions, resolved presentation, and—when given an Occurrence Map—the exact occurrence-local
preimage. Those cue values are owner data, not a persistent NLE View or independent Programme objects.

The Cue rectangles are temporally read-only. Caption consumes `LocalCaptionTiming` but does not own it, so
the projection grants no move, trim or split action. A Timing producer may separately expose such actions when
its facts are authored; derived alignment remains read-only unless the author explicitly materialises it.

The package also owns `style-roles`, `style-cues`, and `hide-cues` author actions. A caller with an explicitly
authored `caption.Component` may invoke those actions directly; the resulting edit appends an `override` child
to that owner. No NLE lane, Programme provenance join or projector registry is involved. Existing transcription
or subtitle files may feed the Cue facts, but this package does not launch WhisperX or any other upstream producer.

## Caption timing as an event source

`caption.UnitEvent` publishes a chosen unit boundary as a domain-bearing temporal region set:

```svml
caption.UnitEvent "important-start" {
  timing: @transcript-timing
  unit: unit-two
  edge: start
}
```

Another component can consume that event through an already placed video occurrence:

```svml
occurrence "callout" {
  source: @source.callout
  outputs: { picture: {} }
  time {
    bound: event
    through: @occurrence.video.picture
    event: @important-start
    require: unique
  }
}
```

This is the two-level follow relationship: the event remains local data that is not itself rendered, while
the callout asks for its bounded preimage through the video's existing Map. Zero, multiple, or interval
solutions are not guessed; this convenience relation explicitly requires one sided point.

The current HTML companion is intentionally a minimal vertical implementation. It proves that all selected
cues render from one Source, ordered presentation rules apply, and timing remains source-local. Rich layout,
karaoke, word animation, within-cue styling, and concrete file/alignment adapters remain family- or
producer-owned work; none requires changing the parent Programme representation.
