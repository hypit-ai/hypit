# Reviewing the production

Read this when opening Studio, judging an encoded Result, comparing a reconstruction with its
reference, or deciding where a visible problem should be repaired.

[Studio](studio.md) explains launch, session reuse, displayed information, Source writeback and
project Companions. [Builds and Results](builds.md) explains retrieval and explicit Output reuse.

## Review the work the Run actually selects

Open Studio with the ordinary Run intended for the work. That Run binds the Author Source, Targets,
files, earlier Results, and stand-in Candidates, so Studio and a Build see the same authored graph.
A separate review Run is useful when its Candidate selection is intentionally different.

Studio renders the selected display closure with deterministic Producers and the exact capabilities
that the Runtime Provider declares safe for transient authoring. It submits no Build and no paid
generation. When that closure still needs external generation, use an existing file or Build
Output, or explicitly select a stand-in when only shape and time are under review.

A stand-in can establish layout, duration, cuts, and downstream wiring. Its visible marking reminds
the reviewer that it cannot establish subject identity, performance, shot composition, texture,
continuity, or the interaction between the selected production media and graphics.

## Separate legality from judgment

`hypit check` can establish that the Source and graph are legal. Studio can establish what the
configured composition displays. A completed Build can establish what the selected Endpoints actually
produced. Creative review asks a different question: does this visible and audible work perform the
Treatment and the useful relationships learned from the reference?

Look at the complete Film at its intended delivery size as well as the components inside it. A component that looks
attractive in isolation may still cover a face, compete with a Hook, arrive on the wrong word, or
break the piece's rhythm.

## Choose evidence that exists

The useful frame or interval is not known merely because a component has been authored. It becomes
known from something visible or time-locatable: an authored Segment or clock relation, the Studio
playhead, an encoded Result, or timing produced elsewhere in the graph. Until then, its exact
location remains an open question.

Use whichever view can answer the current question:

- An Agent with browser interaction can open Studio, seek and play the ordinary Run, look at the
  current frame, and discover where a layout or motion deserves closer inspection. This is usually
  the cheapest way to work on Caption, MG, Effects, and composition, with stand-ins when external
  media does not yet exist.
- Once a numeric interval is known, a range render can inspect the corresponding frames of the same
  HyperFrames program. The range may come from the playhead, authored clock time, or an existing
  Result; HyperFrames does not need to know whether language helped the Agent locate it.
  [Rendering](rendering.md#choose-a-render-interval-in-frames) gives the frame-bound syntax and the
  relationship to upstream Candidate reuse.
- On an encoded Result, focused media operations such as frames, cut, and tile can expose exact
  pixels, adjacent frames, or a short passage.
- Watch the whole deliverable when the question concerns Hook clarity, story movement, pace, payoff,
  CTA, performance, continuity, or whether A-roll, B-roll, Caption, MG, Effects, and Audio cooperate.

Choose and combine these views according to the current question. A component name alone does not
prove that a particular state is stable or that a change occurs at a guessed time; Studio or actual
media supplies that evidence.

Inspect the visible and audible relationships that could change the work:

- **picture and performance** — identity, camera relationship, action, eye line, continuity, useful
  detail, and whether the shot serves its passage;
- **semantic timing** — cuts, Caption Cues, MG states, Effects, and sounds occur on the intended word,
  phrase, pause, or clock event;
- **Caption** — every meaningfully different speaker, position, color, emphasis, Cue shape, and motion
  configuration remains readable, belongs to the speech, and preserves the intended face and action;
- **Typography and UI** — independent writing has the correct hierarchy, content, persistence, and
  relationship to the picture;
- **audio** — speech is intelligible, speaker and voice are right, music and effects support the beat,
  and transitions sound continuous;
- **composition** — each element has enough room and the full frame preserves the intended visual
  hierarchy.

For geometry, read three nested relationships: Canvas, outer Frame or background, and inner content.
Check containment and capacity at each boundary, then judge optical alignment. Intentional crop,
bleed, overlap, and asymmetric balance are part of the design when they help the work; measurements
describe what happened and the picture decides whether it succeeds.

Repeated appearances of one observed visual configuration can share a judgment. A visibly changed
speaker, placement, Style, content shape, behavior, or surrounding composition supplies different
evidence.

## Compare a reconstruction by function

Use the reference Analysis and Timeline as a question map. Compare the spans that reveal an important
relationship: an accumulation on a board, a switch from A-roll to B-roll, a Caption system changing
speaker, an MG reveal, or a payoff returning to the Hook. A short clip or dense adjacent frames can
establish motion and order; a full-resolution frame can establish text and geometry.

The target may intentionally change person, product, brand, language, or visual world. Compare
whether the transformed element performs the same useful role, not whether its pixels match. When the
target's Treatment deliberately changes the role too, the Treatment is the authority.

For a supplied person or product, compare the new appearances with those actual references as well
as the intended camera image. Judge recognizable identity, appeal, and how naturally the new subject
inhabits the piece; check that dialogue, demonstrations, and graphic details make sense for this target.

Fresh visual attention is useful when familiarity hides an obvious problem. Another observer can be
asked a neutral, bounded question about the actual media, while the commissioned Agent remains
responsible for combining that evidence with the Brief, Treatment, and graph.

## Repair the owning fact

| What the review reveals | Where the correction belongs |
| --- | --- |
| The intended story, shot logic, or visual system is wrong | `TREATMENT.md` |
| Words, speakers, Cue breaks, Selections, or Moments are wrong | the Author Source's Script |
| Composition, authored parameters, or semantic/clock relation is wrong | Author Source or Recipe |
| The wrong file, earlier Output, or stand-in is selected | Run Source |
| A reusable visual role cannot express or render its intended design | the project Author Package |

Use the smallest correction that changes the failed fact and preserve existing work around it. Review
again when that correction produces new visible or audible evidence. A request for different paid
media is a new production decision whose additional calls must be visible in `hypit plan`; it is not
an automatic consequence of routine review. Build completion is operational success; the production
closes when the Agent has watched the actual deliverable and can explain why it satisfies the Brief
and Treatment.
