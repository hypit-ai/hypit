# Comparing what was built against the reference

**Read `../element-review.md` first.** It owns the round this file sits inside: one element at a time,
render what the Source configures, mock what a Build has not made, one round, two attempt ceilings,
measure rather than guess, and the rule that the reader is not the builder. Everything below is what a
reference adds to that.

What it adds is a second picture. The round asks what differs between the reference and the render
rather than whether the render is what it was asked to be, and `compare_reconstruction` is how that
question is put.

## The reference side is finished

The reference video does not change, and its observations are cached. Re-observing at a fixed
temperature of `1.0` buys paraphrase drift and another bill, so never re-run a completed observation
to "check" it. `--reobserve` exists for a shot whose media was rebuilt, not for doubt.

Cached does not mean correct. The authority on the reference side is the picture, not the prose
written about it. `evidence.md` says when an observation is worth doubting and how to settle it: a
narrow `observe_reference --question` over the shot, put to the reference's own observer. That is
cheaper than re-observing the whole shot, and on the `gemini` observer it is how the picture gets
looked at, since opening it yourself is what the blindness rule below forbids.

Everything else happens on the reconstruction side, which changes every time a package, Recipe or
source edge is edited.

## The render runs on the reference's clock

`render_element` takes `--reference-id`, and it times the stand-in from that reference's own
transcript, so each Segment runs for as long as the reference spends on its words. Pass it every time:
the comparison cuts both sides to the same words and refuses a pair whose two halves are different
lengths, and only this clock puts the render on the reference's. It is also what lets anything whose
appearance is a function of elapsed time — a progressive reveal, a typewriter, staggered rows — be
compared at the speed it will be seen at.

A `--batch <renders.json>` round inherits the reference along with the Run.

The window is still named in words on both sides. A word range and a shot are different divisions of
the same video — one Segment routinely runs across five shots — and what a render and the reference
have in common is the words, which is why the name travels between them rather than a number.

One geometry has to agree before any of it means anything. The reference's own pixel dimensions are
stored under `video` in its `state.json`, and they size nothing here — but their **aspect** has to
match the Canvas's. When it does not, every comparison puts two differently-shaped pictures side by
side and the observer reports proportion differences that belong to the Canvas rather than to the
element. Fix the Canvas before comparing.

## Compare the whole stretch, against every stretch the element is drawn over

Compare clips, not chosen frames:

```
hypit-reference-video-tools compare_reconstruction --reference-id <id> \
  --run projects/<name>/build.svrun --segment <id>|--selection <id> \
  --video <rendered>.mp4 --element <id>
```

The word range is the one the render was drawn over, and the reference is cut from its own analysis
video at the seconds it speaks those words, so the two sides hold the same words for the same length
of time. Each end moves onto a shot boundary when one lies inside its own end word, and the rendered
clip is trimmed by the same seconds, so the pair opens and closes where the picture changes while
still covering exactly the words asked for. An end with no boundary inside its word leaves the pair
part-way through a shot, and the prompt then says how many seconds of it to read as an incomplete
shot and to report no differences from. `--shot-id <id>` compares one cut of the picture as the whole
shot it already is, and refuses a render whose length is not that shot's.

An element that animates in, leaves, and is replaced by another within one static board does not
produce a cut, so a stretch can hold several states and no single frame represents it. Choosing one is
the failure this replaces: a caption system compared against the stretch with the shortest line looks
correct, because one line has nothing to collide with.

Compare it against **every stretch the element is drawn over**, not the clearest one. There is one
round and it comes before any repair, so a stretch left out of it is a stretch nothing will ever say
anything about. A caption Style is the one exception, and `../element-review.md` states it: one
stretch per distinct Style, at its first occurrence.

Where the reference shows a caption behaving differently somewhere, that is a stretch worth its own
comparison; where it shows the same design drawn over different words, it is not.

On the `gemini` observer the whole round is one call. Write the comparisons to a JSON file — the same
objects the flags produce, minus `reference_id` — and hand the file over:

