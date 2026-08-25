# Closing the loop on what was built

Structural checks prove that a source is legal. They prove nothing about whether it looks like the
reference. A newly written package can resolve, activate, decode and pass every check while drawing
something the reference never contained. Close that gap deliberately.

This loop is about how an element *looks* against the reference, and it is bounded. Whether an
element is *wired at all* is a different gate with a different rule: `preview_check` (in
`../preview.md`) must pass before this loop is even reached, and its failures are repaired
without any attempt ceiling. A graph that does not trace is not a difference to weigh; it is work
that is not done.

Note what that gate covers: `preview_check` proves the graph is wired, not that every track draws.
Nothing is handed to a Producer until the Build runs, so a Producer that refuses the media it
receives surfaces there rather than here.

The difference between the two gates is what each reports. `preview_check` names the graph failure —
the target that does not trace, the chain that is missing — so its repairs are not guessing. This
loop names the appearance difference: `compare_reconstruction` sends the rendered element and the
matching stretch of the reference to an observer and returns what differs in words, and a repair aims
at a difference the comparison named. Neither gate expects the agent to guess; each one tells you what
is wrong, and you repair that.

## The reference side is finished

The reference video does not change, and its observations are cached. Re-observing at a fixed
temperature of `1.0` buys paraphrase drift and another bill, so never re-run a completed observation
to "check" it. `--reobserve` exists for a shot whose media was rebuilt, not for doubt.

Cached does not mean correct. The authority on the reference side is the picture, not the prose
written about it. `workflow.md` says when an observation is worth doubting and how to settle it: a
narrow `observe_reference --question` over the shot, put to the reference's own observer. That is
cheaper than re-observing the whole shot, and on the `gemini` observer it is how the picture gets
looked at, since opening it yourself is what the blindness rule below forbids.

Everything in this file happens on the reconstruction side, which changes every time a package,
Recipe or source edge is edited.

## The loop unit is one element, across every stretch it is drawn over

Loop over one reconstructed element at a time — the new component, one caption system, one inserted
card.

### Render what the Source configures, not what the catalogue shows

The thing compared is the element **as this video places it**: the Recipe values the Source actually
passes, the Script text the Source actually feeds it, and the windows the Source actually binds. A
package's catalogue preview is a different picture drawn from different values — the package's own
sample copy and sample Recipe, chosen to show a reader the Surface's range — and a Source can fill
every one of those parameters with values that collide while the preview stays perfect. Comparing the
preview answers a question nobody asked. `../preview.md` keeps the two apart and says which command
draws which.

One command produces it, and it is not written per package:

```
hypit-reference-video-tools render_element projects/<name>/build.svrun \
  --element <id> --segment <id>|--selection <id> --reference-id <id> --out <path>.mp4
```

A whole round is one call: `--batch <renders.json>`, an array of `{element, segment|selection, out}`
inheriting the Run and the reference. They run together.

`--element` takes the element's bare id — `captions`, the `id=` the Source wrote on the element. The
command appends the output suffix itself when it looks for the track, so `--element captions.track`
matches nothing: it refuses with `the Source places no element named captions.track` and lists the
bare ids that are placed.

It reads the Canvas, the Recipe values and the Script text out of the Source, mocks every layer a
Build has not made, and drives the package's Producer. Nothing is transcribed by hand, so nothing is
transcribed one line at a time — which is what made a caption system look correct while its lines
collided.

**It draws the whole stretch, not the element alone.** `--element` names which element the comparison
is about; the picture is everything the Source places over those words, so two elements over one
Segment produce the same picture. Scope the comparison with `--question` — that is what tells the
observer which part of it to read.

`--reference-id` names the reference, and it times the stand-in from that reference's own transcript,
so each Segment runs for as long as the reference spends on its words. Pass it every time: the
comparison cuts both sides to the same words and refuses a pair whose two halves are different
lengths, and only this clock puts the render on the reference's. It is also what lets anything whose
appearance is a function of elapsed time — a progressive reveal, a typewriter, staggered rows — be
compared at the speed it will be seen at.

The window is named in words. `--segment` and `--selection` take a Script name, never a timestamp:
name the Segment or the Selection the element is drawn over, and give the same name to the
comparison, so both sides cover the same words. A word range and a shot are different divisions of
the same video — one Segment routinely runs across five shots — and what a render and the reference
have in common is the words, which is why the name travels between them rather than a number.

### Mock the layers a Build has not made

The element rarely draws the whole frame. Below it is a base take that does not exist yet, and inside
it may be media slots the Source declares as generations. Render them as mocks rather than leaving
them out: a missing base is not a neutral background, it is black, and text that is legible on black
can be illegible on the picture that will replace it.

