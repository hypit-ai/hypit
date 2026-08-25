# Hypit production playbooks

Use these playbooks to author production decisions directly in `.svml`, `.svs`, and `.svrun`
sources. Each playbook names the SVML components, timing model, review gates, and reuse behavior
needed for that craft or format.

## Required load order

1. Always read `craft/frame-coverage.md`, `craft/visual-continuity.md`,
   `craft/graphic-compositions.md`, and `craft/generated-dependencies.md`. Each route file names the
   step that reads them.
2. Read `craft/seedance-directing.md` whenever the Author Source invokes Seedance.
3. Read the selected format file and only the additional craft files **its own footer** names.
   That footer is the complete list; this index does not repeat it, and a footer that is wrong is
   fixed in the footer.
4. Read the installed `packages/<name>/README.md` for every package whose elements you write, and the relevant
   authoritative Quickstart page for the model behind them.

No document a whole job needs may be reachable only through a conditional file. Craft and format
files are selected per job; a spine is walked by every job on its route, so anything every job needs
is named by `../original-authoring/route.md` or `../reconstruction/route.md` rather than by a craft
file that some jobs never open.

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
- Build speech-led programs from normalized `whisperx:SemanticTake` values with `speech:Track`, then add
  peer Caption, Media, Typography, Ranking, Deck, Comment, Screen, and Audio Tracks.
- Use `speech:Track` for ordered speech-bearing Semantic Takes. A program with no spoken words still
  has a SemanticTrack, because it is the frame domain every `start`/`end` window resolves into: keep
  the `whisperx:SemanticTake` and `speech:Track` declarations, which are what declares the
  `<track>.semantic` output, and satisfy that output in `.svrun` with a `build-record` Candidate from
  a Build that already produced one. Keep `<track>.visual` and `<track>.audio` out of the Film and the
  alignment goes unreached — `hypit plan` lists it under `Declared but not reached`. Time every Item
  and Clip with `start`/`end`, and omit the Caption components.
- Assemble peer Tracks with `film:Film`, render with `render:Video`, and demand outputs through a
  `.svrun` Target.
- Stage expensive work with narrow `.svrun` Targets. Explicitly reuse an accepted Record through
  `build-record` plus `satisfy`; Hypit has no implicit cache.
- Use only elements and attributes documented by the current Quickstart or package README. Never
  invent a component or attribute to fill in missing syntax; `../vocabulary.md` says why, and how to
  find out what exists.

## Prompt policy

- Write VLM instructions and image/video generation prompts in English. Keep original-language
  dialogue, transcript, pronunciation, and quoted copy verbatim.
- Describe the desired visible state directly. Omit unwanted concrete objects instead of naming
  them inside negations or hypotheticals that a model may materialize.
- Keep editorial captions, titles, stickers, cards, and callouts out of generation prompts. Author
  them as explicit Tracks. Preserve text that is physically attached to a supplied product, screen,
  document, or sign.

## Craft

- `craft/visual-continuity.md` — identity, shot groups, reverse-view geometry, and prop invariants.
- `craft/graphic-compositions.md` — what counts as a base picture, full-screen graphic compositions,
  and where missing material comes from.
- `craft/frame-coverage.md` — what is on screen at every instant, and the edges nobody chose.
- `craft/generated-dependencies.md` — what one generation owes another: the location, the split picture,
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

| Format | Choose it when the request is |
|---|---|
| `formats/talking-head.md` | one presenter speaking to camera — an explainer, an opinion piece, a piece to camera |
| `formats/street-interview.md` | a vox pop, passers-by being asked something, an interview on location |
| `formats/two-person-podcast.md` | a conversation between two people — a podcast clip, an interview at a table |
| `formats/scenario-call.md` | a video call or screen share, two live tiles, an active speaker that changes |
| `formats/ranking-listicle.md` | a top-N, a countdown, a tier list, "best X", any ordered set revealed in turn |
| `formats/mass-tarot.md` | a pick-a-card reading, a pick-a-pile, a several-option reveal |
| `formats/voiceover-desk-demo.md` | a voiceover over a product, a desk demo, a screen or hands walkthrough |
| `formats/mixcut.md` | a montage or music-led cut — short shots carrying the argument, nobody to camera |
| `formats/asmr.md` | close texture and sound, a satisfying micro-film, one physical action per shot |

Each format file's own footer is the single authority for the additional craft that format needs.
This table routes; it does not require. **An inventory may carry descriptions, and may not carry
requirements.** A stale description misroutes and the first line of the file it opens corrects it; a
stale requirement is silently unmet and nothing corrects it.
