# Composing Tracks

Read this when putting performance, coverage, graphics, text and sound together. For a new component's
implementation, read [Track authoring](track-authoring.md); for a new Caption family, read
[Caption authoring](caption-authoring.md).

[Media preparation](media.md) explains incoming files, normalized media and SemanticTakes;
[spatial layout](spatial.md) explains placement, and [rendering](rendering.md) explains the deliverable.

## Choose by the contribution's job

| Role | Owns | Common published values |
| --- | --- | --- |
| SemanticTrack | The ordered media timeline and aligned semantic locations; it draws nothing | Usually `speech.semantic` |
| Speech Track | Ordered semantic performances and their original sound | `.semantic`, `.audio` |
| Media Track | Framed images, semantic performances, prepared moving media, or authored surfaces; B-roll is one use | `.program`, `.visual`, optional `.audio` |
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

A-roll can be a circular presenter inset or a moving cutout over a demonstration. Its role is
semantic: it carries the Script. Speech Track assembles its time and original sound; the visual
component decides how to present its prepared material.

```svml
<speech:Track id="speech">
  <speech:Take source={opening-take}/>
  <speech:Take source={answer-take}/>
</speech:Track>
<media-track:Track id="performance" semantic={speech.semantic} canvas={canvas}>
  <media-track:Performance during="program" frame={layout.full}
    appearance={look.performance}/>
</media-track:Track>
```

The imports, Canvas, Frame, Recipe and prepared SemanticTakes exist in this excerpt. The Media
Recipe specifies `stack-order`, fitting and frame presentation. Select `performance.visual` and
`speech.audio` in Film. The material is generated once and remains the same performance.

The Track's `semantic` supplies the performance and the time context for all its children.
`Performance` displays that performance's picture; `Item` places an independently supplied image,
media source or layered composition. Both use `during` to choose their display interval.

`Performance during="program"` shows all the Takes in order under one frame and lifecycle.
Use `during={story.segment.explanation}` or a Selection to show only the corresponding passage.
If a Take begins at program second 5, a Window from seconds 7 to 10 shows source seconds 2 to 5;
the source offset preserves synchronization with `speech.audio`. Media fitting, clipping, decoration,
`motion` and `Sampling` control presentation. Use an Item with direct `media` for independent
playback or source trim.

A moving performance viewport and its neighboring diagram may belong in one component because they
share a layout change. That component consumes prepared material and projected Moments or Windows,
then draws their shared state. Independent Caption and coverage remain separate when useful.
Its Surface can expose a Scene, Item or another useful authoring unit. Inside the component,
`projectSemanticMedia` supplies the intersecting prepared Takes, their program spans and their source
offsets, so changing the layout preserves playback alignment.
[Component design](component-design.md) explains where to draw these boundaries;
[drawing a component](component-visuals.md#compose-video-and-graphics-in-one-browser-program) explains
HTML, CSS and frame-driven code inside one visual contribution.

Semantic structure also supports a wordless passage. It has no speaking A-roll, yet a named empty
Script Segment receives its actual boundaries from prepared media and remains addressable through
the assembled SemanticTrack. Semantic identity here means that the work can refer to the passage and
its boundaries; it does not classify the passage or require spoken words.
[Media preparation](media.md#empty-segments-use-their-media-boundaries) owns that construction.

Every Take contributes its Segment boundaries to the assembled semantic time. When its prepared
media has no audio stream, Speech Track emits no audio clip for that Take. A visual consumer skips
an audio-only Take while preserving its place in semantic time.

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

[Spatial layout](spatial.md#fit-the-source-into-the-frame) explains the shared destination/content
model, including alignment, rounded corners, padding, borders and the difference between moving
the Frame and moving its contents. A Media Item or Sequence takes its outer Frame from `frame` and
its stack order from the appearance Recipe's `stack-order`.

For a picture with a designed backing, an Item can use ordered `Paint` and `Layer` children in place
of a direct source. Paint fills the frame; each sampled Layer has its own fit and picture styling.
The unit owns the shared clip, border and motion. A Sequence keeps that outer presentation while its
Members replace the content. Use separate Items when pictures need independent Frames. The Media
Track vocabulary supplies the exact Layer, Sampling and Handoff forms.

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
