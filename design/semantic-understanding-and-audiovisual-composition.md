# Semantic understanding and composition

Design record · 2026-09-08

This record captures the reasoning, decisions, first implementation and remaining work for a major
part of Hypit's coarse/fine refactor. It is written for maintainers and future collaborators who need
to understand the change before continuing it. The production instructions belong in the
[Hypit Skill](../skills/hypit/SKILL.md); exact tool behavior belongs in the
[Video CLI README](../packages/video-cli/README.md).

**Status:** the product principles below were established in the discussion with the project owner.
A first implementation is present in the working tree, based on `6b6da34d`, and has passed the checks
recorded below. The change has not been committed in this session. Tool correctness and rewritten
prose have been checked; the complete experience of a fresh Agent working under these instructions
still needs a realistic production trial and owner review. This record does not equate those forms
of validation.

## 1. What this refactor must accomplish

Hypit helps an Agent direct and produce a video. A reference supplies valuable creative evidence:
what holds attention, how a claim becomes convincing, how a performance and its surrounding graphics
work together, and which details make the result distinctive. The Agent must understand that work,
understand the user's new request, and make a thoughtful creative answer.

In practice, a request to clone frequently means an adaptation: use my face, use my product, change
the argument, use another language, or make a variant of something already produced. The real value
is carrying useful creative relationships into a new piece whose content is true to that request.
A user can also ask for a close reconstruction; the Brief determines how much should remain faithful.

This requires two forms of intelligence together:

- understand what the whole work is doing and why each choice contributes;
- inspect and implement the precise audiovisual behavior through which that meaning is expressed.

High-level understanding cannot excuse vague execution. Detailed inspection cannot replace
understanding. The point of the refactor is to make those responsibilities reinforce each other.

The change therefore reaches three connected areas: how the Agent investigates a reference, what
local tools make that investigation practical, and how the Agent develops the new composition until
it works. Removing an old service dependency alone would not resolve the production problem.

## 2. The product philosophy that governs the change

### The Agent is the director

The Agent owns interpretation, curiosity, creative judgment and implementation. It should notice
what matters, ask useful questions of the material, test a reading against the source, and make
choices appropriate to the user's goal. Tools make evidence accessible and execute decisions.

The creative sensibility should fit the work: internet wit, warmth, restraint, theatricality,
social fluency or absurd humor can all be appropriate. Groundedness, care, curiosity, imagination,
taste and honesty remain constant. This is a working disposition expressed through decisions,
not merely a friendlier tone wrapped around an unchanged tool pipeline.

Understanding calls for insight about the whole, care and honesty about the details, and curiosity
when a choice is unexplained. Looking at surrounding words, recurring visual systems and later
consequences can reveal a relationship that a closer crop alone would miss. Relevant Skill pages
help the Agent recognize and direct those relationships. Practical diligence means recording what
has been understood and what remains to investigate while the work is happening.

### Meaning should organize the video

Hypit's strong production prior is semantic authoring. Discover the words, actions and relationships
that organize the reference, then express the target's corresponding relationships in Script,
Selections and Moments. The accepted performance establishes their concrete target time.

A-roll is the performance that establishes the semantic timeline. Its picture can occupy the whole
frame, a corner, an inset, or a cutout above another image. B-roll can cover it while its speech
continues. Screen area and stack order do not decide the semantic role. Wordless passages can be
expressed through named empty Segments and their actions or durations.

### Compression means a better explanation

A useful reading accounts for many details through a coherent idea. A persistent comparison system,
its state changes, and the words that trigger them explain more than a collection of unrelated frame
descriptions. The account still needs the exact details that make the comparison readable.

Compression also guides prompts: a few strong cultural, attractiveness, performance, spatial and
material anchors can give an image or video model a clear task. Listing more incidental details does
not necessarily improve that direction. The existing image and video Craft owns those techniques.

### Production should be deliberate and inspectable

Use existing produced media when changing downstream composition. Keep Sources, Runs, component code
and Results legible. A Build is a persistent execution attempt; useful Outputs survive a failed
attempt and can be selected in a new Run. This refactor preserves that architecture.

