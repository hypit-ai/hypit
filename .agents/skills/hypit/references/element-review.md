# Looking at what was built, before a Build runs

This visual-review page is for the initial reconstruction/description routes. A post-completion
revision does not use it, does not call a VLM/observer, and stops after deterministic gates; see
`revision.md`.

Structural checks prove that a source is legal. They prove nothing about whether it looks like what
was wanted. A newly written package can resolve, activate, decode and pass every check while drawing
something nobody asked for. Close that gap deliberately.

Both routes close it here, and both close it the same way: render one element as the Source
configures it, have somebody who did not build it read the picture, repair what they named, and stop
at a fixed ceiling. What differs is only the question put to the reader. A reconstruction has a
reference, so it asks what differs — `reconstruction/comparison-round.md`. A program authored from
a description has none, so it asks whether the picture is what it was asked to be —
`original-authoring/conformance-round.md`. Read this file first and that one after.

Whether an element is *wired at all* is a different gate with a different rule: `preview.md`'s
`preview_check` must pass before this round is reached, and its failures are repaired without any
attempt ceiling. A graph that does not trace is not a difference to weigh; it is work that is not
done.

Note what that gate covers: it proves the graph is wired, not that every track draws. Nothing is
handed to a Producer until the Build runs, so a Producer that refuses the media it receives surfaces
there rather than here.

The difference between the two gates is what each reports. `preview_check` names the graph failure —
the target that does not trace, the chain that is missing — so its repairs are not guessing. This round
names what is visibly wrong with the picture, in words, and a repair aims at something the round
named. Neither gate expects you to guess; each one tells you what is wrong, and you repair that.

## The round is named by the check, not chosen by you

`authoring_check` and `reconstruction_check` read the Source and return a `plan`: every stretch worth
looking at, as an element and a half-open range of the Script's own words, with the reason it earned a
place. Render that list and read that list. Nothing here asks you to decide which stretches matter.

Three rules produce it, and all three are read off the Source. **A distinct declaration is a distinct
picture**, so an element is looked at once per way it is declared, at the stretch where that way first
appears — which is also the floor, since every placed element declares something. **Content that can
break the layout earns its own look**, which is why a caption Style is read over its longest Cue rather
than its shortest. **A window length earns one only when something scales with it** — an enter costs
its frames at one edge whatever the window is, but a typewriter, a loop or a `stretch` playback runs
for as long as the window does.

A range rather than a name, because the answer is not always a name: a Cue ends at a speaker change, so
it is a run of words the Script never marked. `--tokens from:to` is how every command takes one, and
`--segment`/`--selection` remain for the ranges that do have names.

The gate then holds the round to that list. An element looked at once used to pass; now every entry the
plan names has to have been answered.

### Render what the Source configures, not what the catalogue shows

The thing read is the element **as this video places it**: the Recipe values the Source actually
passes, the Script text the Source actually feeds it, and the windows the Source actually binds. A
package's catalogue preview is a different picture drawn from different values — the package's own
sample copy and sample Recipe, chosen to show a reader the Surface's range — and a Source can fill
every one of those parameters with values that collide while the preview stays perfect. Reading the
preview answers a question nobody asked. `preview.md` keeps the two apart, says which command draws
which, and holds `render_element`'s own flags.

`render_element` reads the Canvas, the Recipe values and the Script text out of the Source, mocks
every layer a Build has not made, and drives the package's Producer. Nothing is transcribed by hand,
so nothing is transcribed one line at a time — which is what made a caption system look correct while
its lines collided.

**It draws the whole stretch, not the element alone.** `--element` names which element the round is
about; the picture is everything the Source places over those words, so two elements over one Segment
produce the same picture. Scope it with `--question` — that is what tells the reader which part of it
to read.

The window is named in words. `--segment` and `--selection` take a Script name, never a timestamp:
name the Segment or the Selection the element is drawn over, and give the same name to the round, so
every picture covers the same words. `script-time.md` says why a name travels where a number cannot.

### Mock the layers a Build has not made

The element rarely draws the whole frame. Below it is a base take that does not exist yet, and inside
it may be media slots the Source declares as generations. Render them as mocks rather than leaving
them out: a missing base is not a neutral background, it is black, and text that is legible on black
can be illegible on the picture that will replace it.

`render_element` delegates this to `@hypit/preview-mock`. The realizer finds every relevant logical
output in the compiled Author/Run Graph — the takes, stills and slot contents — derives geometry from
Graph inputs, and materializes them through `@hypit/mock-media` in a temporary Run under
`.hypit/preview/<realization-digest>/`. Never `hypit image`, which pays for a generation
the video will not reuse, and never a placeholder drawn by a script written for the occasion.

Geometry follows the fixed Graph policy: Canvas width/height first, then generation aspect-ratio,
then Canvas fallback; resolution labels such as `720p` and `2K` are not converted to pixels, and
conflicting geometry fails.

Then tell the reader that those regions are preview mocks standing in for declared-but-unbuilt
generations, and to read only what the element itself draws. Said plainly it costs one clause and
saves the mock coming back as a finding in the one round there is.

