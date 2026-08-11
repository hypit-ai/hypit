# Narratage production playbooks

Portable production patterns for Narratage. These files describe what to author and inspect, not
private renderer internals or an analysis-data contract.

## Decision path

1. Identify the format: talking head, street interview, two-person podcast, voiceover desk demo, or
   silent mixcut. Treat format files as editorial recipes; Narratage does not provide a native
   generation surface for every format.
2. Choose an official Seedance Kit when one matches, then apply universal gates:
   `production-gates`, `visual-continuity`, and `seedance-directing`.
3. Add focused craft: `image-prompt-style`, `b-roll`, `overlays`, `captions`, `persona-and-audio`,
   or `screen-demo`.
4. Read `svml-mapping.md`, then map the result to actual Narratage surfaces: Script, Seedance `TextVideo`/`FrameVideo`/
   `ReferenceVideo`, Speech Spine, SemanticMap, peer Tracks, Film, and Run Source. If a format needs
   a capability not present in the package surface, use supplied media or supported primitives and
   record the gap.
5. Run provider-free `check`/`plan`; only then release paid generation.

## Universal prompt policy

- Write all VLM instructions and all image/video generation prompts in English.
- Preserve the original language only for verbatim dialogue, transcript text, and quoted sample lines.
- Describe desired states directly. Do not mention mutually exclusive alternatives or objects that
  should not appear; generation models can materialize them.
- Never ask Seedance to render subtitles, captions, floating labels, stickers, or UI overlays. Author
  those as `caption-fine:Track`, `text:Track`, or `media-track:Track`.

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