The user's goal, private facts and spending choices belong to the user. The director should make
ordinary creative and technical decisions within that authority, record useful discoveries, and
continue the work. Account changes and additional paid generation remain explicit decisions.

Project files carry the work across conversations. Analysis preserves the whole-piece reading;
Timeline preserves the timed realization and its meaning; Brief and Treatment preserve the target;
Progress locates the current question and the work still ahead. These are living accounts updated
as discoveries occur. A continuing session reads them and reopens the relevant source material.

## 3. What prompted the change

The owner supplied two production-session exports:

- `hypit-session-slim.jsonl`: adapting a ranking reference with a banana-cat protagonist;
- `chat-export-new.jsonl`: adapting another reference into a banana-cat comparison of Hypit and
  competing products.

Both sessions also contain setup and service problems. Several of those had already been addressed.
They should not be reopened merely because they appear in the same logs. This refactor concerns the
remaining structure of understanding and composition review.

### What the first session shows

The first session used local frame extraction, grids and focused inspection without an executed
external visual-observation request. It formed useful conclusions about the source and made concrete
creative choices. The owner judged the production result particularly successful.

This is evidence that direct work with source frames and temporal tools is a viable production path.
The log itself does not provide an independent visual assessment of every finished frame: its image
payloads are not available in the text export. The owner's assessment and the tool-call evidence
should remain distinguishable.

### What the second session shows

The second session explicitly instructed the Agent to use the external observation route. That
instruction matters: the session cannot establish that Skill wording alone caused its behavior.

The execution trace contains eight reference-observation calls and four preview-observation calls.
A later final-observation command was rejected before execution and is not a completed review.
Several reports disagreed about source layout or timing. During preview work, a report also alleged
Caption/title overlap and misstated the closing mark's duration.

The Agent found a concrete implementation defect in the scrolling model picker: the scrolling list
needed its own clip below the heading. It changed the component accordingly. Subsequent reports
continued to allege overlap. After inspecting the element structure and extracting full-resolution
frames, the later report described a gap and no overlap.

The distinction is important. There was a useful correction. The repeated work after that correction
did not have the same evidential basis. Some of the iteration was spent resolving contradictory
accounts rather than improving the composition.

### What the owner reported beyond these two logs

The owner described recurring problems with inconsistent visual descriptions and with follow-up
questions that reinforced an earlier mistaken premise. They also described the historical pipeline
that partitioned a reference into visually detected shots and requested independent descriptions.

Those observations explain the design concern. The two exports do not establish a numerical error
rate or a universal ranking of visual models. The architectural decision does not require such a
claim: production judgment should remain grounded in accessible media and in the Agent's connected
understanding of the work.

## 4. Why the previous organization failed

The historical route gave too much authority to a chain resembling:

```text
visual changes → isolated shot descriptions → authored objects → repeated difference reports
```

That organization lost the stable subject of the task: the whole video's meaning, persistent
systems, and the user's new creative objective.

### Camera boundaries became the wrong unit of understanding

A graphic can span many camera shots. Independent descriptions can give that same graphic slightly
different wording, geometry or styling in each shot. If those descriptions directly organize
implementation, the Agent can create multiple components for one continuing system.

A rule to keep graphics continuous names a desired outcome but does not repair the representation
that caused the duplication. The underlying repair is to understand the graphic as one system with
a lifetime and changing state, using the whole reference as context. The timeline then records its
entries, updates, covers, exits and returns.

Sending the preceding shot to every isolated description can provide useful context in an individual
investigation. Making that a permanent automatic routing rule still leaves shot descriptions as the
organizing structure. It treats a missing whole-piece model as a context-window problem.

### Verbal reports displaced the actual work

When generated descriptions became the authoritative account, disagreement created more requests
for descriptions. A question built around an incorrect premise could reinforce that premise.
Fluent detail and repeated agreement did not establish that the alleged event existed.