`render_element` does this itself. It finds every generation the Source declares — the takes, the
stills, the slot contents — calls `make-placeholder` for each at the Canvas's own size, and declares
them in a derived Run under the project's `.hypit/`. Never `hypit image`, which pays for a generation
the video will not reuse, and never a placeholder drawn by a script written for the occasion.

The sizes come from the Source's `space:Canvas`, not from the reference video, because the mock is
composed inside the render and the render's geometry is the Canvas. The reference's own pixel
dimensions are a different and usually smaller number, stored under `video` in its `state.json`. They
do not size anything here, but their **aspect** has to match the Canvas's: when it does not, every
comparison puts two differently-shaped pictures side by side and the observer reports proportion
differences that belong to the Canvas rather than to the element. Fix the Canvas before comparing.

Then tell the observer, through `--question`, that those regions are placeholders standing in for
declared-but-unbuilt generations, and to compare only what the element itself draws. Said plainly it
costs one clause and saves the mock coming back as a difference in the one round there is.

A mock lives only in this render. It is never written into the Source, and no gate reads it: the
`playback` check in `reconstruction_check` reads the Source's Recipes, so a mock cannot be mistaken
for coverage.

### The derived Run holds one Segment, not the whole Source

The mocks are substituted into a Source that has already been cut to the window. `render_element`
keeps the Segment the window names, drops the rest of the Script, and then drops every element that
named a Segment, Selection or Moment that went with it — and every element naming one of those, to a
fixed point, plus any container the cut left with no children. So an element bound to a Selection in
another Segment is not in this render, and its absence says nothing about the Source.

One name survives the cut rather than taking its element with it: a Moment in `until=` that is marked
*after* the kept Segment. An element given the span it occupies and a Moment to close it is on screen
for the whole of a stretch that ends before that word, so the cut removes the close and keeps the
element. That is what makes an element bounded by a late Moment renderable over the earlier Segments
it is drawn over, which is every stretch this loop asks for it in.

The cut Source is on disk at `<project>/.hypit/compare/sliced.svml`, byte-for-byte from the original
except for what was removed, and the derived Run sits beside it. Open it whenever something you
expected to see is not in the picture: an element that is not in the fragment was cut by the window,
and one that is in the fragment and still not on screen is the package failing to draw it. Those two
repair in opposite directions, and the fragment is what tells them apart.
`packages/reference-video-tools/src/slice.ts` records the same thing as `SliceResult.dropped` — each
dropped id and the name it could no longer reach — and explains what decides survival.

### Compare the whole stretch, against every stretch the element is drawn over

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
shot it already is.

An element that animates in, leaves, and is replaced by another within one static board does not
produce a cut, so a stretch can hold several states and no single frame represents it. Choosing one is
the failure this replaces: a caption system compared against the stretch with the shortest line looks
correct, because one line has nothing to collide with.

Compare it against **every stretch the element is drawn over**, not the clearest one. There is one
round and it comes before any repair, so a stretch left out of it is a stretch nothing will ever say
anything about.

### A caption Style is compared once, where it first appears

Captions are the one element where the stretches are not different questions. A caption system is one
Style applied to whatever words fall under it, so two stretches drawn in the same Style differ only in
which words they hold — the typeface, size, weight, box, padding and placement are the same
declaration in both, and reading the second one returns the answer the first already gave.

So compare **one stretch per distinct Style**, at the first occurrence of that Style. A program with
one default Style and a `caption:Use` override for one Selection is two comparisons, wherever those
two first appear, not one per Segment. This is the same reading `continuity.md` applies to every other
system that spans cuts: the system is authored once, so it is read once.

What is not covered by that is anything a Style does not decide. A Cue that overflows the frame is a
Segment nobody broke with `||` rather than a Style at the wrong width — `../playbooks/craft/captions.md`
says so — and it belongs to the stretch whose words are long, not to the Style. Where the reference
shows a caption behaving differently somewhere, that is a stretch worth its own comparison; where it
shows the same design drawn over different words, it is not.

**Render every stretch first, then send them all at once.** No comparison's question depends on
another's answer, so nothing is gained by waiting: rendering one and comparing it before rendering the
next makes the round as long as the sum of its parts. Render the whole set, then issue the
comparisons together — concurrent requests on the `gemini` observer, one subagent each on the `agent`
observer, and one after another only where the harness has no subagents.

On the `gemini` observer the whole round is one call. Write the comparisons to a JSON file — the same
objects the flags produce, minus `reference_id` — and hand the file over:

```json
[
  {"run": "projects/<name>/build.svrun", "segment": "pro",
   "video_path": "projects/<name>/renders/board-pro.mp4", "element": "board"},
  {"run": "projects/<name>/build.svrun", "selection": "wait",
   "video_path": "projects/<name>/renders/marks-wait.mp4", "element": "marks"}
]
```

