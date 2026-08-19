# Reference-video reconstruction route

This route reconstructs a complete reference video as usable `main.svml`, `studio.svs`, and
`build.svrun`. The main agent owns all decisions and source code; Gemini supplies natural-language
visual and audio evidence only.

Before acting, read these files completely in order:

1. `workflow.md` — CLI sequence, evidence flow and responsibility boundaries.
2. `continuity.md` — mandatory shot, overlay, B-roll, speaker, product and persistent-system rules.
3. `../playbooks/craft/graphic-compositions.md` — what may be a base picture, when a full screen is
   one authored composition, and where a missing picture comes from.
4. `../playbooks/craft/generated-dependencies.md` — what one generation owes another: the location,
   the split shot, the voice, the first frame, and the stretch too short to be a take.
5. `vocabulary.md` — existing-package selection, appearance-property resolution, and the route for a
   real vocabulary gap.
6. `reconstruction-loop.md` — rendering what was built and comparing it against the reference.
7. `final-sources.md` — complete source authoring and check loop.

Paths above are relative to this file's directory. Do not skip a file because the task looks like a
familiar video format.