The source should remain easy to reopen at the relevant time and scale. A disputed overlap calls for
a legible view of the overlap and its temporal context. A disputed transition calls for its actual
sequence. Resolving the claim should change the account or the work, rather than merely produce more
text about it.

### The Agent became an executor of someone else's interpretation

An Agent that does not develop its own connected account has little basis for deciding whether an
observation is plausible, which details matter, or how the piece should change for a new product.
It may implement an elaborate description while misunderstanding the advertisement, joke, proof,
comparison or narrative that gave those details a purpose.

The work can then be mechanically detailed and creatively weak at the same time.

### The review objective was too open-ended

A search for every difference from the reference can always find another difference. It does not
specify which difference weakens the new work. This becomes especially unhelpful after a swap changes
the words, timings, visual world, number of examples or layout.

A numerical cap on iterations would stop activity without establishing that the video works. The
needed change is a better purpose for each iteration and an intelligible completion condition.

### Generation and composition revision were blurred

If the same generic loop covers prompts, paid generations, Caption, MG and local rendering, repeated
generation can become the default response to dissatisfaction. That weakens the incentive to direct
the original request well and obscures which part of the work is actually failing.

Image and video Craft should carry the accumulated experience that makes a strong request. Local
composition review should develop the layout, readability and timing of produced assets, graphics
and words.
A genuinely failed generated asset can still justify a considered new request.

## 5. The replacement model

The organizing relationship is:

```text
User's goal and supplied material
             ↓
Whole-piece meaning ↔ exact source behavior
             ↓
Treatment for this person, product and message
             ↓
Target Script and semantic relationships
             ↓
Directed assets + authored components and composition
             ↓
Watch the result ↔ improve a concrete expressive relationship
             ↓
Deliver a coherent piece that fulfills the Brief
```

The arrows express dependencies of thought, not a mandatory sequence of commands. A discovered
detail can revise the Treatment; a rendered component can reveal that its semantic attachment is
wrong; an existing asset can make a different creative answer practical.

Production instructions should directly say what to do: “Watch the reference”, “Inspect the frames”,
or “Compare the entry with its word”. They should help the Agent enter the
work immediately. The Skill should not make discussion of model identity or sensory capability a
precondition for inspecting supplied material.

Time-located source media is the evidence. The transcript supplies word timing. Frames and grids make
visual changes inspectable. Clips preserve movement and sound in a focused span. The Agent connects
these into an interpretation and remains responsible for the new production.

## 6. Understand the whole and its concrete expression

Coarse and fine are complementary scales of understanding. The Skill now states the responsibilities
at both scales directly. The earlier two-loop framing could suggest a recurring procedure to run;
the intended behavior is thoughtful investigation whose discoveries improve the work.

At the coarse scale, understand the whole piece's purpose, audience relationship, hook, development,
payoff and intended response. Identify the roles of speech and pictures and the systems that persist,
recur, accumulate, compare, replace or return.

At the fine scale, inspect the designed behavior that makes those relationships real. For each
relevant system and event, the account should make the following intelligible in connected prose:

- what is actually present, including meaningful text, imagery, shape, color, type and hierarchy;
- where it sits and how it relates to the person, other graphics and the frame;
- how it enters, including the distinctive path, scale, opacity, pacing or settling;
- what happens while it is active: emphasis, animation, accumulation, comparison or replacement;
- how long it remains and what word, action, pause or other event its timing serves;
- how it exits or hands attention onward, including any overlap or continuation;
- why those choices serve the viewer's understanding, feeling or decision.

This is a description of the thinking required, not a form that every frame must fill. A stable
Caption style can be described once; its distinct emphasis behavior and changing Cue content still
need attention. A persistent board can be described as one system; each consequential update still
needs a time and a reason.

Naming an effect is not enough when its execution matters. “Fade out” may correctly identify the
behavior, but the account may also need to explain what fades together, how quickly, whether another
item enters underneath, and how the handoff relates to the argument. Conversely, several frames of
one fade should not become several unrelated objects in the implementation.

