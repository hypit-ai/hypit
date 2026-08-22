# Closing the loop on what was built

Structural checks prove that a source is legal. They prove nothing about whether it looks like the
reference. A newly written package can resolve, activate, decode and pass every check while drawing
something the reference never contained. Close that gap deliberately.

This loop is about how an element *looks* against the reference, and it is bounded. Whether an
element is *wired at all* is a different gate with a different rule: `preview-check` (in
`../preview.md`) must pass before this loop is even reached, and its failures are repaired
without any attempt ceiling. A graph that does not trace is not a difference to weigh; it is work
that is not done.

Note what that gate covers: `preview-check` proves the graph is wired, not that every track draws.
Nothing is handed to a Producer until the Build runs, so a Producer that refuses the media it
receives surfaces there rather than here.

The difference between the two gates is what each reports. `preview-check` names the graph failure —
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

## The loop unit is one element, across every shot that shows it

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
node --import tsx .agents/skills/hypit/scripts/render-element.mjs projects/<name>/build.svrun \
  --element <id> --segment <id>|--selection <id> --out <path>.mp4
```

It reads the Canvas, the Recipe values and the Script text out of the Source, stands in for the
speech with the Source's own `estimate:Speech`, mocks every layer a Build has not made, and drives
the package's Producer. Nothing is transcribed by hand, so nothing is transcribed one line at a time
— which is what made a caption system look correct while its lines collided.

The window is named in words. `--segment` and `--selection` take a Script name, never a timestamp,
and the way to find the right name for a given shot is:

1. take the shot's `start_seconds` and `end_seconds` from the reference's `state.json`;
2. read the words spoken over that stretch out of the reference's `transcript.json`, which carries
   one entry per word with its own timings;
3. find those words in the Script you wrote, and name the Selection or Segment that encloses them.

The reference clock is read exactly once, at step 1, and only to index a table. Everything after it
is words. The reconstruction's own frames come from estimated take lengths, so its clock and the
reference's do not correspond and matching them would put the window in the wrong place.

### Mock the layers a Build has not made

The element rarely draws the whole frame. Below it is a base take that does not exist yet, and inside
it may be media slots the Source declares as generations. Render them as mocks rather than leaving
them out: a missing base is not a neutral background, it is black, and text that is legible on black
can be illegible on the picture that will replace it.

`render-element.mjs` does this itself. It finds every generation the Source declares — the takes, the
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
costs one clause and saves the mock being reported as a difference every round.

A mock lives only in this render. It is never written into the Source, and no gate reads it: the
`playback` check in `reconstruction-check` reads the Source's Recipes, so a mock cannot be mistaken
for coverage.

### Compare the whole shot, against every shot that shows the element

Compare clips, not chosen frames:

```
hypit-reference-video-tools compare_reconstruction --reference-id <id> --shot-id <id> \
  --video <rendered>.mp4 --element <id>
