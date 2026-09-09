# Understanding a reference video

Read this when a video or link is evidence for what the new work should preserve, adapt, or learn
from. The useful result is a timecode-level semantic reading: what the piece communicates, and how
its exact audiovisual choices make that communication work.

## Read the whole through its details

Watch the whole reference from opening to close. Follow its hook, argument or story, shifts of
attention, payoff and intended viewer response. Read the spoken words with their times. Notice who
establishes the performance, what the pictures contribute, and which Caption, MG, Typography, Effect
and Audio systems persist or recur. Form a provisional explanation of why the piece works.

Read that meaning through its concrete realization. Each designed element deserves an account of its
content and appearance, spatial relationship, entry, active behavior, persistence and exit. Locate
these changes against the words, pauses or actions they serve. Explain what the choice does for the
viewer: establishes a person, contrasts two claims, accumulates proof, amplifies a reaction, makes
a process legible, or hands attention to the next idea. Meaning directs the close look; the close
look supplies the detail needed to recreate the expression. Close reading also reveals purposes and
connections that the first whole-piece impression missed.

When a choice is puzzling, widen the view: relate it to the surrounding words, nearby events, earlier
appearances and later consequences. Consider what those connections could explain, then examine the
relevant sequence. Read the Format or Craft for the relationship you are investigating; use it to
sharpen the question and recognize what the reference is doing.

A motion's name is a starting point. Inspect its path, scale or opacity change, pace, overshoot or
settling, and relationship to neighboring events when those make the effect distinctive. Likewise,
understand a graphic's hierarchy, typography, palette and spacing through what the viewer must read
first and compare next. Compression comes from identifying a coherent behavior that explains many
frames. A dimmer copy during an exit may be one object's fade, for example; inspect the sequence to
understand the change.

Whole-piece and close readings revise each other. An object that survives a camera cut belongs to a
system with a longer lifetime than that shot. Follow its state across the piece: a new entry may
replace an item, add to a collection, or temporarily cover it. Document the system once and locate
its changes in time. Camera boundaries help navigation; meaning and continuity determine which
things belong together.

## Make time visible

Use `hypit transcribe` when understanding a spoken reference. Its wording and word-level times give
a strong starting point for following the argument and connecting speech to cuts, illustrations,
reveals and emphasis. Keep that transcript beside the reference and interpret its wording with the
surrounding argument, visible names and supplied context. Small transcription errors can coexist
with a clear understanding of what the passage means.