The whole-piece reading and close inspection inform each other. Follow the full reference from
opening to close, and examine the distinct visual systems through their entries, changes, holds and
exits. Close reading also discovers relationships that the broad impression missed. When a choice
is puzzling, explore its connections to the words, surrounding events and other parts of the piece.
The relevant Format or Craft can help sharpen that investigation.

Record both scales as they develop: the whole-piece explanation in Analysis and the timed behavior
and its meaning in Timeline. Keep passages and systems still to examine in Progress. The resulting
account should explain the full piece and make its distinct systems and changes locatable, with
enough substance to direct what the target should preserve or adapt. Further investigation follows
an unexplained relationship that could change that direction. Newly discovered material, tools or
understanding can improve an earlier judgment; update both the work and its owning notes.

## 7. A timecode-level semantic timeline

A transcript plus a sequence of frames is useful source material, but the semantic timeline is the
Agent's connected account of what those materials establish.

For spoken work, word-level transcription and alignment provide the normal temporal spine. They let
the Agent investigate whether a reveal lands on a name, an image illustrates a phrase, a sound marks
a verdict, or a picture continues under the next speaker. The transcript does not supply the visual
meaning of those events, and its text can be checked against the passage when something is unclear.

For wordless work, actions, visual changes, music, effects and silence supply the meaningful events.
The target can still use named Script Segments, including empty Segments.

Keep two complementary reference documents:

| Document | Responsibility |
| --- | --- |
| `ANALYSIS.md` | Whole-piece interpretation, persistent systems, story and persuasion, pacing, cross-time relationships, and why the work succeeds. |
| `TIMELINE.md` | Locatable audiovisual behavior, source times, word/action relationships, detailed lifecycle changes, and the material that can be reopened. |

Timeline sections should follow meaningful content phases and source time. Their boundaries do not
reset an ongoing system. They can overlap and contain finer notes where a passage is dense. Exact
text, important colors, geometry, movement and sound belong in the account when needed to understand
or implement the expression. Evidence references should make important facts easy to reopen without
turning every sentence into a citation exercise.

Three different time concepts must remain clear:

| Time | Purpose |
| --- | --- |
| Source-media time | Locate the observed evidence in the reference. |
| Target semantic relationship | Express what the target event responds to in its Script, Selection or Moment. |
| Actual target time | Locate that relationship after the selected performance establishes its frames. |

Within a local frame tool, requested seek time and decoded frame time also differ. If a request is
between two video frames, the extracted frame has its own timestamp. The current tool labels and
word context use that actual timestamp; JSON also retains the requested one.

These distinctions provide usable evidence and meaningful authoring. They do not introduce a new
central timeline database, reference-to-Source compiler, identity service or observation state store.

## 8. Clone, swap and variant are creative transformations

After understanding the reference, reconsider it for the user's request. “Use my product” can change
which benefits are true, what the demonstration must show, which comparisons are meaningful, what
the speaker says, and what the supporting graphics contain. A different argument may need a
different number of items, different space or a different payoff.

“Use my face” supplies an identity reference but still requires casting and image direction: the
camera relationship, attractiveness appropriate to that person, styling, setting and performance
must serve the intended piece. Existing image Craft remains applicable; the reference relationship
changes how identity is established. The Agent should look at the supplied material and think about
how to use it well.

Preserve useful roles and relationships deliberately. Recreate their form for the new content.
Where the reference's arrangement still serves the new goal, it is a strong prior. Where the goal
changes the arrangement, the Treatment should explain the new answer.

The target's Script and performance then determine semantic attachments. Copying the source's exact
seconds onto changed speech loses the very relationship the investigation was meant to discover.
Precise clock offsets still belong where they are an intentional part of the target's design.

## 9. Compose and refine

Composition arranges MG, Caption, B-roll, Typography and Effects so the new Film expresses
the Treatment clearly and compellingly. The Agent looks at what appears, where it sits and when it
changes: a comparison reads clearly, a Caption fits the speech, a B-roll window supports the
explanation, and a reveal lands on its word. Component behavior matters through that expression.

