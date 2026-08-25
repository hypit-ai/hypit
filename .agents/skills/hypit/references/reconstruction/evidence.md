# Reference evidence

What the reference commands produce, what they refuse, and how to read what comes back.
`route.md` says at which step each one runs.

`@hypit/reference-video-tools` ships seven CLI subcommands. Four carry the reference evidence:

```bash
hypit-reference-video-tools prepare_reference --video-path <path> --observer gemini|agent
hypit-reference-video-tools observe_reference --reference-id <reference-id>
hypit-reference-video-tools record_observation --reference-id <reference-id> --key <key> --text-file <path>
hypit-reference-video-tools compare_reconstruction --reference-id <reference-id> --shot-id <shot-id> --video <path>|--image <path> [--question <scope>] [--element <id>]
```

`record_observation` is how the `agent` observer returns an answer; on the `gemini` observer the tool
writes its own and the command is unused. A long answer arrives whole with `--text-file <path>`;
`--text <text>` suits a short one. `make-placeholder` writes the mocks a comparison render needs;
`reconstruction-loop.md` says when. `list_svml_packages` and `inspect_svml_vocabulary` read installed
vocabulary and have nothing to do with a reference video — `../vocabulary.md` documents them.

A reference is found from the Distribution rather than from where you are standing, so these commands
may be run from anywhere. What does depend on where you are is which packages resolve: name the
project with `--package-root` when the command is not run from inside it. `paths` reports both roots
and every prepared reference, which is what to run when a command reports something it cannot see.

Defaults are sufficient for normal use. Each also accepts `--input <json>`.

## prepare_reference

It deterministically prepares clips, representative frames, tail frames, audio tails, storyboard
context and a word-level transcript, then obtains four whole-reference observations.
`people_and_product` and `voices` cover who recurs. `persistent_systems` covers the on-screen text
and graphic systems that continue or recur across the whole video, each one's lifetime, and whether
its appearance ever changes. `places` covers how many locations the video was shot in, which camera
positions appear in each, which parts of the video use each one, and each position described in
enough detail to draw from the words alone — which is what reconstructing a location depends on,
since reference frames are never fed to generation.

`transcript` is the verbatim speech of the whole reference with a start and an end for every single
word, measured locally by WhisperX. It is not an observation: no model wrote it, nothing about it
reaches an observer, and it does not go in the observation cache. It is identical on both observers,
and on the `agent` observer it is the only exact record of the sound. Read it whenever a decision
depends on when a word is said — placing an on-screen text reveal against the line that triggers it,
timing a caption, checking that a voice observation matches what was spoken, or judging a Segment's
natural boundary. It does not set a take's duration: the take is generated and its length comes from
`estimate:Speech`, as `final-sources.md` requires. Do not run WhisperX by hand and do not ask a model
to transcribe.

`transcript` reports `status`, `transcript_ref` and `word_count`. Read the words from
`transcript_ref`, a JSON file of passages, each with its own `words` array of
`{ text, start_seconds, end_seconds, score }`. A machine with no WhisperX service running reports
`status: "unavailable"` with a `reason` and prepares everything else; run `hypit runtime up` for the
project's selected Profile and prepare again. `../host-setup.md` covers diagnosing that service when
starting it is not enough.

When a completed preparation stage must be rerun, use one small `--redo` value:

```bash
hypit-reference-video-tools prepare_reference --video-path <path> --redo people
```

`--redo media` rebuilds shot media and clears every derived observation. `--redo transcript`
re-extracts the speech audio and measures the words again. `--redo people`, `--redo voices`,
`--redo systems` and `--redo places` rerun one whole-reference stage. `--redo all` reruns everything,
and is what changes a prepared reference's observer.

## observe_reference

Omit shot IDs to process all unfinished work; supply `--shot-id` one or more times to work on
selected shots. Each shot produces three observations:

- `visual` — the base picture, covering and non-covering content, continuity from the preceding shot,
  whether the frame is a depicted scene or a flat designed field, and each framed element's inner
  picture described separately from its frame;
- `text_appearance` — the typeface character, weight, size, spacing, alignment, colour, stroke,
  shadow, glow, per-word emphasis, position and entry of text drawn over the picture;
