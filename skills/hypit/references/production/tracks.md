# Composing Tracks

Read this when putting performance, coverage, graphics, text and sound together. For a new component's
implementation, read [Track authoring](track-authoring.md); for a new Caption family, read
[Caption authoring](caption-authoring.md).

[Media preparation](media.md) explains incoming files, normalized media and SemanticTakes;
[spatial layout](spatial.md) explains placement, and [rendering](rendering.md) explains the deliverable.

## Choose by the layer's job

| Role | Owns | Common published values |
| --- | --- | --- |
| SemanticTrack | The ordered media timeline and aligned semantic locations; it draws nothing | Usually `speech.semantic` |
| Speech Track | An ordered performance's picture and sound | `.semantic`, `.visual`, `.audio` |
| Media Track | Framed images, prepared moving media, or authored surfaces; B-roll is one use | `.program`, `.visual`, optional `.audio` |
| Audio Track | Independently timed music, ambience and effects | `.program`, `.track` |
| Caption | Script-derived display text presented with speech | Fine publishes `.schedule`, `.track` |
| Typography / Text | Titles, labels and other independently authored text | `.program`, `.track` |
| Semantic MG | A board, comparison, reveal or another system responding to meaning | Package-owned; often `.program` and a visual Track |
| Effect | A treatment such as a flash over an authored interval | Package-owned visual output |

These are authoring roles. Film receives ordinary peer VisualTrack and AudioTrack values; it has no
special rule for a podcast, ranking or B-roll. A component can publish both picture and sound.

## Follow Selection → Surface projection → component consumption

Script publishes a Selection, Moment or Segment as a semantic identity. It carries authored Anchor
identities, not a Window, Instant, second or frame number. A component that wants to use that meaning
exposes an appropriate projection form on its own Surface:

```svml
<media-track:Item image={portrait.image} extent={portrait-extent}
  frame={layout.full} during={story.selection.example} appearance={look.still}/>
```

Here `during` belongs to `media-track:Item`. While lowering that element, Media Track's Surface
resolves the Selection and SemanticTrack, creates the temporal projection Records and Fragment, and
wires the projected `Window` into Media Track's own Fragment. The projection subgraph resolves the
Selection's start and end Anchors against the selected SemanticTrack and composes the resulting
Instants into that Window.

The Media Track's internal Producers consume the Window together with the media, Frame and authored
specification. Only there do occupancy, playback and motion acquire their component-specific meaning.
The internal Producers receive the projected Window, not the Script Selection, and do not search
Script words themselves.

The same chain supports different semantics without a central timing dispatcher. A graphic Surface
may project a Moment to an Instant and consume it as a persistent state change; an Audio Surface may
project a Selection to a Window and consume it as a Clip interval. A component may expose only the
projection forms its behavior can honestly consume.

```text
Script Selection / Moment / Segment
                 ↓ component Surface projection through SemanticTrack
           Window / Instant
                 ↓ component Fragment and Producers
       occupancy, playback, state, sound or visual behavior
```

A render-range request is farther downstream: it chooses which already-authored output frames to
inspect or deliver and changes none of these relationships. [Script and time](../creation/script-and-time.md)
owns Selection, Moment and shared projection spellings; each selected Surface's vocabulary says which
forms that component exposes.

## Semantic Takes supply the media timeline

Script Segments have authored order and meaning but no program positions. Each spoken Segment is
associated with the local media performance carrying it; normalization establishes that media's
frame envelope, and alignment locates the Segment's words and anchors inside it. That self-contained
value is a SemanticTake. Speech Track places the Takes in Source order and translates every local
position by the lengths before it. The resulting SemanticTrack is the program's semantic time.

```text
Segment A + its local media  → SemanticTake A ┐
Segment B + its local media  → SemanticTake B ├─ Source order → SemanticTrack
Segment C + its local media  → SemanticTake C ┘
```

Speech Track is therefore not placing A-roll on an independently maintained master timeline. The
ordered Takes create the timeline that Caption, MG, Media, Typography, Audio and Effects project
through. The official Speech Track uses each complete local media span and joins the next Take at its
end; it creates no gap or duration-consuming overlap. An edit that trims or retimes a performance
belongs before its alignment. A visual handoff that does not change the performance media remains an
ordinary visual composition on the resulting program time.