A hold may be too brief for a comparison to read, an exit may remove proof before the claim
completes, or a graphic may cover the person at the wrong moment. Revise to improve that concrete
relationship, using Studio or rendered frames to see the arrangement.

Use Studio, range rendering, full-resolution frames, dense grids and short clips at the scale of the
question. Then return to the whole Film: a local improvement can still harm the surrounding rhythm,
hierarchy or handoff.

Reuse the existing media through explicit Run Candidates. Correct Script when the semantic anchor
is wrong; correct Source or Recipe when the authored relationship is wrong; correct the project
component when its behavior cannot express the design; reconsider Treatment when the creative idea
itself needs to change. The user's Brief changes when the goal or constraints change.

If an adjustment does not improve the result, revisit the explanation before making another change.
A contradictory account of the media should be resolved by reopening the relevant evidence.

A finished composition carries the Brief and Treatment clearly and compellingly through its layout,
readability and timing. Continue when a change will improve that expression; deliver when it works.

Detail serves the idea. Timing and spacing deserve attention when they affect what the viewer
understands or feels. The source account supplies precise creative understanding; the target's
purpose determines the composition being developed.

Sound Craft directs the new piece's sounds through the role and character of an event. A reveal can
earn an accent, repeated states can share a motif, and music can carry a transition. These useful
creative choices belong in the existing Sound Craft and ordinary audio authoring.

## 10. Generation quality belongs primarily in direction

The project owner's image and video experience is a central production asset. Strong results should
come from applying that Craft before submitting generation: well-chosen visual authorities, shallow
and meaningful reference relationships, compressed prompts, strong casting, coherent color and
spatial choices, and simple, expressive performance direction.

For image direction, the established four-part structure and fixed capture language remain owned by
the image Craft and its Prompt Kit. For video direction, action and delivery should express the
intended vibe and the few movements that matter. This refactor does not replace those accumulated
methods with generic “generate, inspect, repeat” advice.

If a specific asset failure becomes apparent during production, improve the relevant direction
before deciding on another request. Prompt Craft is experience and judgment, not a guarantee that
every stochastic generation will succeed. The distinction is between
a deliberate correction and repeating a weak request in the hope of getting lucky.

Composition refinement primarily improves how produced assets and authored elements cooperate.
Paid regeneration remains a separate, visible production decision within the user's authority.

## 11. Tool design and the first implementation

The tool layer should make source evidence quick to locate, readable at the right scale and easy to
reopen. It should not decide the argument of the video or emit an authoritative interpretation.

### Local media inspection

The existing `media` family remains the foundation:

| Tool | What it supplies |
| --- | --- |
| `probe` | Duration, dimensions, frame rate and audio presence. |
| `cut` | A selected source passage saved as a clip. |
| `frames` | Individual decoded frames at requested moments or intervals. |
| `tile` | A single grid for a selected sequence. |
| `tiles` | Readable pages of grids, including several selected ranges. |
| `boundaries` | Mechanical visual-change candidates for navigation. |
| `fetch` | A local source file from a supported link. |

Visual-change detection remains useful. Its results are locations to investigate, not declarations
that a story phase ended or that a continuing component became a new object.

The first implementation adds shared range/interval sampling, transcript-aware frame labels, phrase
location and grid pagination. Current examples:

```bash
hypit media tile reference.mp4 --start 12 --end 14 --every 0.1 \
  --transcript reference.transcript.json --columns 4 --cell 480 --to detail.jpg

hypit media tiles reference.mp4 --around "the phrase" \
  --transcript reference.transcript.json --padding 0.3 --every 0.1 \
  --columns 3 --rows 2 --to phrase-frames
```

`--around` locates consecutive transcript words, ignoring case, whitespace and punctuation. It
provides word boundaries with surrounding time. Repeated matches expose their locations and use
`--occurrence` or a numeric range to select the intended instance. This is a navigation convenience,
not another semantic authoring language.

The labels show actual frame time, active words with their boundaries, and nearby word context.
They are placed below the source picture, preserving its Caption and graphics. Overlapping timed
words can appear together. A frame with no timed word is labeled accordingly; missing timing does
not become invented speech or a declaration of silence.

