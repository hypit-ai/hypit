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

## A split picture's parts all start from the same image

This is about a generation that carries no speech — an insert, a cutaway, a stretch of B-roll. A take
that speaks its Segment is one generation by construction, and the Segment is cut to fit it.

A continuous picture that exceeds the generator's duration ceiling is split into as many takes as it
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

## A Segment is a generation boundary

A Segment is what one `whisperx:SemanticTake` aligns one Take to, so each one is a separate
generation and a separate seam. Cut the Script the way the program is *spoken*, not the way its shots are numbered: splitting a
stretch that is delivered unbroken invents a seam nobody asked for, and inviting a generator to
re-establish the room across that seam is how continuity is lost for nothing.

Consecutive Segments carrying one unbroken voiceover are one Segment with Selections inside it. The
pictures over that stretch are placed by those Selections — `frame-coverage.md` governs what that
costs and what has to cover the silence between them — and the speech stays one Take, up to the
length one generation produces. Past that it is two Segments; the rule below says so and
`../../reconstruction/final-sources.md` says where the seam goes.

Name Segments for what they hold. Names are handles: the Script's meaning lives in the words, and no
part of the pipeline reads a Segment name back for anything a reader would see.

## A voice is generated once, and the take that draws a Segment is the take that speaks it

- One accepted voice sample per person, from `mimo:VoiceDesign`. That is what the voice generator is
  for: a sample, once.
- **The sample is a reference on every take, and the take generates the speech.** Write
  `generate-audio="true"` and hand it the sample as `<seedance:Reference audio={…}/>`. The
  `whisperx:SemanticTake` for that Segment aligns that take's own media, and the full-frame picture
  over that Segment comes from the same generation.
- Do not select a voice separately per take. Two selections of "the same warm mid-range voice" are two
  voices, and a viewer hears it immediately.

One generation carries both, and that is what makes the Segment's length and its picture's length the
same number. Generating the speech separately makes them two numbers arrived at independently — the
Segment as long as whatever a voice generator produced, the picture as long as whatever a video
generator was asked for — and two numbers arrived at independently do not agree. Where they disagree,
the picture ends first and nothing is under it.

### A Segment fits one generation

`whisperx:SemanticTake` selects "the single authored Segment performed by this Take", so a Segment has
one Take and a Take has one Segment. The speech coming from that Take means the Segment can be no
longer than one generation. Read the selected model's declared duration range from the model.

Cut the Script so every Segment's speech fits. A passage longer than that is two Segments, and
`../../reconstruction/final-sources.md` decides where the seam falls — on a sentence, not mid-clause.

This is why the split above is about pictures rather than speech.

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
`inspect_svml_vocabulary` reads them — `../../vocabulary.md` names the command. Recognising them is
the first half; the second is that every
slot the reference actually shows content in is **filled**. A slot the observation says holds a
picture is given a generated picture; one that holds video is given a take. A slot left empty where
the reference showed something is a card with a hole in it — the same failure as a missing inner
picture, at one level up: the frame was recognised but the content was not generated.

This is why a full-screen board that contains two media boxes is read as *two* media boxes, not as a
single flat composition. The component owns its surface; the boxes are inputs, and each one is
filled by generation when the reference shows content in it.

## A semantic window covers words, so the silence around it belongs to nobody

This is the commonest inherited edge in a speech-led program; `frame-coverage.md` holds the general
form and the measurements. `during={story.selection.X}` spans that Selection's first word to its last,
so the pause between two Selections, the breath before a Segment's first word, and the words that fall
between two occurrences are in none of them.

Decide, for each thing you place, which of three kinds it is:

- **Continuously present** — a sheet the reference holds up, a panel that stays behind a whole
  passage, a badge that stays. Take its window from a Segment, or from the first occurrence's start to the last one's end.
  Never from a Selection whose occurrences have gaps, however well the occurrences line up with the
  words: they do not touch.
- **Handing over to the next one** — one insert replaced by another with nothing meant to show
  between them. Close the first on the second's first word, or open the second on the first's last:
  the Script's markers carry which side of a word a boundary lands on.

  | Marker | Where the boundary lands |
  |---|---|
  | `@id` | Open, right-absorbing — at the next word's start |
  | `~@id` | Open, left-absorbing — at the previous word's end |
  | `@/id` | Close, left-absorbing — at the previous word's end |
  | `@/id~` | Close, right-absorbing — at the next word's start |

  A plain `@a … @/a @b … @/b` closes on one word's end and opens on another word's start, and the
  pause between those two words is in neither Selection. Written `@/a~` or `~@b` the two windows meet,
  and what is under them stays under them. `docs/quickstart/script.md` is authoritative for the
  markers.
- **Genuinely coming and going** — an insert that appears for one phrase and leaves. A plain Selection
  is exactly right, and the gap is the point.

The same question decides a component you write yourself. A Program scheduled from occurrences draws
only inside them unless you give it a span of its own, so a page built from one occurrence per row
vanishes on the words between two rows. `@hypit/local-notebook-ranking` does that deliberately and
says so in its own appearance text; a sheet the reference never takes down must not inherit it. When
a component both persists and changes, its schedule carries two different things — one span for how
long it is on screen, one window per item for when that item arrives — and conflating them is what
produces the blink.

## An insert runs out where its material ends, and the base shows through

An insert is a second generation over a Segment the speaking take already fills, so its length and
its window are two numbers arrived at separately. Where the material is the shorter of the two, the
`playback` key on its appearance Recipe decides what the rest of the window shows. The default is
`once-start`: the material draws once and then nothing is drawn, so those frames fall through to
whatever is beneath. `hold-start` pins the last frame for the rest of the window, `loop-start`
repeats, `stretch` retimes to fit.

What appears is the base — the insert leaves early and the shot beneath returns mid-phrase. Read it
as an insert with the wrong length rather than as an edit, and give the Recipe a `playback` that says
what should happen there. `reconstruction_check` reads the Recipe before a Build and refuses the
default on generated material.

Read the selected model's duration ceiling too, from the model: a longer insert is more than one Item
rather than one Item asked for a length the model refuses.

The other way an insert leaves a stretch it should have held is the boundary above: a plain Selection
close lands on a word's end, so the pause before the next one belongs to neither. That one is fixed
in the Script rather than the Recipe.

A layer beneath makes a blend visible, so check the Items' entry and exit while you are here: `enter` and `exit`
default to `none`, and a Recipe named for a cut that fades for a frame is one of the inherited edges
`frame-coverage.md` describes.

`production-gates.md` measures the delivery for these before it is reported as finished.

## A short stretch is not a short take

An authored take stays inside the selected model's declared duration range — read the range from the
model, since it differs between them and a literal in a document goes stale.

This too is about a generation that carries no speech. A Segment always has its own speaking take,
however short its words are.

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