```

An element that animates in, leaves, and is replaced by another within one static board does not
produce a cut, so a shot can hold several states and no single frame represents it. Choosing one is
the failure this replaces: a caption system compared against the shot with the shortest line looks
correct, because one line has nothing to collide with.

Compare it against **every shot the reference shows the element in**, not the clearest one. That is
the coverage round, and it comes before any repair — collect the whole difference set first, then
repair against it. Doing it the other way makes the comparison after a repair look like a third
attempt at a shot that was never examined.

`--image` against `NNN-representative.jpg` is available for one case only: the shot's own `visual:`
observation states in words that the element is completely still. The judgement comes from the
reference's observation, never from looking at your own render and concluding it does not move —
deciding that from the reconstruction is how the wrong frame got chosen in the first place. Where the
observation does not say still, compare the clip.

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
comparison arrives as two frame tiles: the reference shot's own tile, and one the command builds from
your render against that shot's duration, so both grids sample at the same rate and the same layout.
What is compared is the same stretch either way.

Give the pair to a subagent when you can: one handed two unlabelled pictures and the question knows
neither which is the reference nor what was built, which is the same blindness this section rests on.
The coverage round means one element produces several comparisons at once, so dispatch one subagent
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
- Results are not cached. Every iteration is a fresh comparison.

## Repair in dependency order

When the difference is structural rather than cosmetic, repair in the order given by
`../local-author-package.md`: package and workspace resolution, activation contribution, Manifest,
Producer, Type and Validator agreement, Surface vocabulary and decoding, implementation behaviour,
then source usage. Fixing source usage over a broken implementation hides the defect one layer down.

## Converged means the differences are wording, in every shot

Stop when the returned differences are wording-level — a describer's phrasing rather than a visible
change — across **all** the shots the element was compared in. One shot reading clean while another
still shows lines colliding is an element mid-repair, and the shot that reads clean is usually the
easiest one. Passing `pnpm check` and `hypit check` is not convergence; it is the precondition for
starting the loop.

## The loop is bounded, and stopping is the end

A comparison that keeps finding something is not always a repair waiting to happen. A typeface the
generator cannot reproduce, a texture it will not hold, a grain that is simply not available — those
return a difference every round for ever. So the loop ends on whichever of these comes first.

- **Every attempt aims at a difference the comparison named.** Changing something the comparison did
  not mention is not an attempt; it is thrashing, and it does not earn one of the attempts below.
- **A difference caused by an input that does not exist yet is not a repair target.** The mocks above
  stand in for a base take and for media slots a Build has not filled, and an observer that was told
  where they are should bypass them. One that reports a mock anyway is describing an absence, not a
  defect. Do not aim an attempt at it, and do not read its reappearance as the no-progress rule below
  firing: that rule is about the difference the repair was aimed at, not about every line the
  comparison returns.
- **No progress ends it immediately.** If the comparisons return the same difference they returned
  before the repair, stop. The repair is not reaching the problem, and two more rounds of the same
  reasoning will not find it. Judge this over the same set of shots before and after — a repair that
  clears three shots and leaves one is progress, and re-comparing a different shot than last round
  measures nothing. Rendering and comparing cost real time on every round.
- **There are two loops, each with its own two-attempt ceiling.** The first loop is over the
  *package*: render what it draws and compare it; a difference that the package cannot express is a
  package defect, and fixing it means changing the package's structure. The second loop is over the
  *values*: once the package can express everything the observation states, tune the Recipe, the
  font, the placement and the motion until it looks like the reference. The two never share attempts.

  **Write-and-remake the package: two attempts.** The first fixes what is obvious, the second fixes
  what the first revealed. If after two repairs the difference is still one the package cannot
  express — a typeface mix it has no port for, a motion it cannot draw — the package is wrong, not
  the values, and continuing to tune values is thrashing. Widen the package instead, which starts a
  fresh write-and-remake loop for the widened shape.

  **Fill the parameters: two attempts.** A difference the package *can* express — the wrong weight,
  the wrong size, the wrong colour, the wrong position — is a value, and tuning it is the second
  loop. Two attempts, then stop.

  Beyond each ceiling, guesses start to overshoot — correcting past the reference rather than
  towards it. Time beats fidelity here by explicit choice.

  **Each ceiling is two attempts for the element, spread over all its shots.** Comparing an element
  in five shots does not buy ten attempts; it buys a fuller picture of what one attempt has to fix.
  Coverage and attempts measure different things — how much was looked at, and how many times the
  element was changed — and one repair aimed at a difference several shots agree on is one attempt
  however many shots reported it.

## Measure what can be measured; iterate only on what cannot

Two attempts per loop is not enough to converge by guessing, and it is not meant to be. A difference
stated as a quantity — a stroke that is too thick, a shape that is too tall, type that is too large,
a margin that is too wide — is not a guessing problem. Ask for the number: a
`compare_reconstruction --question "how tall is the oval relative to the frame?"` returns a
measurement in one step, from whichever observer the reference holds. Ask it over whichever shot
renders the quantity most legibly — this is one reading of one number, not the coverage round, and
reading it off a shot where the thing is small buys a worse number for the same price.

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
- **the authored values on installed vocabulary** — a caption Style's size, colour and placement, a
  Media Item's frame, a Typography Track's copy, at Gate 3 against the real SemanticTrack;
- **whether the picture is continuous** — the frames nobody authored that `frame-coverage.md` is
  about, at Gate 4, which measures them on the delivery. One inherited edge is settled before then:
  `reconstruction-check` reads each Recipe's `playback` and refuses a timed picture configured to
  stop when its material runs out, which is the edge a generated take produces every time. The rest
  of them — a window that starts late, a blend whose frames are half-covered, a schedule inside a
  component that stops between activations — are measured on the delivery;
- **whether the delivery says the Script's words** — measured at Gate 4 by transcribing the finished
  video, since a take generated from a prompt that lost its dialogue passes every gate before it.

`reconstruction-check` is the mechanical half of this: it names the elements that were never compared
and the timed pictures configured to empty their windows, and refuses to pass while either remains.
It cannot name what a Build has not produced yet, which is why
this list is stated rather than computed.

If the author wants the result to differ from the reference — their presenter, their product, their
brand — read the sources you wrote and change them to what they asked for. `index.md` says why that
happens here rather than earlier.

If a project-local package was built along the way, decide whether it should outlive this video and
put that to the author: `../local-author-package.md` says how to judge it and what promoting it
actually costs.