Sampling interval, cell size, columns and rows are presentation choices. Their defaults are
conveniences for obtaining a readable view. They are not thresholds proving that the reference has
been understood. The exact option definitions and JSON fields live in the Video CLI README.

### Separation from transcription and rendering

`transcribe` uses the selected alignment Endpoint and writes the existing seconds-based
`hypit.transcript@1` file. Local media inspection reads that file. It does not select an account,
call an alignment service, invoke a generation model or start a Build.

The transcript adapter is local to Video CLI. Frame extraction uses ffmpeg; text and grids use
Sharp/Pango. Actual frame timestamps come from the decoded frame rather than an assumed frame-rate
calculation. The implementation does not need the HyperFrames rendering Provider just to inspect a
source video.

A frame grid can support reference understanding and composition. For a reference it helps establish
source behavior. For a
rendered Result it helps judge target behavior. The meaning of the material comes from the current
production question.

### Removed implementation

The working tree removes the retired observation command, its dedicated model package, the Provider
that served only that model, and the corresponding capability in the shared HypiHub Provider. The
associated activation, configuration, exports, dependencies and tests were removed with them.

The shared Provider retains its other generation, transcription and matting capabilities. Build
status observation and other unrelated uses of the word “observe” remain ordinary system behavior.
There is no replacement observation service or automatic handoff to another account.

## 12. Documentation ownership

The refactor should leave a small number of coherent owners, with routes that lead to the question
being answered:

| Owner | Knowledge that belongs there |
| --- | --- |
| [Skill entry](../skills/hypit/SKILL.md) | Director disposition, semantic prior, thorough understanding, composition judgment, file memory and question-based routes. |
| [Reference understanding](../skills/hypit/references/creation/reference-video.md) | Investigation, time-located detail, whole-piece interpretation, Analysis and Timeline. |
| [Brief](../skills/hypit/references/creation/brief.md) and [Transformations](../skills/hypit/references/creation/transformations.md) | User truth, Treatment, swaps, variants and consequences for the new work. |
| [Script and time](../skills/hypit/references/creation/script-and-time.md) | Target words, semantic relationships, measured delivery and actual target time. |
| [Review](../skills/hypit/references/production/review.md) | Composition, evidence choice, correction ownership and completion. |
| [Studio](../skills/hypit/references/production/studio.md), [Rendering](../skills/hypit/references/production/rendering.md), [Runs](../skills/hypit/references/production/runs.md) | Actual tools for previewing, rendering intervals and reusing media. |
| [Runtime Profile](../skills/hypit/references/environment/profile.md) | Capabilities the production needs, selected Endpoints, credentials and environment setup. |
| [Playbooks](../skills/hypit/references/playbooks/index.md) | Format relationships and local Craft judgment. |
| [Video CLI README](../packages/video-cli/README.md) | Exact inspection/transcription commands, file formats and sampling behavior. |
| This design record | Why the change exists, decisions, implementation sequence and remaining validation. |

Shared Skill and Kit prose remains English; the Agent speaks the user's language. Production
instructions are written as useful actions and reasons. Historical explanations belong in this
record rather than being carried back into the Skill as residual prohibitions.

The implementation sequence below is a maintainer's plan. It is not a required route for every video.

### Audit production decisions, not topic presence

The follow-up documentation audit exposed a recurring weakness in the review method: finding a term,
a file or a valid example had been treated as sufficient coverage of a production decision. Cue-break
syntax does not by itself teach reading rhythm. A timing attribute does not explain whether its
consumer occupies an interval or changes persistent state. A renderable component does not by itself
offer a useful author interface or serve the surrounding composition.

The current owners now cover Cue grouping, Caption family/Recipe/parameters, Script's semantic prior,
selection/projection/consumption and package implementation. The remaining connection addressed here
is [component design](../skills/hypit/references/production/component-design.md): shaping an intended
visual relationship into semantic behavior, useful controls and a component that works in context.
It routes to the existing Craft and implementation owners. Prompt Kit guidance now also starts with
choosing an existing treatment, and the Seedance Kit README identifies every exported template's
reference relationship and Text inputs at their package owner.