```
hypit-reference-video-tools compare_reconstruction --reference-id <id> --batch comparisons.json
```

It paces the requests itself, keeps each comparison's derived cuts apart, and returns them under
`comparisons`. One that fails arrives under `failures` beside the input that produced it and takes
only itself down. Do not write a shell script to fan these out: the pacing, the per-comparison result
and the isolation are what the batch is for, and a hand-rolled loop has none of them.

This is the round. Everything the reference has to say about this reconstruction comes back from it,
and the ceilings below count repairs made against what it returned.

`--image` is available for one case only: the reference's own `visual:` observation states in words
that the element is completely still. The judgement comes from the reference's observation, never
from looking at your own render and concluding it does not move — deciding that from the
reconstruction is how the wrong frame got chosen in the first place. Where the observation does not
say still, compare the clip.

Pass `--element <id>` every time so the gate credits the comparison to that element.

### One observer reads the reference, and it is the one the reference was prepared with

`compare_reconstruction` is how the reference frame is looked at, and `observers.md` says who looks.
The reference has one observer for its whole life, and the comparison goes through the same one that
wrote its observations.

**On the `gemini` observer, that observer is not you.** The command sends the reference clip and the
rendered clip as an unlabelled pair and returns the differences in words. Do not open the reference
yourself and look at it, whatever visual ability the model running this loop has, and do not look at
the rendered reconstruction either. A second observer is a second opinion paid for with the very bias
it claims to correct: it sees the reconstruction, knows what was built, and confirms what it expects.
This is why a font that is wrong is caught — the comparison names it, and the package is repaired,
rather than a font being chosen because it resembles what you remember.

**On the `agent` observer the command returns two pictures and the question instead of an answer, and
who looks at them is up to the harness.** That observer reads pictures rather than video, so a clip
comparison arrives as two frame tiles, both built against the compared stretch's own duration, so the
two grids sample at the same rate and the same layout.
What is compared is the same stretch either way.

Give the pair to a subagent when you can: one handed two unlabelled pictures and the question knows
neither which is the reference nor what was built, which is the same blindness this section rests on.
The round means one element produces several comparisons at once, so dispatch one subagent
per comparison and let them run together. Where the harness has no subagents, run them one after
another rather than merging them into a single look, and answer them yourself under the discipline
`observers.md` states in place of blindness — write the differences down before naming a cause, count
only repairs aimed at a difference you wrote down, and read a quantity off the picture rather than
spending an attempt guessing at it.

Hypit Studio is a browser preview for a person to look at. It is not a source of the picture this
loop needs: that picture is the local render in `../preview.md`, which draws one element as the
Source configures it, without a Provider.

Repairing one element never re-runs the others. Do not rebuild the whole video to inspect one piece,
and do not defer every comparison to a final delivery Build.

## Comparison is blind

- Never tell the observer which picture is the reconstruction, what was built, which component drew
  it, or what you expect to be wrong. An observer told what to confirm will confirm it.
- `--question` carries what to look at, never what to conclude. Three things qualify: which region to
  read, which regions to skip because they hold a placeholder standing in for a declared-but-unbuilt
  generation, and one visible quantity to measure. None of them says which picture is the
  reconstruction, what was built, or what you expect to be wrong — and a question that hints at the
  answer, rather than naming what to look at, has stopped being scope.

## Repair in dependency order

When the difference is structural rather than cosmetic, repair in the order given by
`../local-author-package.md`: package and workspace resolution, activation contribution, Manifest,
Producer, Type and Validator agreement, Surface vocabulary and decoding, implementation behaviour,
then source usage. Fixing source usage over a broken implementation hides the defect one layer down.

## One comparison round

**There is one comparison round.** What it returns is the whole difference set this reconstruction
gets. Repair against that set and stop; do not compare again. This bounds the comparing, and nothing
else: a narrow `observe_reference --question` settles disagreeing evidence at any point, which is
what `workflow.md` is for.

The reference has nothing further to say after it: it already showed every stretch, and a second look
re-reads the same frames to check your own work. That spends the expensive half of the route — the
renders and the observer — on verifying a repair rather than on learning anything about the
reference.

So **a repair is not verified here**, and the honest place to say so is the report:
`../playbooks/craft/production-gates.md` Gate 4 measures the delivery, and the section at the end of
this file says what this route left unchecked. Passing `pnpm check` and `hypit check` is the
precondition for the round, not a result of it.

Two things follow, and they are the whole discipline:

- **Every repair aims at a difference the comparison named.** Changing something it did not mention
  is thrashing, and it does not earn one of the attempts below.
