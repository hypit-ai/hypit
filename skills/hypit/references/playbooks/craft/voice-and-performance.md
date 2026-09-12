# Voice and performance

Read this when deciding who performs spoken material, how a recurring person keeps one voice, or
whether an off-screen passage continues an A-roll performance or uses independent speech.
[Voice direction](voice-direction.md) owns casting an appealing voice and writing its direction.

## Let the Segment reveal the A-roll

A Segment is one authored passage in the Script. Before production it has identity and meaning but no
seconds. In Hypit, A-roll names the performance that makes a spoken Segment time-bearing. It can be
a visible A-roll whose picture and sound are performed together, or an audio-only A-roll whose
independent speech carries the passage while other Tracks supply the picture.

The A-roll does not fit itself onto an earlier program timeline. By performing the Segment, it gives
that passage real time; the other Segment performances together create the program's semantic time.
[Tracks](../../production/tracks.md#semantic-takes-supply-the-media-timeline) owns the exact
SemanticTake assembly and projection mechanism.

This gives a practical question: **who is speaking this Segment?** For visible A-roll, that person's
generated Take carries words, mouth movement, gesture, gaze, delivery, picture, and sound together.
In a multi-person exchange, the speaking performance can include listeners, several turns, or camera
cuts while still carrying one Segment. The number of people visible in the frame does not determine
how many semantic clocks exist.

A recurring presenter, podcast speaker, interview participant, or dramatic character continues to
own their own lines even while another picture covers them. Visual handoffs, coverage, Caption, MG,
and Effects are authored against the time that performance established. If an edit changes the
performance's actual length, prepare and align the edited media before assembly.

A wordless Segment is the important edge of the same model. Nobody speaks, so it has no speaking
A-roll, but it still has authored meaning. Its prepared media supplies the Segment's start and end,
and its SemanticTake carries an empty word array into the same SemanticTrack. Here semantic means the
authored identity and relationships of the passage, not a requirement that it contain speech.

## Keep the performance role separate from the picture

A-roll is not the bottom layer, the largest rectangle, or the currently visible face. Its
SemanticTake retains the role when its picture is full-frame, one half of a split, a circular inset,
a moving cutout, or completely covered by B-roll or MG. A large app recording can be the primary
picture while a small presenter in a corner supplies the semantic timeline and speech.

The covering B-roll may even show the same person doing a silent lifestyle action. Seeing a person
while hearing words does not by itself make that picture the speaking Take or create a new speech
source. More fundamentally, the sound already belongs to the A-roll performance that created this
Segment's semantic time. B-roll changes or supplements the visual answer; it does not inherit the
speech merely because a person appears in it. Follow that positive ownership relationship through
the composition. [Compositing](compositing.md#choose-an-a-roll-presentation) owns the full-frame,
split, cutout and circular presentation choices.

## Let neighboring A-roll performances keep their time

The usual A-roll assembly places Segment performances one after another without consuming either
side of their duration. This fits how the work is authored: `hypit measure` helps size each request so
its words, delivery and action belong naturally in that generated passage, and speaking video models
normally use the requested clip to perform the line. Asking one Take to remain silent for a synthetic
half-second handle at its beginning or end works against both that sizing and the model's performance.

A duration-consuming crossfade between neighboring A-roll Takes can eat into the word windows that
each performance established. The result may contain simultaneous speech at a boundary and weaken
the listening rhythm. For ordinary creator speech, podcast turns, interviews and short drama, this
makes a direct join between the prepared Segment Takes a practical starting point. Visual coverage
and effects can still cross that seam without changing the underlying speech time.

This is a directing judgment, not a ban on another temporal design. Deliberate interruption,
overlapping dialogue, musical phrasing or another work may call for a different assembly. A project
component can own that operation and publish the explicit semantic, visual and audio outputs its
consumers need. [Track authoring](../../production/track-authoring.md#author-an-alternative-performance-assembly)
explains the type boundary; the default Speech Track remains the simple lossless assembly.

## Give a recurring person one accepted voice

A **Voice Reference** is an ordinary accepted audio Resource that establishes a person's vocal
identity. Reusing that Resource wherever the same person performs is what carries the relationship
through the production.

Give each recurring person who speaks their own Voice Reference. A silent listener does not acquire
a voice merely by appearing in the picture; when that character speaks elsewhere, their own
reference follows them into that performance.

When the user supplies the exact private voice they want, prepare a clean representative excerpt as
the Voice Reference. Otherwise use [Voice direction](voice-direction.md) to cast the character through
Voice Design and choose its sample line. A public character type or an imagined voice can be designed
directly.

About five seconds of clear, natural speech is usually enough to establish a useful reference while
remaining easy to reuse across models. Choose words that exercise the delivery the work needs. Keep
the sample free of other speakers, music, clipping, heavy room echo, and long silence. The selected
model's documentation owns any exact count, duration, or format limits for its references.

Once accepted, reuse that same Resource wherever the same person must sound like themselves.

## Let one reference support different performances

The useful dependency is shallow:

```text
Voice Design or supplied audio
             ↓
     accepted Voice Reference
          ↙             ↘
visible A-roll      audio-only A-roll
```

An A-roll-capable video model receives the reference while generating the person's visible speaking
Take. Voice Clone receives the same reference when the work genuinely needs that person to speak as
an independent audio source. These are two uses of one ordinary Resource, not two voice identities.

A work may combine them. A host can perform visible A-roll and later narrate a passage that has no
underlying on-camera performance; using the same Voice Reference makes both sound like the same
person. Another passage covered by B-roll may still be audio from the A-roll Take beneath it. Decide
from the passage's expressive construction, not from whether the face happens to be visible at that
instant.

## Choose between visible and audio-only A-roll

For visible A-roll, the video request receives the character's camera image, Voice Reference and
exact Script dialogue, then returns the picture and sound of that person actually performing. Voice
Design casts the person; its short sample line exists to establish voice identity and need not repeat
any line from the finished Script.

Audio-only A-roll is useful when a Segment is constructed without an on-camera speaking
performance: a desktop point-of-view demonstration, a narration-led montage, a pure MG explanation,
or a product-explanation passage inside an otherwise presenter-led work. Voice Clone
uses the person's existing Voice Reference and the Segment's actual Script to produce that passage.
The resulting audio-only SemanticTake carries the A-roll role even though it contributes no picture;
Media Track, Typography, MG, or another visual Track supplies what the viewer sees.

Choose audio-only A-roll because the passage itself is independently narrated, not merely because
B-roll or graphics happen to hide a visible performance. Use Voice Design to establish the person's
reusable voice and Voice Clone to perform the actual Segment; the casting sample and the finished
delivery have different jobs.

Use `hypit vocabulary @hypit/tts` for the installed Voice Design and Voice Clone author
Surfaces. Both elements accept an optional `model`: Fish Audio when omitted, `mimo` for Xiaomi MiMo,
and `eleven` for ElevenLabs Voice Design. Every result is an ordinary audio Resource that Voice Clone
and reference-audio video models accept, whichever model produced it.
The Source chooses those model semantics; the Runtime Profile independently chooses the
Endpoint that can perform them.

## Treat narration as a sound-picture relationship

Narration means the audience hears speech while the speaker is not the primary visible action. That
description does not reveal how the speech was produced.

- In a visible-performance-led passage, coverage changes the picture while the accepted visible
  A-roll remains the performance and timing authority.
- In an independent-narration-led passage, audio-only A-roll supplies the performance while the
  picture is designed separately around it.
- In a mixed work, each passage can use the relationship that serves it, while recurring people keep
  their accepted Voice References.

Keep three questions distinct:

| Question | What it establishes |
| --- | --- |
| Is the speaker off screen at this instant? | A viewing relationship: speech is heard while its performer is not the primary visible action. |
| Does the sound come from covered visible A-roll or from audio-only A-roll? | The production source and owner of the performed audio. |
| Is this passage visible-performance-led or independent-narration-led? | The Segment's higher-level expressive construction. |

The same visual language can answer these questions differently. Consider a notebook-paper field
with animated steps, labels and panels:

- When that field persists as the place where a product process is explained, its changing graphic
  relationships carry the passage. Independent speech can establish the Segment's semantic time
  while the paper composition supplies its picture. This is an independent-narration-led module.
- When a ranking host says a brief “Top one: the product” over a paper reveal and then appears on
  camera to continue the same judgment, the host's performance normally owns the whole passage. The
  paper reveal is MG coverage over that A-roll, and the sound remains the host Take's sound.

Duration can support the reading but does not decide it. Ask what carries the argument, attitude and
progression, and whether an on-camera performance exists whose words naturally continue through the
coverage. A sustained graphic explanation and a brief graphic reveal can look alike in one frame
while belonging to different constructions.

Segment boundaries express the work's useful modules without acting as source labels. One
independent-narration-led Segment can contain many MG steps through Selections and Moments. One
visible-performance-led Segment can begin under a graphic and later reveal the speaker. Splitting a
generation into two Segments also does not make either one audio-only A-roll by itself; each
Segment's actual performance relationship remains the deciding fact.

Use `../formats/narration-led-demo.md` when independent narration actually organizes a work or
substantial passage. `../index.md` routes to available Format and Craft knowledge for the work's
other relationships.

## Give real performance real semantic time

`../../creation/script-and-time.md` owns measurement, literal duration, and alignment. Once the
accepted performance has semantic time, its dependent layers follow the delivery that really
happened.

## Carry the character through the performance

[Voice direction](voice-direction.md#let-one-voice-express-different-thoughts) connects recurring vocal
identity with changing delivery; [Video direction](video-direction.md#direct-the-reason-for-an-action)
connects each passage's meaning with expression, gesture and interaction.

Use [Sound and mix](sound-mix.md) for music, effects, ambience, gain, and the completed mix.
[Transformations](../../creation/transformations.md) connects casting and reference choices to the
target's argument, relationships and presentation.
