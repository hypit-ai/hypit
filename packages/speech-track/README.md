# `@hypit/speech-track`

Assemble the performances carrying the Script into one semantic timeline, with separate picture and
sound outputs. In the usual spoken production, these performances are the A-roll. A speaker can be
covered by B-roll while their words continue to define the semantic time of the piece. A podcast's
speaking turns share this timeline; an independent narration can also carry it.

A-roll can be a circular picture-in-picture or a foreground presenter cutout over another main
picture. Its speaking performance establishes the semantic timeline regardless of its screen area
or stack order. Speech Track projects that same prepared Take into semantic, visual and audio
outputs together; the inset or cutout does not need to be displayed a second time through Media
Track.

## Assemble prepared Takes

Normalize the media and associate each Script Segment with a SemanticTake before assembly. A spoken
Take includes aligned words; a wordless Take includes its media and Segment boundaries. One Take can
contain several speakers or camera cuts. Takes are assembled in Source order:

```svml
<import as="speech" from="@hypit/speech-track@1"/>

<speech:Track id="speech" visual-frame={layout.full}
  visual-appearance={look.performance} visual-z="0">
  <speech:Take source={opening.take}/>
  <speech:Take source={answer.take}/>
</speech:Track>
```

This excerpt assumes the Takes, Frame and appearance Recipe exist. An appearance Recipe can share
the ordinary visual appearance of a Media Item:

```svs
performance {
  fit: cover;
  clip: rounded;
  radius: 270;
  border-width: 3;
  border-color: rgba(255, 255, 255, 0.9);
}
```

With a `540 × 540` Frame, that rounded clip presents the performance as a circle. The shared frame
rate and total ProgramSpace come from the ordered Takes. Their local word and boundary frames become
positions in that assembled space.

| Output | Use |
| --- | --- |
| `.semantic` | Supply semantic timing to Film, Caption, Media, Typography, Audio and other components |
| `.visual` | Include the performance picture in Film when wanted |
| `.audio` | Include the performance sound in Film, including beneath B-roll |

Each Take always contributes its Segment and Anchor timing. A Take with no audio stream contributes
no audio clip; a Take with no visual stream contributes no picture. Its remaining semantic and
media projections continue normally, so a video-only wordless Take needs no synthetic audio and an
audio-only narration needs no synthetic picture.

Select each wanted picture and sound output explicitly in Film. Replacing the visible picture with
Media Track coverage does not replace the semantic timeline or mute the included performance audio.
An audio-only performance can supply the timeline while other Tracks supply the picture.

## Present the performance directly

`visual-frame`, `visual-appearance`, `visual-motion` and `visual-z` supply the Track's visual base. A
Take can override them with `frame`, `appearance`, `motion` and `z`. Appearance can control fit and
crop anchors, opacity and filters, rounded or rectangular clipping, padding, borders, shadows and
frame paint. Lifecycle motion can move that visual presentation as it enters, remains or exits. None
of these choices changes the Take's semantic timing or audio.

Sampling children move the Take's picture inside its Frame over normalized Segment progress, using
the same fields as a direct Media Item:

```svml
<speech:Take source={opening.take}>
  <speech:Sampling at="start" zoom="1"/>
  <speech:Sampling at="end" zoom="1.08" y="-18" easing="ease-out"/>
</speech:Take>
```

Use [Media Track](../media-track/README.md) when a picture owns an independent semantic Window,
source playback or trim, source audio, a replacement Sequence, or a visual source other than the
performance itself. Caption and MG consume `.semantic` to follow the same words and events.

The [Studio Companion](../speech-track-studio/src/index.ts) presents the assembled Takes and their
materials. Media preparation is owned by [Media Pipeline](../media-pipeline/README.md), and exact
SemanticTake values by [Speech](../speech/README.md).
