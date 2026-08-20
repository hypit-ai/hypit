# All components

One Source that writes every kind of Track at once: speech, a ranking board, a
media card, a screen treatment, typography and captions, over a take nobody has
generated yet.

It exists to exercise the vocabulary: every Track kind declared once, in one
Source, so a change that breaks one of them breaks something a reader can see.
`hypit check` proves it is legal, and the graph-shape tests read it.

**It does not currently open in Studio.** Studio builds only the deterministic
closure of a Run, so a Source in this state — no footage, no recording, no
caption plan — refuses:

```
Studio cannot start:
- the Studio projection closure requires unresolved capabilities:
  @hypit/caption-gemini@1#gemini-caption-planning, @hypit/gpt-image@1#gpt-image-2,
  @hypit/media-pipeline@1#inspect-media, @hypit/media-pipeline@1#normalize-media,
  @hypit/media-pipeline@1#project-speech-evidence-audio,
  @hypit/seedance@1#seedance-2-mini, @hypit/whisperx@1#whisperx-alignment
```

Opening it means satisfying those outputs in a Run Source, or accepting a Build
that produced them. See `docs/quickstart/preview.md`.
