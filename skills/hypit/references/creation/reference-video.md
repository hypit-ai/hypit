# Understanding a reference video

Read this when a video or link is evidence for what the new work should preserve, adapt, or learn
from.

## Direct the investigation

The Agent is the mind and director. Moving-image observation is its broad eye, transcription and
alignment are its ears, and local media commands prepare closer views that the Agent can inspect
itself. The tools report evidence; the Agent connects events across time, resolves contradictions,
explains why they matter, and decides what to inspect next. Gemini supplies moving-image observations;
the Agent connects them into a whole-piece understanding and authors the target work.

Begin by watching the whole piece. For ordinary reconstruction, give the whole work or meaningful
spans to a capable moving-image observer so motion, order and distant relationships are actually in
evidence. Spoken language carries most work Hypit is asked to clone, so obtain and read its word-level
transcript and use it as the normal time spine. If the piece is genuinely speechless, establish that
spine from its actions, visual changes, music, effects and silence. Form a provisional account of:

- the Hook, story movement, payoff, and intended viewer response;
- how speech or silence carries the piece, who speaks when present, and the roles of A-roll and B-roll;
- the persistent and recurring Caption, Typography, MG, Effect, and Audio systems;
- changes, accumulations, replacements, reveals, cover relationships, and callbacks;
- the few relationships that make the piece recognizably itself.

Then spend detail attention where an answer can change the production. A ranking board that already
contains players while a new portrait appears nearby raises a structural question: whether the new
portrait enters, replaces, or accumulates on the board. That matters before the exact direction of an
incidental slide. Coarse understanding tells you what deserves a close look; close evidence is allowed
to overturn the coarse understanding.

## Choose evidence for the question

Use `hypit transcribe` for speech and word time. Use `hypit observe` as the normal broad visual pass
for reference reconstruction, over the whole short work or meaningful spans of a longer or denser
work. Motion, sequence, persistence, transitions and whole-piece context need moving-image evidence.
The local `hypit media` family prepares views without interpreting them:

- `probe` reports media facts;
- `cut` isolates a short temporal question;
- `frames` exposes exact moments or small details;
- `tile` and `tiles` show change across a span with visible time labels;
- `boundaries` offers possible visual-change locations for navigation;
- `fetch` turns a supported link into a local source file.

For example, these commands preserve original-media time while exposing different evidence:

```bash
hypit transcribe references/ad/source.mp4 \
  --to references/ad/transcript.json

hypit media tile references/ad/source.mp4 --start 0 --end 12 \
  --to references/ad/evidence/opening.jpg

hypit media cut references/ad/source.mp4 --start 6.8 --end 8.4 --label-time \
  --to references/ad/evidence/list-change.mp4

hypit media frames references/ad/source.mp4 --at 6.9,7.3,7.8 --label-time \
  --to references/ad/evidence/list-frames

hypit observe references/ad/source.mp4 \
  --instruction "Observe the supplied work and report evidence relevant to the question." \
  --prompt "How do the picture, Caption, MG and sound establish and pay off the hook?" \
  --to references/ad/drafts/whole-piece-observation.md
```

`transcribe` writes word evidence used beside `TIMELINE.md`. Media commands write only the clips,
frames or grids named by `--to`; keep the ones worth reopening under `evidence/`. An `observe` report
is an observer's account, not the reference archive itself. Read it against the media, then write the
connected whole-piece judgment in `ANALYSIS.md` and locatable facts in `TIMELINE.md`. A narrower
question can instead use one clip, grid or frame as its input. The command forms are composable; the
current uncertainty decides which of them is useful.

Frames and tiles complement moving-image observation by supplying direct static evidence. If no
moving-image observer is reachable, distinguish the evidence that remains direct from the
relationships that are not yet well established. Frames and tiles still show appearance, text,
composition, geometry, and sampled states; they provide less evidence about motion, transitions,
persistence, and relationships across distant moments. Explain that limitation in terms of the
current work, then use the
[Runtime Profile](../environment/profile.md) to present the actual ways to strengthen the missing
moving-image evidence. A user may knowingly choose to continue with that evidence limit, and a truly
static question may need only static evidence, but the Agent does not present the limited account as
a complete moving-image reading.

When moving-image observation becomes reachable later, use it to revisit the parts of the reference
that were understood from static samples alone. Update `ANALYSIS.md` and `TIMELINE.md` where the
evidence changes them, then reconsider affected Treatment, Script, shots, components, or prompts.
Existing work that the stronger evidence still supports remains useful. Observation may itself be a paid request;
make its Endpoint and price source visible and use only spending authority that covers it.