Review a capability through the decision an author must make, its explanation, actual supported use
and a relevant example, following the entry and neighboring routes. Preserve one detailed owner and
repair its callers when a relationship changes. The Media/Speech audit's stale vocabulary and the
Script page's overgeneralization of `at` show why agreeing headings alone is insufficient. Actual
production remains the evidence of usability; this documentation audit does not complete the fresh
production trial recorded below.

## 13. Implementation sequence and current position

### A. Establish the actual failure before changing the instructions

Read the supplied sessions and the relevant historical/current instructions. Separate execution
problems, source-observation disagreements, real component defects, wasted comparison and the user's
quality assessment. Preserve the distinction between what the logs establish and what is inferred.

Current position: completed for the two supplied text exports and the reviewed historical route.
Their original source/final films were not independently rewatched as part of this audit.

### B. Establish the replacement responsibilities

Agree on the real user objective, semantic authoring prior, director responsibility, detailed
understanding duties, role of generation Craft, composition judgment and durable project memory.

Current position: these principles were established in discussion. This document consolidates them
for careful review; wording and examples remain open to improvement against those principles.

### C. Remove the dedicated observation dependency coherently

Trace actual imports, capabilities, activation, pricing/diagnosis branches, configuration, package
dependencies and documentation. Remove the dedicated route at its owners. Preserve unrelated
capabilities in shared Providers and unrelated Build-status inspection.

Current position: implemented in the working tree. Source/package/Skill/public-description searches
and type checking were used to check the removal. The independent HypiHub service repository was
not changed by this work.

### D. Make local temporal evidence practical

Extend the existing media tools with shared sampling, transcript labels, phrase location and
pagination. Keep decoding, text rendering, file interpretation and remote transcription at their
existing boundaries. Test the behavior that can mislead a production decision, especially word
boundaries, overlap, missing times and actual frame timestamps.

Current position: implemented and exercised with local synthetic media and an existing ranking
Result. The first visual inspection exposed a seek-time/frame-time mismatch, which was corrected.

### E. Rewrite the owning production guidance

Update the entry, reference understanding, Profile and Review together. Align the Script/time and
transformation pages with those responsibilities. Keep detailed APIs local to their package. Remove
obsolete capability descriptions from public pages without turning those pages into a refactor log.

Current position: a first pass is implemented. The main remaining question is whether another Agent
uses these pages well in a real task, rather than whether the prose sounds coherent to its authors.

### F. Validate the full understanding and composition experience

Use a real reference with a persistent system, a meaningful swap or variant, and existing produced
assets where possible. Have a fresh production attempt form Analysis, Timeline and Treatment,
inspect exact behavior, author semantic relationships, and refine an actual component in context.

Watch for connected understanding, useful detail, continuity of systems, sensible adaptation,
explicit media reuse, and a clear reason for each correction and for delivery. Inspect both the
result and the reasoning that produced it. A new confusing behavior should lead back to its cause
and owning guidance or tool.

Current position: pending. The tool demonstration below does not substitute for this trial. A trial
need not submit new paid generations when existing assets answer the question being validated.

### G. Review the change as a releasable whole

Review the final diff, document routes, installed-tool behavior and package removal. Resolve concrete
problems from the production trial. Commit a coherent change when requested, and publish only under
separate release authorization. Keep reusable design rationale here and precise facts with their
owners; remove temporary audit extracts when they have served their purpose.

Current position: not committed or published in this session. The code and document checks below have
passed; owner review and full production validation remain distinct work.

## 14. What has actually been verified

### Automated and build checks

At the end of the first implementation pass:

- the full test run reported 656 tests: 651 passed, 5 skipped, 0 failed;
- TypeScript checking passed;
- the public documentation build passed;
- after the final small media-tool adjustments, the focused media/transcript tests and TypeScript
  check passed again;
