# Reading each element against what it was asked to be

Completed reviews are durable evidence in the project review log and route snapshot. After a context
boundary, reconcile `.hypit/route-state.json` and continue from its `next_action`; do not repeat an
already completed local review.

**Read `../element-review.md` first.** It owns the round this file sits inside, and everything below
is what having no reference changes.

What it changes is the question. A reconstruction has a second picture and asks what differs. Here
there is one picture, and the question is whether it is what was asked for. Nothing external can
answer that, so the answer has to be written down before it is asked.

## What the element is judged against

Two things, both of which already exist by the time this round starts:

- **The answers frozen at step 3** — the subject, the length, the aspect ratio, the language, who is
  in it, what it says. `route.md` requires them frozen before any prompt is written precisely so that
  something here can be measured against them.
- **The appearance values written down at step 7** — every value that changes what the viewer sees.
  A reconstruction measures those off the reference; here they are chosen, and a value nobody wrote
  down cannot be wrong, which is the failure this round exists to catch.

Write the element's own share of both into a file and pass it as `--intent-file`. It is required, and
required for a reason: a conformance question with nothing to conform to asks whether the picture
looks acceptable, which it always does to whoever drew it.

## The round

```
hypit-reference-video-tools review_element --run projects/<name>/build.svrun \
  --element <id> --segment <id>|--selection <id> \
  --video <rendered>.mp4 --intent-file <what this element was asked to be>
```

`--batch <reviews.json>` sends a whole round as one call, an array of
`{element, segment|selection, video_path, intent_file}` inheriting the Run. Render every stretch
first, then send them together.

The command does not render — `render_element` in `../preview.md` did that. It prepares the picture,
writes an entry to `<project>/.hypit/reviews.jsonl`, and hands back the task: the instruction, the
prompt and one picture. A clip becomes a grid of its own frames; a render that never changes becomes
one still.

There is **no observer question on this route**. The picture is a local render, nobody is billed to
look at it, and the reader is a subagent. If you came here from the skill entry expecting to ask the author
which observer reads the reference, that question belongs to the other route.

## What the reader is asked

`review_element` writes the whole prompt, so there is nothing to compose. It asks two things:

- **Whether the picture matches the description** — which parts it satisfies, which it does not, what
  the description asks for that is not there, and what is present that the description never
  mentioned.
- **What is visibly wrong** — anything cut off by the frame edge or reaching past it, anything
  overlapping something meant to be read, any position or alignment against the frame's edges that
  looks unintended, and anything too low in contrast to read. Over a clip it also asks what appears,
  moves or leaves in a way the description does not account for.

The preview-mock clause is in the prompt already: the reader is told that flat-filled regions stand in
for generations that have not run and to read only what is drawn over them. Do not add it by hand, and
do not add anything that says what you built or what you expect to be found.

The visual pass is geometry-first. Read the hierarchy Canvas → outer Frame/background → inner text or
element. When the intent calls for vertical centring, compare the inner and outer centres on the Y axis
and report whether it is too high or too low. Deliberate left/right bias is not a mechanical defect.
Check containment at both boundaries (content inside its Frame,
Frame inside Canvas), naming any overflowing edge. Confirm the outer Frame is wide and tall enough for
the longest line/mark plus padding, stroke, shadow, and corner treatment; correct centring does not make
an undersized box acceptable. Separate intentional bleed/crop or enter/exit motion from accidental
overflow, and check the final visible bounds against all four Canvas edges.

`authoring_check` returns `layout_geometry` with deterministic Canvas/Frame bounds, centres, parent and
Canvas offsets, containment overflow, and bound element ids. Use it as the mechanical report and make
the conformance decision from the rendered picture and intent. It also reports
`layout_geometry.overlaps` for independent same-Canvas component placements that are simultaneous and
partially intersecting; nested placements owned by one component are excluded and remain subject to
component-local parent/Frame centring. Full containment is omitted and the entries are advisory
candidates, not automatic failures. Judge them against the user's brief and settled creative intent; do
not force centring or remove an intentional overlap. It cannot measure actual glyph or package-internal
bounds or infer intent, so those still require the reader.

Clearly platform/player/export-tool watermarks are not authored content and should be ignored. If a mark
could be intentional design, preserve the uncertainty and do not silently remove it.

`--question` is available and means what it means on the other route: which region to read, never what
to conclude.

## Recording the findings

```
hypit-reference-video-tools record_review --run projects/<name>/build.svrun \
  --review-id <id> --text-file <the findings>
```

Until that lands, the picture has been drawn and handed over with nobody having said what it shows,
and `authoring_check` lists it under `awaiting_answer` and credits the element nothing. Record every
finding, including the ones that read as satisfied, in the words the reader used.

## Measuring, on this route

A quantity is read rather than guessed at, and here the instrument is a second subagent: give it the
same picture and ask for one number against the frame's own width and height. It costs a subagent and
no money, which is why it is always cheaper than spending one of the two attempts.

## Closing the round

```
hypit-reference-video-tools authoring_check projects/<name>/build.svrun
```

It names each element nobody has looked at and the command that looks at it, and reports
`"passed": false` until none are left. Like its counterpart it asks for participation rather than
convergence: an element reviewed once and stopped at its ceiling passes, and an element nobody looked
at does not.

It also applies every check the Source alone decides — a stretch of the Script nothing draws a
full-frame picture over, a Frame reaching past the Canvas, and a timed picture whose `playback` is
left at its default and so draws its material once and then nothing for the rest of its window.
`../playbooks/craft/generated-dependencies.md` says what to set.

**Done when:** `"passed": true`. Then, and only then, the Build.
