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

## A split shot's parts all start from the same image

A continuous shot that exceeds the generator's duration ceiling is split into as many takes as it
needs. **Every part references the same first-frame image** — the one accepted for that shot — and no
part references another part.

This is the one place where the "wire what must match" principle does *not* mean chaining. Chaining
each part to the one before it makes them strictly sequential — part two cannot start until part one
has finished generating and its frame has been extracted — so a shot split four ways costs four
generations end to end. Pointing every part at the same accepted image lets all four generate at
once, and they still hold the same person, framing, wardrobe and light, because they came from the
same picture.

The parts do not continue each other frame for frame at the seams. **That is fine and needs no
handling.** Do not try to close it, do not raise it in a comparison, and do not spend an attempt on
it: it is a small jump in pose, the seam a viewer reads as an ordinary cut. Split the shot, generate
the parts, move on.

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

Generate it on the smallest tier — `model="mini"` for a Seedance take — unless the author named a
model or the delivery genuinely needs a resolution only the top tier offers. Takes are regenerated
more often than they are kept, so the tier multiplies the whole bill rather than one request.
`seedance-directing.md` holds the model contracts.

## A component's media slots are filled, never left empty

A component that shows media — a card, a board, a frame, an insert — declares its media inputs as
separate attributes (`image`, `video`, `media`, `surface`), each with its own `accepts` type, and
`inspect_svml_vocabulary` reads them. Recognising them is the first half; the second is that every
slot the reference actually shows content in is **filled**. A slot the observation says holds a
picture is given a generated picture; one that holds video is given a take. A slot left empty where
the reference showed something is a card with a hole in it — the same failure as a missing inner
picture, at one level up: the frame was recognised but the content was not generated.

This is why a full-screen board that contains two media boxes is read as *two* media boxes, not as a
single flat composition. The component owns its surface; the boxes are inputs, and each one is
filled by generation when the reference shows content in it.

## A short stretch is not a short take

An authored take stays inside the selected model's declared duration range — read the range from the
model, since it differs between them and a literal in a document goes stale.

An observed stretch shorter than that floor is never authored as its own take. Decide by what the
observation says about the picture:

- **It moves** — fold the consecutive short shots into one take at or above the floor and let the
  take cut internally, rather than generating each beat separately. How many references that take
  gets is decided by what the beats *show*:
  - **The same material** — one place, one person, one object, seen from a couple of angles or at a
    couple of moments — takes **one** image. The beats are a performance, so they belong in the
    prompt: say what happens and where it cuts. Handing the model four pictures of one scene is how
    a continuous space turns into four subtly different rooms, and it costs four generations to make
    it worse.
  - **Different material** — a different place, a different object, a different subject in each beat
    — takes one accepted image per distinct thing, in the order they appear. There is nothing for a
    single picture to establish here; the cuts are the point.

  The question is not how many beats there are but how many *things* they show.
- **It is still** — a screenshot, a card, a poster, a held photograph — author stills placed on a
  Media Track and cut at the observed boundaries. More faithful than asking a video model to hold
  something still, fully controlled, and far cheaper.

Never pad a take to reach the floor. If the beat is two seconds long, it is two seconds of a longer
take or it is a still; it is not a four-second generation trimmed by two.