- `audio` — who is speaking, and what continues from the previous shot.

The picture observation also says whether the picture moves and how, separating camera movement from
movement inside the frame. A held still and a moving shot are reconstructed differently.

Covering content is whatever changes what reaches the eye, including things that sit on top with an
edge and things that do not. A wash laid over the whole frame to darken it is covering content and
gets reported as such; so is anything else the observation describes in terms of the picture being
altered rather than something being added. Read it for what it says rather than matching it against
the kinds of element you already expect — the observation is the evidence, and the moment a category
is treated as a list of known items it stops being able to report the one thing nobody thought to
list.

Each cut produces one `continuity` observation answering both questions under their own headings —
whether the two shots are one continuous camera shot, and whether an overlay continues across the
boundary — and a window of three consecutive shots gets a three-shot continuity review when a
boundary observation reports continuity or uncertainty, or when `--reobserve` was passed. The
preceding tail frame, audio tail and full-reference evidence are attached automatically; do not
reconstruct that context by hand.

A shot is never shorter than a second. Fragments below that are not shots, and clips that short are
rejected by the model, so the detector merges them into the shot before them.

Completed observations are reused. Naming a shot does not re-run it. `--reobserve` re-runs a
completed observation without rebuilding its media, and it exists for rebuilt media rather than for
doubt. `--redo media` clears every observation as a side effect of rebuilding the shots, so the next
`observe_reference` runs all of them again.

`unresolved` lists the keys of observations that failed outright. It is not a judgement about
evidence quality: a complete observation that says "unclear" is still complete, and that is what a
narrow question is for. On the `agent` observer the same field means a question still outstanding.

## A complete observation can still be wrong

An observation is prose written once, at a fixed temperature, by a model that saw the shot and
nothing else. It comes back complete and confident whether or not it is right. On a twenty-shot
reference, four shots came back wrong: two described a picture belonging to a different shot, and two
reported letters being *deleted* from the screen where the text was only typing in.

The frames are on disk at `.hypit/reference-video-tools/<reference-id>/shots/NNN-representative.jpg`,
and the shot clips beside them. When evidence disagrees — one shot against the next, a shot against a
whole-reference pass, or an observation against what the video plainly is — settle it with a narrow
question over that shot, which puts the question to the reference's own observer. On the `gemini`
observer that means you do not open the frame yourself; `reconstruction-loop.md` says which rule
binds on which path.

Be most suspicious of anything an observation asserts about change over time — something appearing,
vanishing, being removed, being drawn in a single frame. A describer working from one pass infers
those rather than seeing them, and infers them wrongly. A narrow question over the stretch is how
such a claim is checked. A `compare_reconstruction` against a quick rendered probe works too, and is
a probe rather than the element comparison `reconstruction-loop.md` runs — that one is rendered from
the Source's own values and is credited with `--element`.

## Narrow questions

`--question` is a separate path. It requires one to three `--shot-id` values, answers only that
question from those shots' clips and frames in a single request, and neither reads nor writes the
observation cache:

```bash
hypit-reference-video-tools observe_reference --reference-id <id> --shot-id shot-007 \
  --question "How thick is the outline on the caption words, relative to the stroke width of the letters?"
```

Several at once is `--batch <questions.json>`, an array of `{shot_ids, question}`. Ask about visible
attributes. Never ask which component to use. Do not re-observe the full shot to correct one: that is
paid, and at temperature `1.0` it returns a paraphrase rather than a correction.

## Boundaries

An observation is natural language and nothing else. Never send an observer SVML syntax, package
declarations, vocabulary, previews or implementation code. Never ask for SVML, SVS, SVRun, a
structured reference plan, component names or TypeScript in an observation. Never state what you
built or what you expect to be found. An observation is evidence rather than the final decision
maker — which is a rule about what an observation may contain, so it binds when you are the one
writing it.

Inspect every failed or unresolved result. Follow up with one narrow question over one to three
relevant shots rather than repeating the entire analysis. Preserve successful cached observations
unless the selected shot or preparation stage must be refreshed. Do not pass model, concurrency,
rate-limit or temperature settings; on the `gemini` observer temperature is fixed at `1.0`.