```json
[
  {"run": "projects/<name>/build.svrun", "segment": "pro",
   "video_path": "projects/<name>/renders/board-pro.mp4", "element": "board"},
  {"run": "projects/<name>/build.svrun", "selection": "wait",
   "video_path": "projects/<name>/renders/marks-wait.mp4", "element": "marks"},
  {"run": "projects/<name>/build.svrun", "tokens": [48, 52],
   "video_path": "projects/<name>/renders/captions-48-52.mp4", "element": "captions"}
]
```

`reconstruction_check`'s `plan` names its windows as `tokens`, so that is the form most of a round
arrives in. It is two whole numbers, `[from, to)`, not the `"48:52"` the flag takes — a string is
refused rather than read as its first two characters. Each entry carries its own `run`; only
`--reference-id` is inherited from the flag.

```
hypit-reference-video-tools compare_reconstruction --reference-id <id> --batch comparisons.json
```

It paces the requests itself, keeps each comparison's derived cuts apart, and returns them under
`comparisons`. One that fails arrives under `failures` beside the input that produced it and takes
only itself down. Do not write a shell script to fan these out: the pacing, the per-comparison result
and the isolation are what the batch is for, and a hand-rolled loop has none of them.

`--image` is available for one case only: the reference's own `visual:` observation states in words
that the element is completely still. The judgement comes from the reference's observation, never
from looking at your own render and concluding it does not move — deciding that from the
reconstruction is how the wrong frame got chosen in the first place. Where the observation does not
say still, compare the clip.

Pass `--element <id>` every time so the gate credits the comparison to that element.

## One observer reads the reference, and it is the one the reference was prepared with

`compare_reconstruction` is how the reference frame is looked at, and `observers.md` says who looks.
The reference has one observer for its whole life, and the comparison goes through the same one that
wrote its observations.

**On the `gemini` observer, that observer is not you.** The command sends the reference clip and the
rendered clip as an unlabelled pair and returns the differences in words. Do not open the reference
yourself and look at it, whatever visual ability the model running this round has, and do not look at
the rendered reconstruction either. A second observer is a second opinion paid for with the very bias
it claims to correct: it sees the reconstruction, knows what was built, and confirms what it expects.
This is why a font that is wrong is caught — the comparison names it, and the package is repaired,
rather than a font being chosen because it resembles what you remember.

**On the `agent` observer the command returns two pictures and the question instead of an answer.**
That observer reads pictures rather than video, so a clip comparison arrives as two frame tiles, both
built against the compared stretch's own duration, so the two grids sample at the same rate and the
same layout. What is compared is the same stretch either way, and `../element-review.md` says who
reads them: one subagent per comparison, dispatched together, and never you.

## Comparison is blind

- Never tell the observer which picture is the reconstruction, what was built, which component drew
  it, or what you expect to be wrong. An observer told what to confirm will confirm it.
- `--question` carries what to look at, never what to conclude. Three things qualify: which region to
  read, which regions to skip because they hold a placeholder standing in for a declared-but-unbuilt
  generation, and one visible quantity to measure. None of them says which picture is the
  reconstruction, what was built, or what you expect to be wrong — and a question that hints at the
  answer, rather than naming what to look at, has stopped being scope.

The pair is always sent in one order: **one is the reference, two is the render.** The observer is not
told that and must not be; you need it, because a difference reported "in one" is a difference in the
reference and one "in two" is something to repair.

## Measuring, on this route

`../element-review.md` says to ask for a number rather than spend an attempt. Here that question is
`compare_reconstruction --question "how tall is the oval relative to the frame?"`, which returns a
measurement in one step, from whichever observer the reference holds.

## The reference has nothing further to say after the round

It already showed every stretch, and a second look re-reads the same frames to check your own work.
That spends the expensive half of the route — the renders and the observer — on verifying a repair
rather than on learning anything about the reference.

So **a repair is not verified here**, and the honest place to say so is the report. Passing
`pnpm check` and `hypit check` is the precondition for the round, not a result of it. The one thing
that is not bounded by the round is settling disagreeing evidence: a narrow
`observe_reference --question` does that at any point, which is what `evidence.md` is for.

`../element-review.md` lists what a pre-Build round leaves unsettled, and that list is what the
completion report carries.

If the author wants the result to differ from the reference — their presenter, their product, their
brand — read the sources you wrote and change them to what they asked for. `route.md` says why that
happens here rather than earlier.
