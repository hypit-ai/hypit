# Mass-tarot pick-a-card format

Build a four-stage reading: question → exactly three face-down cards → pick 1/2/3 prompt →
ordered reveals and interpretations.

## Author the narration and program time

- Write one authoritative Script with Selections/Moments for the question, choice window, each reveal,
  and the close.
- Use one continuous narration take whenever the reading is voiceover-led. Generate it with
  `mimo:Preset`, `mimo:VoiceDesign`, or `mimo:VoiceClone`, then use an audio-only Speech Take:

```svml
<speech:Spine id="speech" frame-rate="30"
  visual-frame={full-frame} visual-appearance={studio.speech.visual} visual-z="0">
  <speech:Take audio={narration.audio} segment={story.segment.reading}/>
</speech:Spine>
<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>
```

  Peer Media Tracks provide every card/table visual while `{speech.audioTrack}` carries narration.
- A visible host may instead use `speaker-v1` speaking takes assembled through the same Spine.

## Author the card visuals

1. Establish one accepted table scene with exactly three face-down cards, stable card positions,
   lighting, hands, cloth, and surrounding objects.
2. Use supplied card-face art whenever exact symbolism or card identity matters.
3. Vendor `broll-v1.svs`. Use `product-beauty` or `practical-real`, a `single-moment` or
   `process-demo` story shape, `continuous-shot`, a locked/macro camera, and micro/readable motion.
4. Generate silent card actions with `seedance:FrameVideo` for exact first-frame control or
   `seedance:ReferenceVideo` for multiple visual references; set `generate-audio="false"`.
5. Place the accepted question/table/reveal shots with `media-track:Item` or
   `media-track:Sequence` using the
   Script's measured Selections and Moments.

Keep card count, order, back design, face identity, hand ownership, and reveal direction stable.
Reject a fourth card, duplicated card, changed artwork, impossible hand contact, or a reveal that no
longer matches its interpretation.

## Separate spoken and editorial text

- Use the exact-font Caption pipeline only for spoken narration or host dialogue.
- Put the question title, `PICK 1 / 2 / 3`, card numbers, short interpretation highlights, and CTA on
  `typo:Track` unless they are physically printed on supplied card art.
- Give the choice window enough time for the viewer to decide before the first reveal.

## Keep claims responsible

Frame the reading as reflection and possible direction, not guaranteed fortune-telling. Do not
promise exact outcomes or dates. For questions about a future person, describe themes or traits
rather than predicting physical appearance.

## Review and reuse

Review the complete four-stage order, exact card count and identity, narration/reveal timing, text
legibility, claims, and final CTA. Pin accepted table images, card shots, narration, and host takes
through `.svrun` `build-record` and `satisfy`.

Read `../craft/b-roll.md`, `../craft/captions.md`, `../craft/overlays.md`, and
`../craft/persona-and-audio.md`.