### Geometry first: Canvas, outer frame, content

Every look starts with a geometry pass before style or polish. Identify the three nested levels:
Canvas, the outer Frame/background that owns the region, and the inner text or element that must fit
inside it. For each level, check the following explicitly:

- **Centre:** when the design calls for centring, compare the content centre with the outer-frame
  centre on both axes. Report the direction and approximate offset (for example, `12% too far
  right` or `8% too high`), not just “misaligned”.
- **Containment:** report whether every visible glyph/mark stays inside its intended outer Frame and
  whether the Frame itself stays inside the Canvas. Name the offending edge and the estimated amount
  outside. Distinguish intentional bleed, crop, or enter/exit motion from an accidental overflow.
- **Capacity:** verify that the outer Frame is actually wide and tall enough for the text/element,
  including padding, stroke, shadow, and the longest line. A centred item in an undersized box is still
  a failure even when its centre is correct.
- **Canvas safety:** check the final visible bounds against all four Canvas edges. Nothing should be
  clipped unless the reference/intent clearly calls for it.

`authoring_check` and `reconstruction_check` return a deterministic `layout_geometry` report with
Canvas/Frame bounds, sizes, centres, parent/Canvas centre offsets, containment overflow, and bound
element ids. Use those numbers as the mechanical findings and let the observer decide whether the
alignment or overflow matches the reference/intent. The report cannot measure renderer-shaped glyph
bounds or infer intent, so the visual pass must still confirm text and marks in the rendered image.

A mock lives only in this render. It is never written into the Source, and no gate reads it: the
`playback` check reads the Source's Recipes, so a mock cannot be mistaken for coverage.

### The derived Run carries the mocks, and nothing else changes

The mocks are substituted into a Run that names the project's own Source. The whole program is drawn
and the window is cut out of the frames afterwards, so every element the Source places is present and
drawn wherever the Source puts it — what is on screen over the words being looked at is what the
delivery will put there.

That derived Run is on disk under `<project>/.hypit/preview/<realization-digest>/preview.svrun`, beside
its materialized Artifact attachments. Open it
whenever something you expected to see is not in the picture: an element that is in the Source and
still not on screen is the package failing to draw it.

### A caption Style is read once, where it first appears

Captions are the one element where the stretches are not different questions. A caption system is one
Style applied to whatever words fall under it, so two stretches drawn in the same Style differ only in
which words they hold — the typeface, size, weight, box, padding and placement are the same
declaration in both, and reading the second one returns the answer the first already gave.

So read **one stretch per distinct Style**, at the first occurrence of that Style. A program with
one default Style and a `caption:Use` override for one Selection is two looks, wherever those
two first appear, not one per Segment. This is the same reading `script-time.md` applies to every
other system that spans cuts: the system is authored once, so it is read once.

What is not covered by that is anything a Style does not decide. A Cue that overflows the frame is a
Segment nobody broke with `||` rather than a Style at the wrong width — `playbooks/craft/captions.md`
says so — and it belongs to the stretch whose words are long, not to the Style.

### Render every stretch first, then send them all at once

No look's question depends on another's answer, so nothing is gained by waiting: rendering one and
reading it before rendering the next makes the round as long as the sum of its parts. Render the
whole set, then issue the round together.

**Send all of an element's pictures before repairing anything.** A repair changes what the next
picture would have shown, so a round interleaved with repairs is not one round — and what this round
is for is the set of findings across every stretch, which only exists once they have all come back.

## The reader is not the builder

This is the rule the whole round rests on, and it is not a preference. Somebody who knows what was
built, and what they hoped it would look like, confirms it. That is how a wrong typeface survives a
look: it resembles what the builder remembers choosing.

**Where the harness has subagents, one subagent per picture is required, and they run together.**
Claude Code and Codex have them. Give each its own, hand it the `instruction`, the `prompt` verbatim,
the `image_refs`, and — on a task that carries them — `transcript_ref` and `transcript_words`. Hand it
nothing else. Not what you built, not which component drew it, not what you expect it to find, not
another look's answer. Take the returned text and record it yourself, so one writer owns the log.

**Do not open the pictures yourself.** Whatever visual ability the model running this round has, using
it makes the reader and the builder the same reader, and the round stops being evidence of anything.
This is the same prohibition the `gemini` observer gets for free by sending its pictures to a separate
request; one subagent per task is what makes the other paths equal to it rather than merely faster.

Answering inline is the fallback for a harness with no subagents, and only that. Read them one after
another rather than merging them into a single look — what the round is for is the set of findings
across stretches, and one answered in the light of the previous answer stops being independent
evidence of anything. There the discipline has to be explicit, because the reader is the builder and
nothing structural prevents it:

- **Write down what you see before naming a cause.** List what is visibly there, in the words you
  would use if you had never seen the Source. Deciding what went wrong first, then looking, finds what
  you expected.
- **Something you did not write down is not an attempt.** The two-attempt ceilings below count repairs
  aimed at what the round named.
- **Measure rather than iterate.** A stroke that is too thick, a shape that is too tall, a margin that
  is too wide — read the number off the frame against the frame's own width and height, and change the
  value once.