No evidence form is a substitute for every other one. A still cannot establish movement or sound. A
single representative frame cannot establish entry, exit, replacement, or persistence. A long video
pass can lose small text and rapid order. A tile shows sampled order but may miss what happens between
cells. When motion direction or a transition is important, inspect a short clip or denser adjacent
frames. When text or geometry is important, inspect full-resolution frames. Keep an unsupported claim
unknown instead of completing the prose by imagination.

Visual reports can be wrong even when fluently written, especially about changes over time, small UI,
rapid cuts, and which neighboring shot owns a detail. Compare the report with the transcript and the
actual media. Ask one narrower question over one relevant span when the answer would change the work.
Platform watermarks and player chrome are viewing context unless the video itself demonstrates that
the author designed them.

For Caption systems, sample every meaningfully different configuration: speakers with different
colors or positions, normal and emphasized states, different regions, or different motion. Repeated
uses of one configuration do not need separate style investigations. A fixed quota of frames cannot
prove that all configurations were seen.

## Write two complementary reference documents

`ANALYSIS.md` carries the whole-piece model. Write what kind of work it is, its story and pacing, what
each layer contributes, which systems persist or recur, how distant moments relate, and why the piece
works. Distinguish visible or audible facts from the Agent's reading in ordinary prose.

`TIMELINE.md` carries locatable behavior. Organize it with loose second-level sections named by an
original-media time range and a human-readable content phase:

```md
## 6.07–8.27 · Pain-point list accelerates

Speech: the list reaches “videos / voiceovers / ads / scripts”. WhisperX places each word in this
span.

Picture: each item uses a new B-roll shot. Tile 003 shows the cuts clustered around the spoken list.

Caption: a marker-style word appears with each listed item; the lower spoken Caption is absent here.

Reading: the one-item/one-picture rhythm makes the workload feel excessive.
```

These sections are navigation, not mutually exclusive rows. They may overlap, leave an unresolved
gap, or contain smaller timed notes where density warrants it. Within a section, describe every layer
that is actually active together. A title, music bed, Caption style, or MG object may continue across
several sections; say that it continues rather than pretending the document boundary reset it.

Use open production vocabulary—A-roll, B-roll, Speech, Voice-over, Silence, Caption, Typography,
Text Track, MG, UI, Effect, Audio—and introduce a clearer term when a work needs one. Caption is the
spoken display system: words, Cues, speaker or role, activation, placement, and style. Typography is
independent visual writing such as a title, label, step, or poster text. UI and MG may contain text of
their own. Classify by function instead of collapsing everything visible into a generic text track.

Name the material for an important observed fact when its provenance will help another Agent trust,
reopen or correct it: “tile 004 shows…”, “the 0:12.4 frame shows…”, “the 0:12–0:14 clip shows…”, or
“the WhisperX transcript gives…”. Several materials may support one conclusion. Ordinary connected
description need not repeat the citation in every sentence. When a fact remains unsettled, name the
question that would change the work.

## Preserve time without turning it into target code

Look for the editorial intention behind timing. A portrait may arrive when a player is named, an
icon may settle when a verdict lands, and the next speaker's voice may begin while the previous
picture remains. Explain those relationships from the actual evidence. For the target, prefer
Selections for meaningful spans and Moments for events, then let the accepted Takes locate them.
If the new product changes the argument, reconsider the picture or reveal that serves it as well.

Reference time establishes order, overlap, duration, and relation to spoken words. Record both the
original seconds and the meaningful relation: a picture illustrates the word `videos`, a reveal lands
after a pause, a Caption Cue spans a phrase, or an effect continues through a cut. In the usual spoken
work, word-level evidence lets the director identify what an event means and later bind it to Script.
A genuinely speechless work locates meaning through action, visual change, music, effects and silence
instead. Read `script-and-time.md` when turning those observed relationships into the target's Script
identities and timing.

## Keep the archive complete and revisable

“Complete” means another Agent can recover every important element, when and how it appears, which
system it belongs to, what it relates to, what role it plays, and why those relationships matter. It
rests on accurate temporal and stylistic evidence without becoming a frame-by-frame transcription.

Store only evidence worth reopening. Update Analysis and Timeline in place when new evidence changes
the account. Put the current unresolved question and next useful observation in the reference's
`PROGRESS.md`. Understanding the reference does not create the user's Brief.
