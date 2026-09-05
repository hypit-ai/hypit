# Voice and performance

Read this when deciding who performs spoken material, how a recurring person keeps one voice, or
whether an off-screen passage continues an A-roll performance or uses independent speech.

## Begin with who carries the expression

Most presenter-led short videos get their speech from an A-roll performance. The generated Take
carries the words, mouth movement, gesture, gaze, delivery, and picture together. An accepted camera
image establishes the person in a useful shot, an accepted Voice Reference establishes how they
sound, and the video direction tells the performer what to say and do.

A-roll is a role in the work, not a rectangle or stack position. The same performance remains A-roll
when its picture is cropped, keyed, moved into a corner, placed above a board, or temporarily covered
by B-roll or MG. The viewer may stop seeing the speaker while continuing to hear the same performance.
Changing the visible projection does not by itself create a new speech source.

Read the whole work or passage before choosing the source of speech. A recurring presenter, podcast
speaker, interview participant, or host normally continues to carry their own lines through visual
coverage. A passage built as narration from the outset may instead use independent speech while
hands, screens, products, montage, B-roll, Typography, or MG carry the picture.

## Give a recurring person one accepted voice

A **Voice Reference** is an ordinary accepted audio Resource that establishes a person's vocal
identity. Reusing that Resource wherever the same person performs is what carries the relationship
through the production.

When the user supplies the exact private voice they want, prepare a clean representative excerpt as
the Voice Reference. Otherwise direct Voice Design from the person's role, energy, age range,
language, accent, vocal texture, pace, and delivery. Voice Design acts as a broadly capable casting
and voice-design partner; a public character type or an imagined voice can be designed directly.

About five seconds of clear, natural speech is usually enough to establish a useful reference while
remaining easy to reuse across models. Choose words that exercise the delivery the work needs. Keep
the sample free of other speakers, music, clipping, heavy room echo, and long silence. The selected
model's documentation owns any exact count, duration, or format limits for its references.

Direct the voice from the intended character and performance. Appearance alone is not acoustic
evidence, but the Agent can choose a voice that supports the person's role, personality, setting, and
the work's tone. Once accepted, reuse that same Resource wherever the same person must sound like
themselves.

## Let one reference support different performances

The useful dependency is shallow:

```text
Voice Design or supplied audio
             ↓
     accepted Voice Reference
          ↙             ↘
A-roll performance   independent speech
```

An A-roll-capable video model receives the reference while generating the person's visible speaking
Take. Voice Clone receives the same reference when the work genuinely needs that person to speak as
an independent audio source. These are two uses of one ordinary Resource, not two voice identities.

A work may combine them. A host can perform the main A-roll and later narrate a passage that has no
underlying on-camera performance; using the same Voice Reference makes both sound like the same
person. Another passage covered by B-roll may still be audio from the A-roll Take beneath it. Decide
from the passage's expressive construction, not from whether the face happens to be visible at that
instant.

## Treat narration as a sound-picture relationship

Narration means the audience hears speech while the speaker is not the primary visible action. That
description does not reveal how the speech was produced.

- In an A-roll-led passage, coverage changes the picture while the accepted speaking Take remains the
  performance and timing authority.
- In a narration-led passage, accepted independent speech supplies the performance while the picture
  is designed separately around it.
- In a mixed work, each passage can use the relationship that serves it, while recurring people keep
  their accepted Voice References.

Use `formats/narration-led-demo.md` when independent narration actually organizes a work or
substantial passage. Use the relevant presenter, interview, podcast, or call Format when people
perform their lines on camera, even if other layers cover them for part of the edit.

## Give real performance real semantic time

`../../creation/script-and-time.md` owns measurement, literal duration, and alignment. Once the
accepted performance has semantic time, its dependent layers follow the delivery that really
happened. Repair a weak performance at its direction, wording, reference, or generation according to
the visible and audible problem.

## Review the person, not just the waveform

Judge whether the voice and visible performance express the same character: pronunciation, pace,
cadence, emotion, mouth movement, gesture, gaze, and interaction with the scene. Across recurring
Takes, listen for identity drift and room discontinuity while allowing intentional changes in energy
or delivery.

Review covered passages with their picture and with the underlying speech source made clear. A clean
mix cannot rescue the wrong performer, and a good voice sample cannot rescue an unconvincing Take.
Use `sound-mix.md` for music, effects, ambience, gain, and the completed mix. Use
`generated-dependencies.md` for the broader question of which accepted media should directly
condition another generation.
