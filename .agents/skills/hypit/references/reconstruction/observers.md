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

Ask the author once, before `prepare_reference`. Report what this machine actually holds rather than
asking them to recall it:

```text
node .agents/skills/hypit/scripts/check-credentials.mjs GOOGLE_CLOUD_PROJECT GOOGLE_APPLICATION_CREDENTIALS_JSON
```

Both variables `set` means `gemini` is available and the author chooses between the two. Either one
`missing` means `agent` is the path that can run today; say so, say what it costs, and let the author
decide whether to run it or to configure Vertex first. `../credentials.md` says what those two
variables are.

Say that `agent` reads the reference a little less closely — a shot arrives as sampled frames rather
than continuous video, so continuity across it is read rather than watched, and there is no sound, so
a voice is attributed rather than heard. The reconstruction it produces is a working one. Say it once,
take the answer, and run.

## Say which path is running

Once the answer is in, tell the author which observer is reading the reference, before the evidence
starts. One line is enough, and it names the observer and the reason: the credentials are there and
they chose it, or the credentials are absent and this is the path that runs.

The author reads the observations, the sources and eventually the video. Which observer produced the
evidence changes what those are worth, and it is not visible in any of them.

This is the one question this route asks about how it runs. Everything else it decides:
`index.md` still owns the working directory, the project location, the vocabulary and the generators.

## What the `agent` observer reads

Each shot arrives as one picture: its frames sampled evenly across its duration and tiled in reading
order, left to right then top to bottom. Read the grid as time passing. A task that carries a single
picture carries one moment. The number of frames follows the shot's length, from four for a short one
to nine for a long one, so a cell stays wide enough to read detail in.

A whole-reference task carries the storyboard — every shot's representative frame in one picture, for
reading the video at a glance — followed by every shot's tile, so the question sees every frame the
shot observations see. On a long reference that is a lot of pictures, and it is the whole evidence:
answer from all of them rather than from the storyboard alone, which shows one moment per shot and
therefore answers neither what moves nor what recurs.

## How sound is answered on the `agent` observer

You cannot hear the reference, and there is no second source of sound to fall back to, so the sound
observations are answered from the two things you do have. Answer them fully; do not leave them short
and do not put the gap to the author.

- **The transcript says when.** WhisperX measures every word locally on both paths, so the words and
  their timings are exact whichever observer reads the pictures. That settles whether anyone is
  speaking at a given moment, and `final-sources.md` still takes Segment durations from
  `transcript_ref` as it always does.
- **The pictures say who.** Attribute speech to the person the frames show speaking during the words
  the transcript places there. A task that needs sound says so in its own prompt and asks for exactly
  this reading.
- **The two together are the evidence.** `continuity.md` asks for audio evidence over visible-person
  presence because a mouth moving in silent B-roll misleads. On this observer the transcript is what
  keeps that from happening: a person whose mouth moves during a stretch the transcript places no
  words in is not the speaker, however much they look like one.

`voices` and the sound half of each `boundary` are the observations this shapes. They are attributions
read off pictures and word timings, and that is what a later reader should take them for.

## Answer each task in its own subagent when you can

Every task the tool returns is self-contained: a `key`, an `instruction`, a `prompt` that already
carries the whole-reference context, and absolute `image_refs`. No task refers to another task's
answer. So if the harness you are running in can spawn subagents — Claude Code and Codex can, and
some cannot — give each task to its own, and run them together.

Hand the subagent the `instruction`, the `prompt` verbatim and the `image_refs`, and nothing else.
Not what you built, not which component drew anything, not what you expect it to find, and not another
observation's answer. Take the returned text and write it with `record_observation` yourself, so one
writer owns the cache.

Two things follow from one task per subagent, and both of them are properties the `gemini` observer
has for free:

- **The observations are independent again.** Each one is answered by a reader that saw only its own
  pictures and its own question, which is what a separate request to Gemini is. Two observations
  agreeing is evidence again rather than one reader being consistent with itself.
- **The comparison closes blind.** A subagent handed two unlabelled images and the comparison question
  does not know which is the reference, what was built or what you hoped to see. That is the same
  unlabelled pair the other observer gets.

Answer the tasks in order yourself when the harness has no subagents. It is slower, and it is the
fallback rather than the shape to aim for.

## Comparing without subagents

Answering the comparison yourself makes the report yours, and you know what you built, so the
discipline that keeps it useful has to be explicit:

- **Write the differences down before naming a cause.** List what is visibly different, in the words
  you would use if you had never seen the source. Deciding what went wrong first, then looking, finds
  what you expected.
- **A difference you did not write down is not an attempt.** `reconstruction-loop.md`'s two-attempt
  ceilings apply unchanged, and they count repairs aimed at differences the comparison named.
- **Measure rather than iterate.** A stroke that is too thick, a shape that is too tall, a margin that
  is too wide — read the number off the frame against the frame's own width and height, and change the
  value once. `reconstruction-loop.md` says why an attempt is for differences that have no number.

The same three hold when a subagent compares, and they cost nothing there; what a subagent adds is
that the comparer is not the builder.

## Running it

```text
hypit-reference-video-tools prepare_reference --video-path <path> --observer agent
hypit-reference-video-tools observe_reference --reference-id <id>
```

Both return `pending_observations`: a list of tasks, each with its `key`, its `instruction`, its
`prompt` and the `image_refs` to read.

**Answer `prepare_reference`'s four before running `observe_reference`.** Every shot observation quotes
the whole-reference evidence into its own question, so a sweep run before those four exist asks each
shot with less than it should have and caches the answer. `observe_reference` refuses until they are
recorded and names the ones it is waiting for; a narrow `--question` is exempt, being a follow-up
rather than the sweep.

Answer one, then record it:

```text
hypit-reference-video-tools record_observation --reference-id <id> --key visual:shot-002 \
  --text-file <path to your answer>
```

`--text-file` is how a long answer arrives whole; `--text` suits a short one. Re-run
`observe_reference` to see what is still owed. An observation you have not answered reports as
`pending`, which `unresolved` lists and which is not a failure.

`--redo all --observer <other>` is how a reference changes observer, and it re-prepares everything,
because the observations it holds were read from the other kind of evidence.
