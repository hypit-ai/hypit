# Who reads the reference

Two observers can read a reference video, and the author picks which one before any command runs. The
choice is made once per reference and recorded in its state: every observation of one reference is
made through one observer, so that evidence gathered two different ways never sits under the same keys
with nothing on the record saying which is which.

Everything after the evidence is the same on both paths. The observation keys are the same, the
prompts are the same, the cache is the same file, and every file this route links reads the result
without knowing which observer produced it.

## The two

**`gemini`** uploads the shot clips and the whole reference to Vertex. It sees motion as motion and
hears the sound. It needs `GOOGLE_CLOUD_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS_JSON`, and each
observation is a paid request.

**`agent`** hands the observations to you. It needs no credentials and reaches no Provider: the CLI
prepares the same media, then returns each observation as a task carrying its prompt and the pictures
to answer it from. You look, you answer, you record the answer, and the result assembles exactly as
the other path's does.

## Choosing

Ask the author once, before `prepare_reference`, and say what each one costs them. Report what this
machine actually holds rather than asking them to recall it:

```text
node .agents/skills/hypit/scripts/check-credentials.mjs GOOGLE_CLOUD_PROJECT GOOGLE_APPLICATION_CREDENTIALS_JSON
```

Both variables `set` means `gemini` is available and the author chooses. Either one `missing` means
`agent` is the path that can run today, and the author decides whether to run it or to configure
Vertex first — `../credentials.md` says what those two variables are.

This is the one question this route asks about how it runs. Everything else it decides:
`index.md` still owns the working directory, the project location, the vocabulary and the generators.

## What the `agent` observer reads

Each shot arrives as one picture: its frames sampled evenly across its duration and tiled in reading
order, left to right then top to bottom. Read the grid as time passing. The whole reference arrives as
the storyboard of representative frames. A task that carries a single picture carries one moment.

The number of frames follows the shot's length, from four for a short one to nine for a long one, so
a cell stays wide enough to read detail in.

## What sound costs on the `agent` observer

You cannot hear the reference. Three things follow, and each is a condition to work inside rather than
a step to skip:

- `transcript` is unaffected. WhisperX measures every word locally on both paths, so the words and
  their timings are exact, and `final-sources.md` takes Segment durations from `transcript_ref` as it
  always does.
- A task that needs sound says so in its own prompt. Answer it from what the pictures and the
  transcript support — who is visibly speaking, what is on screen when a passage runs — and state
  plainly which parts you could not determine. An observation that says what it could not see is
  complete; one that infers a voice from an appearance is wrong, and
  `continuity.md` depends on that distinction.
- `voices` and the sound half of each `boundary` are the observations this affects. Read what they
  return as what a viewer with the sound off would know.

## The comparison in the loop is yours too

`compare_reconstruction` on the `agent` observer returns the two images and the same question rather
than an answer. You look at the reference frame and your render and describe the differences yourself.

That makes the report yours, and you know what you built, so the discipline that keeps it useful is
explicit:

- **Write the differences down before naming a cause.** List what is visibly different, in the words
  you would use if you had never seen the source. Deciding what went wrong first, then looking, finds
  what you expected.
- **A difference you did not write down is not an attempt.** `reconstruction-loop.md`'s two-attempt
  ceilings apply unchanged, and they count repairs aimed at differences the comparison named.
- **Measure rather than iterate.** A stroke that is too thick, a shape that is too tall, a margin that
  is too wide — read the number off the frame against the frame's own width and height, and change the
  value once. `reconstruction-loop.md` says why an attempt is for differences that have no number.

## Running it

```text
hypit-reference-video-tools prepare_reference --video-path <path> --observer agent
hypit-reference-video-tools observe_reference --reference-id <id>
```

Both return `pending_observations`: a list of tasks, each with its `key`, its `instruction`, its
`prompt` and the `image_refs` to read. Answer one, then record it:

```text
hypit-reference-video-tools record_observation --reference-id <id> --key visual:shot-002 \
  --text-file <path to your answer>
```

`--text-file` is how a long answer arrives whole; `--text` suits a short one. Re-run
`observe_reference` to see what is still owed. An observation you have not answered reports as
`pending`, which `unresolved` lists and which is not a failure.

`--redo all --observer <other>` is how a reference changes observer, and it re-prepares everything,
because the observations it holds were read from the other kind of evidence.
