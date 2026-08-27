# Reference-video vocabulary decisions

Read `../vocabulary.md` first. It decides how a package is chosen for any route — enumerate every
system before naming one, `list_svml_packages` and `inspect_svml_vocabulary`, reuse before compose
before declaring a gap, and what a real gap obliges. This file is only what the reference evidence
adds to that.

**Enumerate from the evidence, not from memory.** The systems this reference contains are the ones the
four whole-reference observations and the per-shot `visual` and `text_appearance` passes describe —
base pictures, inserted elements, full-screen graphic compositions, persistent overlays, captions,
speech, music, sound effects. Work that list, and inspect candidates for each entry on it. A system
you never inspected is a system you are about to invent, and here you would be inventing it against a
video that already answers the question.

**An observation's "base picture" is the full-frame underlying footage** — whatever fills the screen
under any overlays. The authoring base that `continuity.md` defines is a separate thing: it is the
picture showing the speaker saying the words, and `continuity.md` decides which picture that is. A shot observed as "the base picture is a classroom" is a full-frame
classroom; where the speaker is cut away to silently in that classroom while their voice continues,
the classroom is B-roll covering the base (see `../playbooks/craft/b-roll.md`), and the base remains
with the speaker. Read the observation for what fills the frame; read `continuity.md` for which
picture owns base.

## Where an appearance value comes from

`../vocabulary.md` says every declared property that changes what the viewer sees must be resolved
before a package is accepted, and that a default value is not a decision. In this route the values are
measured rather than chosen:

- Each shot's `text_appearance` observation already describes drawn type in those terms. Read it
  before asking anything.
- Resolve what remains with a narrow `observe_reference --question` over the one to three shots where
  the element is most legible. Ask about visible attributes, never about components or syntax. A
  question costs one request and does not disturb cached observations.
- If the evidence came back inconclusive, ask again with a narrower question rather than accepting a
  default: a value the observer never saw is not evidence.
- Read a persistent system's appearance from the shots where it is clearest and apply it to the whole
  system, as `continuity.md` requires.

## After the gap is filled

Installing the package is not the end of the gap route. Read `final-sources.md` and write the three
sources, then continue into `comparison-round.md`: a component that loads is not yet a component
that looks like the reference.

The reference-video CLI remains limited to observation, vocabulary inspection and blind image
comparison; it does not generate components. Gemini does not write the package.