WhisperX's recognized spelling reflects the recognizer's interpretation of the audio. Coined words
and unfamiliar names are especially prone to substitutions, so a spelling difference alone cannot
establish a pronunciation error. The transcript helps recover the reference's content and locate
its moments. For the new work, [Script pronunciation](script-and-time.md#write-the-intended-pronunciation)
expresses the words and readings the generation request should perform.

For speechless work, locate meaning through actions and changes in the scene.

The local `hypit media` commands expose the source at the scale needed:

- `probe` gives duration, dimensions, frame rate and audio presence;
- `cut` saves a selected passage as a clip;
- `frames` extracts chosen moments or a range at a chosen interval;
- `tile` and `tiles` arrange time-labeled frames for inspecting change, with optional word context;
- `boundaries` locates abrupt visual changes worth inspecting;
- `fetch` saves a supported video link locally.

Use broad grids across the full reference to follow its development. For a long reference, read
manageable passages while keeping their place in the whole clear. Inspect dense sequences around
the entries, changes and exits of its distinct visual systems. Choose the range and sampling
interval for the behavior being investigated. A brief animation needs neighboring frames; small
writing needs a larger cell or a full-resolution frame. A broad grid can miss brief events between
samples. Follow the developing idea and the visual systems through closer sequences to understand
their changes and handoffs.

```bash
hypit transcribe references/ad/source.mp4 \
  --to references/ad/transcript.json

hypit media tile references/ad/source.mp4 --start 0 --end 12 --every 1 \
  --to references/ad/evidence/opening.jpg

hypit media tile references/ad/source.mp4 --start 6.8 --end 8.4 --every 0.1 \
  --transcript references/ad/transcript.json --columns 4 --cell 480 \
  --to references/ad/evidence/list-change.jpg

hypit media cut references/ad/source.mp4 --start 6.8 --end 8.4 --label-time \
  --to references/ad/evidence/list-change.mp4

hypit media frames references/ad/source.mp4 --at 6.9,7.3,7.8 --label-time \
  --to references/ad/evidence/list-frames
```

Time labels identify positions in the input media. Give `--transcript` the transcript of that same
media; its word times share that clock. Word labels sit below the picture so the original Caption
and MG remain visible. Keep useful evidence under `evidence/` and use descriptive names that make it
easy to reopen the relevant question.

To inspect a spoken phrase, use `--around "the phrase" --transcript references/ad/transcript.json`
in place of `--start` and `--end`. `--padding` adds surrounding time; repeated phrases can be selected
with `--occurrence`. Use `tiles` with `--columns` and `--rows` to page a dense sequence into readable
grids. Keep the range broad enough to see the incoming and outgoing handoffs.

For Caption, inspect each meaningfully different configuration: speaker treatment, placement,
emphasis, Cue shape and animation. Follow transitions between configurations too. Repeated uses of
the same behavior can share its description, with their differing content and times recorded.

When two readings conflict, reopen the relevant source interval and make the disputed detail legible.
State what is visible or audible separately from what you infer it means. Player controls and other
viewing context belong to the viewing surface; distinguish them from the designed video content.

## Preserve a connected account

Write the understanding into the project as it develops. Preserve both the whole-piece explanation
and the detailed reading, with source times and useful evidence paths so someone can pick up the
same work from the files. Include what a choice does for the viewer alongside how it appears.

`ANALYSIS.md` carries the whole-piece model: what the work is trying to achieve, how its story and
pacing work, what each visual or sound system contributes, which systems persist or recur, and how
distant moments relate. Keep the reference's facts and your interpretation distinguishable in
ordinary prose.

`TIMELINE.md` carries time-locatable realization. Organize it into sections named by source-media
time and a meaningful phase. Within each, connect the active layers and their detailed behavior to
the words or actions they serve. An account should let someone find the event, understand its
expression and implement an appropriate counterpart. For example:

```md
## 6.07–8.27 · The workload accelerates

The spoken list reaches “videos / voiceovers / ads / scripts”. Each noun brings a new full-frame
illustration and a marker-style word at its center, replacing the preceding pair. The lower spoken
Caption gives way to these central labels so each example reads as one unit.

The word and picture enter together on each noun; the labels pop to size, settle briefly, and leave
with their picture on the next cut. The increasingly short holds make the workload feel excessive.
The 6.8–8.4 clip and list-change grid show the handoffs; word times are in transcript.json.
```

These sections can overlap and contain finer timed notes where the work is dense. A persistent
title, board, sound bed or Caption system can span several sections; refer to the same system and
describe what changes. Keep exact text, meaningful colors, positions, motion phases and timings where
they are needed to understand or reproduce the design. Reopen the media for facts still in doubt.

Use production vocabulary by function. A-roll establishes the semantic performance even inside a
small inset or behind a full-frame B-roll. Caption displays the speech; Typography carries independent
writing. MG and UI can contain text of their own. A sound can support a continuing argument across
several picture changes. Name the roles that clarify this particular work.

## Turn understanding into new direction

Source time locates evidence. Record both the original seconds and the expressive relationship:
a reveal answers a question, an image illustrates a phrase, an exit makes room for the next claim,
or an audio handoff begins the next speaker under the previous picture.

The user's request determines how those relationships should live in the new piece. A different
person or product may change the argument, copy, number of examples, graphic content, placement and
duration. Use [transformations](transformations.md) to think through that adaptation. Prefer
Selections for meaningful spans and Moments for events in the target Script, and let the accepted
performance establish their time. [Script and time](script-and-time.md) owns that authoring language.

The recorded account should explain the whole piece from opening to close and make its distinct
visual systems and their changes locatable. It should be concrete enough to direct the new work:
what to preserve or adapt, how it is expressed, and why it belongs. Continue investigating an
unexplained relationship where it could change that direction.

Keep the current question, passages or systems still to examine, and next useful action in
`PROGRESS.md`. Write discoveries into Analysis and Timeline while they are fresh, and revise those
accounts when the reading changes. When resuming, read these files and reopen the source at the
recorded locations. The user's goal remains in Brief and your new design in Treatment.