- diff whitespace checking passed.

The new behavior tests cover range sampling, phrase ambiguity and occurrence selection, multilingual
word matching, word boundaries and overlap, missing timing, grid pagination, preservation of source
picture space, and actual decoded-frame time. Existing Provider tests continue to cover retained
capabilities, including portrait matting and transcription.

These checks establish particular software behavior. They do not establish that a fresh Agent will
make good creative decisions or deliver a better film.

### Existing-media demonstration

The local demonstration used a previously built banana-cat ranking clip, with its existing semantic
word times converted to the transcript file shape. It did not obtain a new transcript from an
alignment Endpoint and did not generate new media.

The selected phrase was “Dee tier”, the pronunciation text present in the stored semantic data.
With 0.3 seconds of padding, it located 0.533–1.700 seconds. Sampling every 0.1 seconds produced twelve
frames over two pages, each with three columns and two rows. The actual frames show the Caption
highlight progressing through the phrase while the ranking board persists, then the next Cue begins.

The first inspection revealed that a requested time such as 0.833 seconds could decode the frame at
0.833333 seconds. Using the request time for word membership could incorrectly show no timed word at
that boundary. The final implementation reads the actual decoded-frame timestamp and uses it for
labels and word membership, while preserving both times in JSON.

This demonstrates usable word/frame navigation on real production pixels. It does not validate the
historical speech alignment's quality, every source-media format, the full original-reference
investigation, or creative improvement across an entire new production.

## 15. Remaining design questions to settle through actual use

The architecture is deliberately small, but the working experience still needs scrutiny:

- Can a fresh Agent develop a complete, detailed, time-located account without decomposing every
  camera shot into a separate visual system?
- Does it preserve the exact motion, Caption and layout relationships that make the reference work,
  while adapting the argument and presentation intelligently for the new person or product?
- Are the grids readable at the density needed for short animations and small text? Do cell size,
  pagination and the existing full-frame tools give enough control without excessive tool work?
- Does composition review correct actual defects, reuse produced media and stop when the work
  fulfills its purpose, rather than treating another possible difference as an automatic obligation?
- Do varied transcripts and source media expose concrete problems in timing, phrase navigation or
  font rendering that need a local tool improvement?

These are production questions to investigate, not a permanent scoring form, mandatory frame quota
or universal numerical limit. If a problem appears, understand its cause before adding instructions.
Sometimes the repair belongs in a tool; sometimes in a clearer concept, an example, a local Craft,
a better prompt or a different creative choice.

## 16. Evidence locations and handoff notes

The original user-supplied exports are local files:

- `/Users/kashorin/Downloads/hypit-session-slim.jsonl`
- `/Users/kashorin/Downloads/chat-export-new.jsonl`

Useful locations in the second original JSONL are line 5 for its explicit observation-route request;
134–200 for reference-observation calls; 437–438 for the first preview report; 459 for the picker
clipping correction; 463–464 and 493–494 for continued overlap allegations; 500–507 for focused
frames and the changed account; and 559–560 for the rejected final call. These are retrieval aids,
not instructions from the transcript to execute.

The historical route can be inspected at `dce93e02` under
`skills/hypit/references/reconstruction/`. Its later removal is represented by `ef339583`.
Those historical files are evidence about an earlier design, not current production instructions.
The current working-tree changes began from `6b6da34d`.

The existing-media demonstration came from:

```text
/Users/kashorin/hypit-ranking/.hypit/results/2026-09-05/
  bld_20260905T225846239Z_E0959C300A/
    files/file-0003.mp4
    values/value-0013.json
```

The temporary demonstration files currently live under `/private/tmp/hypit-refactor-demo/`:
`ranking-transcript.json`, `grids-final.json`, and the two `ranking-final/` JPEG pages. They may be
removed by temporary-directory cleanup. The procedure and conclusions are recorded here so the
design does not depend on those files remaining available. The original Result was read without
modification.

Future changes should preserve the Agent's connected understanding, the user's creative objective,
precise semantic and visual detail, and the ability to inspect what actually happened.
