# Hypit production playbooks

Use these playbooks to author production decisions directly in `.svml`, `.svs`, and `.svrun`
sources. Each playbook names the SVML components, timing model, review gates, and reuse behavior
needed for that craft or format.

## Required load order

1. Always read `craft/production-gates.md`, `craft/frame-coverage.md`,
   `craft/visual-continuity.md`, `craft/graphic-compositions.md`, and
   `craft/generated-dependencies.md`.
2. Read `craft/seedance-directing.md` whenever the Author Source invokes Seedance.
3. Read the selected format file and only the additional craft files it names.
4. Read `packages/<name>/README.md` for every package whose elements you write, and the relevant
   authoritative Quickstart page for the model behind them.

## Shared SVML contract

- Put narrative truth in one `script` with Segments, Role Cues, Selections, and Moments.
- Use `copy:Value`/`copy:Render` from `@hypit/text@1` for prompts and reusable copy.
- Use `typo:Style`/`typo:Track` from `@hypit/typography-track@1` for editorial text.
  Never use the same import alias for generic Text and typography.
- Vendor the selected Seedance Kit into the project, choose stable axes in an SVS Recipe, and keep
  dynamic dialogue/action/story in explicit Text edges.
- Keep model invocation explicit with `seedance:TextVideo`, `seedance:FrameVideo`, or
  `seedance:ReferenceVideo`; keep every media reference, duration, model, resolution, and aspect
  ratio visible in the Author Source.
- Build speech-led programs with `speech:Spine`, measure them with `whisperx:Alignment`, then add
  peer Caption, Media, Typography, Ranking, Deck, Comment, Screen, and Audio Tracks.
- Use `speech:Spine` for speech-bearing video or audio Takes. For speech-free formats, select a
  verified ProgramSpace Record in `.svrun`, author explicit timing, and omit WhisperX/Caption work.
- Assemble peer Tracks with `film:Film`, render with `render:Video`, and demand outputs through a
  `.svrun` Target.
- Stage expensive work with narrow `.svrun` Targets. Explicitly reuse an accepted Record through
  `build-record` plus `satisfy`; Hypit has no implicit cache.
- Use only elements and attributes documented by the current Quickstart or package README. Never
  invent a component or attribute to fill in missing syntax.

## Prompt policy

- Write VLM instructions and image/video generation prompts in English. Keep original-language
  dialogue, transcript, pronunciation, and quoted copy verbatim.
- Describe the desired visible state directly. Omit unwanted concrete objects instead of naming
  them inside negations or hypotheticals that a model may materialize.
- Keep editorial captions, titles, stickers, cards, and callouts out of generation prompts. Author
  them as explicit Tracks. Preserve text that is physically attached to a supplied product, screen,
  document, or sign.

## Craft

- `craft/production-gates.md` — staged Targets, image review, paid generation, and explicit reuse.
- `craft/visual-continuity.md` — identity, shot groups, reverse-view geometry, and prop invariants.
- `craft/graphic-compositions.md` — what counts as a base picture, full-screen graphic compositions,
  and where missing material comes from.
- `craft/frame-coverage.md` — what is on screen at every instant, and the edges nobody chose.
- `craft/generated-dependencies.md` — what one generation owes another: the location, the split shot,
  the voice, the first frame, and the take too short to generate.
- `craft/image-prompt-style.md` — English reference-image prompts and camera geometry.
- `craft/seedance-directing.md` — Kit selection, Recipe axes, references, and motion direction.
- `craft/b-roll.md` — story-led silent inserts and semantic placement.
- `craft/screen-demo.md` — physically possible device/UI views and exact supplied UI.
- `craft/captions.md` — complete Caption pipeline and review rules.
- `craft/overlays.md` — Typography, Media, Comment, and Screen Tracks.
- `craft/pip-overlay.md` — framed video, alpha cutouts, and picture-in-picture timing.
- `craft/persona-and-audio.md` — identity, voice, TTS, normalization, and mix separation.
- `craft/sfx.md` — event-led sound design on explicit Audio Tracks.

## Formats

| Format | Additional craft to read |
|---|---|
| `formats/talking-head.md` | `seedance-directing`, `persona-and-audio`, `captions`, `b-roll`, `overlays` |
| `formats/street-interview.md` | `seedance-directing`, `persona-and-audio`, `captions`, `b-roll` |
| `formats/two-person-podcast.md` | `seedance-directing`, `persona-and-audio`, `captions`, `b-roll` |
| `formats/scenario-call.md` | `seedance-directing`, `persona-and-audio`, `captions`, `overlays` |
| `formats/ranking-listicle.md` | `captions`, `overlays`, `sfx` |
| `formats/mass-tarot.md` | `b-roll`, `overlays`, `persona-and-audio`, `captions` |
| `formats/voiceover-desk-demo.md` | `persona-and-audio`, `b-roll`, `screen-demo`, `captions`, `sfx` |
| `formats/mixcut.md` | `image-prompt-style`, `b-roll`, `overlays`, `sfx` |
| `formats/asmr.md` | `image-prompt-style`, `seedance-directing`, `persona-and-audio`, `sfx` |