For the usual spoken production, the performance carrying each Segment is the A-roll. In a podcast,
the participants' turns belong to that shared performance timeline; each visible speaker does not
create a separate program clock. Audio-only A-roll can also carry one Segment when that passage is
independent-narration-led. Music, sound effects and covering footage then follow the
assembled work. [Voice and performance](../playbooks/craft/voice-and-performance.md) owns the choice
between visible A-roll, covered visible A-roll and audio-only A-roll.

A-roll can sit above those pictures: a circular presenter inset over a screen recording, or a moving
cutout in the corner over a product demonstration, still carries the main Script. The SemanticTake
owns the performance and timing. Speech Track publishes its semantic, visual and audio contributions
together; its visual Frame, fit, clipping, appearance, lifecycle motion and stack order present an
inset or cutout directly. Include the wanted peer outputs in Film. This is one assembly of the same
Take, not a Speech Track followed by a Media Track that displays it again. [Compositing](../playbooks/craft/compositing.md)
explains insets and background removal.

Declare a Clock for normalization, normalize generated or supplied media with explicit stream
choices, and associate each Segment with its SemanticTake, locating spoken words when present. Speech Track assembles
those Takes in source order; global frame positions follow their actual normalized lengths.

```svml
<speech:Track id="speech" visual-frame={layout.full}
  visual-appearance={look.performance} visual-z="0">
  <speech:Take source={opening-take}/>
  <speech:Take source={answer-take}/>
</speech:Track>
```

This is an assembly excerpt: the imports, layout, fit Recipe and SemanticTakes must already exist.
One Take may contain several speakers or generated cuts. Estimates help request a duration; they do
not supply word timestamps. Covering or reframing its picture leaves the same performance and audio.
Speech Track shares the ordinary visual appearance of a Media Item: fit and crop,
opacity and filters, clipping, padding, border, shadow, frame paint, lifecycle motion and stack
order. Sampling children can pan, zoom or rotate the Take's picture inside that Frame over normalized
Segment progress. Media Track remains the owner of an independent Window, source playback and trim,
source audio, replacement Sequences and pictures that are not the speaking performance.

