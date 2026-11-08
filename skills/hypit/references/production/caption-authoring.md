# Writing a Caption family

Read this when the work needs a new visual relationship among displayed speech, layout and motion.
[Caption craft](../playbooks/craft/captions.md) owns readability and directing judgment;
[Caption presentation](caption-presentation.md) owns applying treatments and materializing them.

## Decide what is actually new

The official `@hypit/caption-basic` family covers a centered Caption box, Cue-level Style changes,
visibility and optional current/trailing Karaoke. Changing color, font size, box shape or Karaoke
mode is a Basic Style change. A persistent visual role on selected display words can be authored as
a Script attribute such as `word{face=serif}`; Basic may ignore it, while a family designed for that
role can interpret it.

A keyword occupying an independent oversized line, phrases attached to different speakers, or words
coordinated with diagrams can justify a project Caption family. Creating that component is normal
video production. The result is still Caption when displayed words correspond to speech and remain
close to its delivery; independent titles and summaries normally belong to Typography or MG.

## Consume the stable Caption facts

The reusable input chain is:

```text
standalone Script
  -> CaptionDocument (Words, Units, Cues, Roles, word attributes)
TimedTranscript + Narrative alignment + Binding
  -> LocalCaptionTiming
project materializer
  -> ordinary NLE Component Items containing CaptionCuePayload
```

`CaptionCuePayload` contains one Cue's complete display Words and exact Unit-local boundaries. It
contains no Script, transcript, media, matching strategy or named semantic dependency. A custom NLE
component resolver reads that payload and its own family parameters, then returns its ordinary AVIR
picture source and HTML terminal implementation.

Consume each Word's `separatorBefore` together with `text`; never reconstruct display spelling by
joining speech Tokens. Preserve `attributes` for family-owned local roles. Unit time drives Karaoke,
reveal and speech-following motion; Cue membership drives handoff and block layout.

## Own rendering, not upstream evidence

A Caption family owns:

- the parameters that describe its visual treatment;
- layout of the complete Cue and any family-defined word roles;
- Cue entrance, exit and handoff behavior;
- how exact Unit time affects reveal, highlight or motion;
- its NLE component symbol, resolver and terminal implementation.

It does not own WhisperX, M:N correction, Narrative alignment, media trim, Script parsing or project
placement. The one-shot materializer maps source-local timing through the selected media occurrence
before writing the Item. After that point the family sees only direct Item-local values.

For another family, create a project package under `packages/`, register its NLE and HTML-video
component facets, and have the project program emit Items using that component symbol. Reuse the
shared `CaptionCuePayload`; do not copy Basic's renderer or add a new Caption document model merely
to obtain a different layout.

## Design and test the family

Start with a short Script containing a Role change, a Dual Text Unit, a Cue with several Units and a
word attribute. Test uneven Unit durations and a real pause. Confirm:

- every displayed Word appears exactly once with authored separators;
- Unit time remains rational and seekable at arbitrary frames;
- a long Cue wraps or overflows according to the family's explicit policy;
- attributes affect only the vocabulary the family owns;
- static presentation and Karaoke consume the same payload;
- disabled, moved, trimmed and directly edited Items require no upstream semantic lookup.

Preview the component in the actual canvas and moving picture. A still can establish typography and
layout; focused playback establishes reading rhythm, handoff and speech-following motion.