- **A difference caused by an input that does not exist yet is not a repair target.** The mocks above
  stand in for a base take and for media slots a Build has not filled, and an observer told where they
  are should bypass them. One that reports a mock anyway is describing an absence, not a defect.

A difference nobody can close is not a failure to record as one. A typeface the generator cannot
reproduce, a texture it will not hold, a grain that is not available — write it into the report and
leave it.

### Two ceilings, and they never share attempts

The first is over the *package*: a difference the package cannot express is a package defect, and
fixing it means changing the package's structure. The second is over the *values*: once the package
can express everything the observation states, tune the Recipe, the font, the placement and the
motion.

**Write-and-remake the package: two attempts.** The first fixes what is obvious, the second fixes what
the first revealed. If the difference is still one the package cannot express — a typeface mix it has
no port for, a motion it cannot draw — the package is wrong rather than the values, and tuning values
is thrashing. Widen the package instead, which starts a fresh write-and-remake for the widened shape.

**Fill the parameters: two attempts.** The wrong weight, the wrong size, the wrong colour, the wrong
position. Beyond the ceiling, guesses overshoot — correcting past the reference rather than towards
it. Time beats fidelity here by explicit choice.

**Each ceiling is two attempts for the element, across all its stretches.** Comparing an element in
five stretches does not buy ten attempts; it buys a fuller picture of what one attempt has to fix. One
repair aimed at a difference several stretches agree on is one attempt however many reported it.

## Measure what can be measured; iterate only on what cannot

Two attempts per loop is not enough to converge by guessing, and it is not meant to be. A difference
stated as a quantity — a stroke that is too thick, a shape that is too tall, type that is too large,
a margin that is too wide — is not a guessing problem. Ask for the number: a
`compare_reconstruction --question "how tall is the oval relative to the frame?"` returns a
measurement in one step, from whichever observer the reference holds. Ask it over whichever stretch
renders the quantity most legibly — this is one reading of one number, not the coverage round, and
reading it off one where the thing is small buys a worse number for the same price.

Do that instead of spending an attempt. An attempt is for differences that have no number — a
typeface's character, a texture, a rhythm — where the only route is change it and look again.

Measure against the frame, not against the screen it is viewed on. A quantity read off a rendered
still means what it means relative to that still's own width and height — a stroke that is "one
percent of the frame height", a shape "a third of the frame width" — which is the same basis the
Recipe's fractions use. Saying "a little too tall" and changing it on feel spends the attempt the
measurement exists to save.

Stopping is the end, and the end carries no final comparison. When the attempts are spent the loop
stops as it is: the second repair is the last thing the observer saw, and there is no third
comparison to name what remains. Do not spend one to find out — a comparison that changes nothing
and exists only to report the gap is a paid step for a report nobody asked for. The element is what
it is; move on to the next one.

When there is no next element the reconstruction is complete, and three things follow it.

## Say what this route did not verify

"Complete" here means every element was compared and every loop stopped. It does not mean the video
was watched, because on this route no video exists: the Build has not run. Report the difference
rather than letting the word carry it.

State plainly, in the completion report, that the following are unverified and name the gate each one
waits for in `../playbooks/craft/production-gates.md`:

- **every generated picture and take** — the images and the shots a Provider has still to make, at
  Gate 1 and Gate 2;
- **the timing of every Track** — this route compares each one against a stand-in SemanticTake, so
  how a Caption, Media or Typography Track sits against the speech that is finally delivered is
  measured at Gate 3, against the real SemanticTrack;
- **whether the picture is continuous** — the frames nobody authored that `frame-coverage.md` is
  about, at Gate 4, which measures them on the delivery. One inherited edge is settled before then:
  `reconstruction_check` reads each Recipe's `playback` and refuses an insert configured to stop
  when its material runs out. The rest
  of them — a window that starts late, a blend whose frames are half-covered, a schedule inside a
  component that stops between activations — are measured on the delivery;
- **whether the delivery says the Script's words** — measured at Gate 4 by transcribing the finished
  video, since a take generated from a prompt that lost its dialogue passes every gate before it.

`reconstruction_check` is the mechanical half of this: it names the elements that were never compared
and the timed pictures configured to empty their windows, and refuses to pass while either remains.
It cannot name what a Build has not produced yet, which is why
this list is stated rather than computed.

If the author wants the result to differ from the reference — their presenter, their product, their
brand — read the sources you wrote and change them to what they asked for. `index.md` says why that
happens here rather than earlier.

If a project-local package was built along the way, decide whether it should outlive this video and
put that to the author: `../local-author-package.md` says how to judge it and what promoting it
actually costs.