Semantic structure also supports a wordless passage. It has no speaking A-roll, yet a named empty
Script Segment receives its actual boundaries from prepared media and remains addressable through
the assembled SemanticTrack. Semantic identity here means that the work can refer to the passage and
its boundaries; it does not classify the passage or require spoken words.
[Media preparation](media.md#wordless-passages-use-media-boundaries) owns that construction.

Every Take contributes its Segment boundaries to the assembled semantic time. When its prepared
media has no audio stream, Speech Track emits no audio clip for that Take; when it has no visual
stream, it emits no picture. The available projections continue without manufacturing a missing
stream.

## Coverage has a Window and a separate playback choice

```svml
<media-track:Track id="coverage" semantic={speech.semantic} canvas={canvas}>
  <media-track:Item image={portrait.image} extent={portrait-extent}
    frame={layout.full} during={story.selection.example} appearance={look.still}/>
  <media-track:Item media={prepared-broll.media}
    frame={layout.full} during={story.selection.proof} appearance={look.clip}/>
</media-track:Track>
```

An image needs its intrinsic Extent. Moving media enters through explicit normalization as `media`;
`surface` accepts an already compositable surface from another component. Frame says where it goes;
fit/crop says how the source occupies it.

For natural moving B-roll, start with `once-start`: a short Window truncates the clip; a long Window
returns to the layer below after the clip finishes. If uninterrupted coverage matters, choose its
media and boundaries from the actual clip length. `hold-start` freezes a tail; choose it when that
stillness is intended. `stretch` retimes. A still occupies its Window without a video playback mode.
`@hypit/media-track` owns the precise sampling rules.

Independent Items can overlap. A Sequence instead owns one succession of Members and their pairwise
Handoffs. Use it when a replacement relationship or transition belongs to the same visual slot.
Touching Script Selections require matching affinity when an inter-word pause should remain covered;
also check source exhaustion and transition opacity. [B-roll](../playbooks/craft/b-roll.md) explains
the editorial choices and [frame coverage](../playbooks/craft/frame-coverage.md) explains boundary failures.

Media source audio is opt-in. Include the Track's audio output in Film when wanted, and avoid routing
the same speech twice. A silent covering image does not mute the performance below it.

## Sound, text and Caption answer different events

An Audio Clip takes normalized audio-bearing media. `gain` is a linear multiplier; fades and trim
are explicit. Normalizing input media does not automatically balance or duck the complete mix.

```svml
<audio:Track id="effects" semantic={speech.semantic}>
  <audio:Clip source={reveal-sound.media} at={story.moment.reveal} for="600ms"
    playback="once" gain="0.45" fade-in="0f" fade-out="3f"/>
</audio:Track>
```

Use one Moment for an MG reveal, a sound and a flash when they express one event. A Window consumer
needs a duration; an MG state transition may only need the Instant. Explicit clock placement remains
valid for events independent of speech even in a speaking video.

Typography uses exact fonts, its own Style and Point/Area/Path placement. Graph Text and rich inline
content are alternatives. A rich Span Style replaces that run's typography rather than cascading
CSS properties. A headline held over several sentences is generally Typography. Caption instead
reads `story.caption`, applies a Caption Program and joins to `speech.semantic`; Role overrides,
Selection overrides and authored `||` breaks retain Script as the wording owner.

[Fonts and text](fonts-and-text.md) covers exact faces, fallbacks, Emoji and Typography placement.

## Fine Caption and new Caption families

`@hypit/caption-fine` is the usual fine-grained Caption renderer. Its Recipe exposes placement,
font and size, glyph and box Paint, wrapping, active-word coloring, Cue and token motion, lead/tail
and handoff. Script supplies display wording, Roles and `||` Cue breaks; `@hypit/caption` applies
Styles and joins that document to the actual semantic timing. Fine publishes a visible `.schedule`
and a rendered `.track`.

Use those controls for the appearance and rhythm they express. When the design needs a different
structure—such as a keyword on its own oversized line beside a supporting phrase—create a project
Caption family. It reuses the common document, Style applications and timing while owning its new
schedule and layout. [Caption authoring](caption-authoring.md) explains that extension. A new family
can be chosen directly for a new visual role; making one is ordinary production work.

For the selected family's exact attributes and Recipes, use `hypit vocabulary @hypit/caption-fine`
and its installed README. [Caption craft](../playbooks/craft/captions.md) explains reading rhythm;
[Caption tracking](../playbooks/craft/caption-tracking.md) explains measured moving placement.

## Persistent MG is more than another timed image

A ranking board can remain visible throughout the program while one Selection controls a row's
entrance and settled state. An answer strip can start with a preset answer and reveal later slots
on Moments. Ending an activation does not necessarily remove the result. Read that component's
consumption rules, including preset state, event order and outer lifetime.

Keep the event in Script, the authored layout and palette in Source/Recipe, and the reusable state
behavior in the component. The same Moment can be used by several components without one reaching
inside another. Their outputs remain ordinary peers.

Ranking is a useful implementation reference: its outer Window keeps the board visible, each
Selection stages a reveal, and the resulting placement can persist. Its TopThree form uses
activation Instants instead. Read the installed `packages/ranking/README.md` for its forms and the
path from authored markers to schedule, drawing and Studio Companion. [Track authoring](track-authoring.md)
uses that same separation when designing a new semantic component.

## Assemble the intended peers

Film's domain assembly receives a Canvas, a ProgramSpace and a Film Recipe. The current `film:Film`
Surface takes `canvas`, `semantic` and `appearance`, deriving the space from the SemanticTrack.
Include each desired visual and audio
output explicitly. Listing a Track later does not move it to the front: absolute stacking is authored
inside the Track's Presents. Use intentional, distinguishable layer orders where things overlap.

Canvas geometry and Program time are separate. Keep an inset's intrinsic extent, destination Frame,
crop and any measured regions in the same explicit coordinate relationship. Changing final crop or
framing can invalidate head-tracking placement even when timestamps remain unchanged.

Read the selected package's vocabulary for exact ports rather than treating every Track as one
universal interface. Inspect the dense frame, the state-changing beat, source endings and the
complete mix when reviewing the configured work.

[Composition and rendering](rendering.md) shows Film, the final video Surface and frame-range requests.
