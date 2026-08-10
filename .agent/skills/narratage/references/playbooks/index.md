# Narratage production playbooks

Portable production patterns extracted from `twinit/playbooks` and rewritten for Narratage. These
files describe what to author and inspect, not twinit canvas nodes or JSON contracts.

## Decision path

1. Identify the format: talking head, street interview, two-person podcast, voiceover desk demo, or
   silent mixcut.
2. Apply universal gates: `production-gates`, `visual-continuity`, and `seedance-directing`.
3. Add focused craft: `image-prompt-style`, `b-roll`, `overlays`, `captions`, `persona-and-audio`,
   or `screen-demo`.
4. Map the result to Script, Seedance, Speech Spine, SemanticMap, peer Tracks, Film, and Run Source.
5. Run provider-free `check`/`plan`; only then release paid generation.

## Universal prompt policy

- Write all VLM instructions and all image/video generation prompts in English.
- Preserve the original language only for verbatim dialogue, transcript text, and quoted sample lines.
- Describe desired states directly. Do not mention mutually exclusive alternatives or objects that
  should not appear; generation models can materialize them.
- Never ask Seedance to render subtitles, captions, floating labels, stickers, or UI overlays. Author
  those as Caption, Typography, or Media Tracks.

## Craft

- `craft/image-prompt-style.md` — realistic reference-frame construction.
- `craft/seedance-directing.md` — action prompts and physical motion envelopes.
- `craft/visual-continuity.md` — identity, reverse views, props, and shot continuity.
- `craft/b-roll.md` — story-first inserts and supplied/generated media decisions.
- `craft/screen-demo.md` — UI and device demonstrations.
- `craft/overlays.md` — text, stickers, PIP, timing, and gaps.
- `craft/captions.md` — one caption program and measured timing.
- `craft/persona-and-audio.md` — identity and voice references.
- `craft/pip-overlay.md` — composited picture-in-picture.
- `craft/sfx.md` — event-based sound effects.
- `craft/production-gates.md` — free validation, review, and paid gates.

## Formats

- `formats/talking-head.md`
- `formats/street-interview.md`
- `formats/two-person-podcast.md`
- `formats/voiceover-desk-demo.md`
- `formats/mixcut.md`
- `formats/ranking-listicle.md`
- `formats/scenario-call.md`
- `formats/asmr.md`
- `formats/mass-tarot.md`
