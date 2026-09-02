# Who reads the reference

Two observers can read a reference video, and the author picks which one before any command runs. The
choice is made once per reference and recorded in its state: every observation of one reference is
made through one observer, so that evidence gathered two different ways never sits under the same keys
with nothing on the record saying which is which.

Everything after the evidence is the same on both paths. The observation keys are the same, the
prompts are the same, the cache is the same file, and every file this route links reads the result
without knowing which observer produced it.

## The two

**`gemini`** uploads the shot clips and the whole reference to the configured Gemini backend. It sees
motion as motion and hears the sound. With the default `HYPIT_GEMINI_PROVIDER=auto`, a configured
HypiHub OAuth uses HypiHub; otherwise `GOOGLE_CLOUD_PROJECT` plus
`GOOGLE_APPLICATION_CREDENTIALS_JSON` uses Vertex. Each observation is a paid request. If neither
backend is available, run the HypiHub OAuth login for the author. If the author explicitly declines
HypiHub, require the Vertex credential pair instead; do not silently fall back to `agent`.

**`agent`** hands the observations to you. It needs no credentials and reaches no Provider: the CLI
prepares the same media, then returns each observation as a task carrying its prompt and the pictures
to answer it from. You look, you answer, you record the answer, and the result assembles exactly as
the other path's does. This technical property does not waive the reconstruction credential gate:
the author must first settle on HypiHub OAuth or an author-owned provider credential, and the Agent
must never select `agent` merely because no credential was found.

## Choosing

Before `prepare_reference`, inspect the selected Runtime Profile and report what this machine actually
holds rather than asking the author to recall it. For a HypiHub Endpoint, use `hypit auth status
<endpoint> --runtime <profile>`; if its OS credential is missing, first tell the author that no usable
credential is configured and that browser sign-in is needed so Hypit can use HypiHub without asking for
a pasted API key. If the account has no active Hypit subscription, explain that it can be purchased on
hypit.ai after signing in. Explain that the session is stored in the OS credential store and that opening
login does not itself submit a paid generation. Then run `hypit auth login <endpoint> --runtime <profile>`
yourself and wait for the browser OAuth callback:

```text
node <skill-root>/scripts/check-credentials.mjs GOOGLE_CLOUD_PROJECT GOOGLE_APPLICATION_CREDENTIALS_JSON
```

HypiHub OAuth configured means `gemini` is available through HypiHub. If it is missing, run the HypiHub
OAuth login for the author and re-check credentials. If login is declined or fails, the Google pair
must both be set for Vertex. If neither HypiHub OAuth nor the Google pair is available, stop and tell
the author to complete one of those two credential paths; never use `agent` as a credential bypass.
`../credentials.md` says what each variable is.

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
`route.md` still owns the working directory, the project location, the vocabulary and the generators.

## The protocol is one loop

The tool asks, you answer, you record, you ask again. It ends when the tool asks for nothing.

```text
hypit-reference-video-tools prepare_reference --video-path <path> --observer agent
hypit-reference-video-tools observe_reference --reference-id <id>
hypit-reference-video-tools record_observation --reference-id <id> --key <key> --text-file <path>
```

The first two return `pending_observations`: tasks, each with its `key`, its `instruction`, its
`prompt` and the `image_refs` to read. `--text-file` is how a long answer arrives whole; `--text`
suits a short one.

Everything else about running this observer follows from one fact — **the answer comes back out of
band, so the tool cannot ask and be answered inside one call.** What follows is that fact seen from
four sides, not four rules to remember separately:

- **`pending` is a task handed out, not an answer received.** It is never cached, so an observation you
  have not answered is asked again rather than read as finished. `unresolved` lists it, and here that
  is a question outstanding rather than a question that failed.
- **The tool only hands out a task whose inputs exist.** The four whole-reference observations are
  quoted into every shot's question, so `observe_reference` refuses the sweep until they are recorded,
  and names the ones it is waiting for. A narrow `--question` is exempt, being a follow-up rather than
  the sweep.
- **A task whose input is another answer appears on a later pass.** The three-shot continuity review is
  decided from what the boundary observations say, so it cannot be handed out by the pass that asks for
  them. It appears on the next one and is complete on the one after.