## Repair in dependency order

When the finding is structural rather than cosmetic, repair in the order given by
`local-author-package.md`: package and workspace resolution, activation contribution, Manifest,
Producer, Type and Validator agreement, Surface vocabulary and decoding, implementation behaviour,
then source usage. Fixing source usage over a broken implementation hides the defect one layer down.

## One round

**There is one round.** What it returns is the whole set this program gets. Repair against that set
and stop; do not look again.

Two things follow, and they are the whole discipline:

- **Every repair aims at something the round named.** Changing something it did not mention is
  thrashing, and it does not earn one of the attempts below.
- **A finding caused by an input that does not exist yet is not a repair target.** The mocks above
  are preview-mock regions for a base take and media slots a Build has not filled, and a reader told where they
  are should bypass them. One that reports a mock anyway is describing an absence, not a defect.

Something nobody can close is not a failure to record as one. A typeface the generator cannot
reproduce, a texture it will not hold, a grain that is not available — write it into the report and
leave it.

### Two ceilings, and they never share attempts

The first is over the *package*: something the package cannot express is a package defect, and fixing
it means changing the package's structure. The second is over the *values*: once the package can
express everything, tune the Recipe, the font, the placement and the motion.

**Write-and-remake the package: two attempts.** The first fixes what is obvious, the second fixes what
the first revealed. If it is still something the package cannot express — a typeface mix it has no
port for, a motion it cannot draw — the package is wrong rather than the values, and tuning values
is thrashing. Widen the package instead, which starts a fresh write-and-remake for the widened shape.

**Fill the parameters: two attempts.** The wrong weight, the wrong size, the wrong colour, the wrong
position. Beyond the ceiling, guesses overshoot — correcting past the target rather than towards it.
Time beats fidelity here by explicit choice.

**Each ceiling is two attempts for the element, across all its stretches.** Looking at an element in
five stretches does not buy ten attempts; it buys a fuller picture of what one attempt has to fix. One
repair aimed at something several stretches agree on is one attempt however many reported it.

## Measure what can be measured; iterate only on what cannot

Two attempts per element is not enough to converge by guessing, and it is not meant to be. Something
stated as a quantity — a stroke that is too thick, a shape that is too tall, type that is too large,
a margin that is too wide — is not a guessing problem. Ask for the number, over whichever stretch
renders the quantity most legibly. This is one reading of one number, not the coverage round, and
reading it off one where the thing is small buys a worse number for the same price.

Do that instead of spending an attempt. An attempt is for what has no number — a typeface's
character, a texture, a rhythm — where the only route is change it and look again.

Measure against the frame, not against the screen it is viewed on. A quantity read off a rendered
still means what it means relative to that still's own width and height — a stroke that is "one
percent of the frame height", a shape "a third of the frame width" — which is the same basis the
Recipe's fractions use. Saying "a little too tall" and changing it on feel spends the attempt the
measurement exists to save.

Stopping is the end, and the end carries no final look. When the attempts are spent the work on that element stops as
it is: the second repair is the last thing the reader saw, and there is no third round to name what
remains. Do not spend one to find out — a look that changes nothing and exists only to report the gap
is a step for a report nobody asked for. The element is what it is; move on to the next one.

Hypit Studio is a browser preview for a person to look at. It is not a source of the picture this
round needs: that picture is the local render in `preview.md`, which draws one element as the Source
configures it, without a Provider.

Repairing one element never re-runs the others. Do not rebuild the whole video to inspect one piece,
and do not defer every look to a final delivery Build.

## Say what this round did not settle

Every element was looked at and every repair stopped. That is what "complete" means here, and it does
not mean the video was watched: this round runs before the Build, so the pictures it read were renders
with preview-mock media under them. Report the difference rather than letting the word carry it.

State plainly, in the completion report, that the following are unsettled:

- **every generated picture and take** — the images and the shots a Provider has still to make;
- **the timing of every Track** — this round reads each one against an estimate-timed SemanticTake, so how a
  Caption, Media or Typography Track sits against the speech that is finally delivered is settled once
  that speech exists;
- **whether the picture is continuous** — the frames nobody authored that
  `playbooks/craft/frame-coverage.md` is about. One inherited edge is settled here: the gate reads each
  Recipe's `playback` and refuses an insert configured to stop when its material runs out. The rest —
  a window that starts late, a blend whose frames are half-covered, a schedule inside a component that
  stops between activations — appear in the delivery;
- **whether the delivery says the Script's words** — a take generated from a prompt that lost its
  dialogue passes every check made here.
  `playbooks/craft/seedance-directing.md` says how to trace a take's prompt back to the Segment's
  `dialogue` while the Source is being written, which is where this one is prevented.

The gate is the mechanical half of this: it names the elements nobody looked at and the timed pictures
configured to empty their windows, and refuses to pass while either remains. It cannot name what a
Build has not produced yet, which is why this list is stated rather than computed.

If a project-local package was built along the way, decide whether it should outlive this video and
put that to the author: `package-promotion.md` says how to judge it and what promoting it actually
costs.
