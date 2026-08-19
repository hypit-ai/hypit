# What one generation owes another

Two generated things that must match are wired to each other. One is generated, accepted, and becomes
an input to the next. Describing both in prose is a wish — two prompts saying "the same warm studio"
produce two different studios. An edge is a constraint.

Everything below is an instance of that one sentence. Where the rule says "for example `gpt:Image`",
that is the ordinary choice, not a survey to run: pick it and move on.

Never stop to ask the author which generator to use. Picking between two things that both work is
your job, and asking costs them an interruption to answer a question the rules already answer. Ask
only about the video: what it should say, who is in it, what it is for.

## The location is generated once

- Before any take in a location, generate and accept one image establishing it. Use the background
  alone, or the background with the person in it when every take there shows them.
- Generate every other view of that location **from that image**, as a reference. Do not describe the
  room a second time in words; a second description is a second room.
- Every take references the image for its own view.
- A reverse angle is another view, derived the same way. It shows a different wall — which is what
  `visual-continuity.md` requires — while staying the same place, which prose alone cannot deliver.
- Naming the camera positions before generating anything, as `visual-continuity.md` already says,
  is what tells you how many images you need.

Images therefore generate in rounds: the establishing image is accepted first, and the views derived
from it are generated after. `production-gates.md` Gate 1 is one stage per round, not one stage.

## A split shot hands over its last frame

A continuous shot that exceeds the generator's duration ceiling is split. The second part opens on
the **last frame of the first part**, extracted from the accepted take and passed as its first frame.

Every piece of this already exists: a video generation shape that takes a first and last frame, and a
frame extraction that takes `at="last"`. Only the connection is missing, which is why a split shot
drifts across its own seam today.

Do not do this across a real cut. A cut is a discontinuity; wiring one would force a match the
reference never had.

## A voice is generated once

- One accepted voice sample per person, however it was chosen.
- That one sample feeds both the speech generated for every line they say and the voice reference of
  every take they appear in.
- Do not select a voice separately per take. Two selections of "the same warm mid-range voice" are two
  voices, and a viewer hears it immediately.

## A take starts from an accepted image

Never generate video from a prompt alone. Without a first frame nothing fixes identity, framing,
lighting or wardrobe, so the take can be reviewed against nothing and the next take can match
nothing. Use the shape that takes a first frame, or the shape that takes ordered references.

## A short stretch is not a short take

An authored take stays inside the selected model's declared duration range — read the range from the
model, since it differs between them and a literal in a document goes stale.

An observed stretch shorter than that floor is never authored as its own take. Decide by what the
observation says about the picture:

- **It moves** — fold the consecutive short shots into one take at or above the floor, carrying the
  ordered references for each beat, and choose an edit language that cuts internally rather than
  generating each beat separately.
- **It is still** — a screenshot, a card, a poster, a held photograph — author stills placed on a
  Media Track and cut at the observed boundaries. More faithful than asking a video model to hold
  something still, fully controlled, and far cheaper.

Never pad a take to reach the floor. If the beat is two seconds long, it is two seconds of a longer
take or it is a still; it is not a four-second generation trimmed by two.