- **Empty `pending_observations` ends the sweep**, and empty `unresolved` says the same from the other
  side. Answering everything one call listed is not the end of it.

The observer that answers in band walks all of this inside a single call, which is why the loop is easy
to leave out. Leaving it out stops before the three-shot review exists: `continuity.md` then has no
evidence for whether three clips are one continuous camera shot, and a stretch the reference plays
unbroken is authored as three, with two seams it does not have.

`--redo all --observer <other>` is how a reference changes observer, and it re-prepares everything,
because the observations it holds were read from the other kind of evidence.

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
  speaking at a given moment, and where a word sits. It does not set a take's duration: the take is
  generated and its length comes from `estimate:Speech`, as `../script-time.md` requires.
- **The pictures say who.** Attribute speech to the person the frames show speaking during the words
  the transcript places there. A task that needs sound says so in its own prompt and asks for exactly
  this reading.
- **The two together are the evidence.** `continuity.md` asks for audio evidence over visible-person
  presence because a mouth moving in silent B-roll misleads. On this observer the transcript is what
  keeps that from happening: a person whose mouth moves during a stretch the transcript places no
  words in is not the speaker, however much they look like one.

`voices` and the sound half of each `boundary` are the observations this shapes. They are attributions
read off pictures and word timings, and that is what a later reader should take them for.

## Each task is answered in its own subagent

Every task is self-contained, and no task refers to another task's answer. **Where the harness can
spawn subagents — Claude Code and Codex can, and some cannot — one subagent per task is required, and
a pass runs them together.** `../element-review.md` states the rule and why it is not a preference;
this is what it means for a reference observation.

Hand the subagent the `instruction`, the `prompt` verbatim, the `image_refs`, and `transcript_ref` and
`transcript_words` when the task carries them — and nothing else. Not what you built, not which
component drew anything, not what you expect it to find, and not another observation's answer. Take
the returned text and record it yourself, so one writer owns the cache.

**Do not open the pictures yourself.** That is the whole point: the observer that uploads is a
separate request and cannot be you, and one task per subagent is what makes this path equal to it
rather than merely faster.

Two things follow from one task per subagent, and both of them are properties the `gemini` observer
has for free:

- **The observations are independent again.** Each one is answered by a reader that saw only its own
  pictures and its own question, which is what a separate request to Gemini is. Two observations
  agreeing is evidence again rather than one reader being consistent with itself.
- **The comparison closes blind.** A subagent handed two unlabelled images and the comparison question
  does not know which is the reference, what was built or what you hoped to see. That is the same
  unlabelled pair the other observer gets.

Answer the tasks in order yourself only where the harness has no subagents. It is slower, it is the
fallback rather than the shape to aim for, and the discipline below stands in for the blindness it
cannot have.

The comparison round arrives here in batches. One element is compared against every stretch it is drawn
over before any repair, and `comparison-round.md` has the renders all made before the first
comparison is sent, so they arrive together. Each is self-contained in the same way an observation
task is: no comparison's question depends on another's answer.

Dispatch one subagent per comparison and run them together. Where there are no subagents, answer them
one after another rather than folding them into a single look — what the round is for is the set of
differences across stretches, and one answered in the light of the previous answer stops being
independent evidence of anything.

A clip comparison reaches this observer as two frame tiles — the reference's own cut, and one built
from the render against the same duration, both drawn at the same cell width. Read them as a pair of
grids sampling the same stretch at the same rate.

`comparison-round.md` states the order the pair is sent in and why the observer is not told it. Read
the answer with that in hand.

### Record the differences against the comparison that asked for them

`compare_reconstruction` returns a `comparison_id`, and the answer goes back under it:

```bash
hypit-reference-video-tools record_observation --reference-id <id> \
  --key comparison:<comparison_id> --text-file <the differences>
```

Until that lands, the comparison is a pair that was drawn, cut and handed over with nobody having said
what it shows, and `reconstruction_check` lists it under `awaiting_answer` and credits the element
nothing. The differences are what the round is for, so record every one — including the ones that read
as equivalent, in the words the observer used.

## Comparing without subagents

Answering the comparison yourself makes the report yours, and you know what you built.
`../element-review.md` states the declaration-change rule that selects comparisons, and it applies
here unchanged. What a subagent adds, and they cannot, is that the comparer is not the builder.
