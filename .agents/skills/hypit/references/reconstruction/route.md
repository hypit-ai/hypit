# Reference-video reconstruction route

Read a step, do it, read the next one. Each step names the files it needs; read those at that step.

## What this route delivers

The components the video needs, `main.svml`, `recipes.svs`, `build.svrun`, and the Runtime Profile
that binds what they demand — **wired**, meaning `preview_check` proves every track the sources
declare traces to the Film. Every generation the Source declares is declared rather than performed:
no Build is submitted, and no video generation, speech synthesis, alignment or final render runs.
Those belong to the Build the author starts deliberately, after reading what was written.

Seeing the reconstruction is what that Build is for. What is settled here is that the graph traces,
which is the part a Build cannot repair.

One exception, because it is not a generation of the video: a component's own surface — the field its
elements are drawn on — is produced while the package is authored, with `hypit image`, and committed
inside the package. `../playbooks/craft/generated-dependencies.md` draws that line.

**That exception covers the component's surface and nothing else.** Every other picture the video
shows — the inner picture of a card, an inserted screenshot, a thumbnail, a product shot, a logo
wall, a phone or monitor's content — is the video's content, and content is declared in `main.svml`
as a generation:

```svml
<copy:Value id="meme-look">A screenshot of a vertical social-media post…</copy:Value>
<gpt:Image id="meme-shot" prompt={meme-look} aspect-ratio="4:5" resolution="2K"/>
```

Writing `<media:Image src="./assets/meme.png"/>` instead spends money this route does not spend, and
loses the thing that mattered: the prompt. A declared generation carries its own description in the
Source, so it can be reread, corrected and rebuilt; a PNG on disk carries nothing, and the next
person has to invent the prompt again. `media:Image` is for material the author supplied.

Reference observation is part of the work and is expected to cost what it costs.

## The video path is the whole request

The author gives one thing: the path to a video. The working directory, the project name, which
packages to use and where the result goes are yours to decide. Ask the author about the video and
nothing else — what it is for, who is in it, what it should say. Those answers describe the result
they want; record them and apply them at step 24. Never interrupt to ask which generator, which
package, which directory, or whether to proceed.

The author often wants the result to differ from the reference: their presenter, their product,
their brand. **Reconstruct the reference as it is anyway, all of it, and change it afterwards.** The
reconstruction is checkable only while it claims to reproduce the video that was observed: the
observations describe the reference and are cached, and `compare_reconstruction` judges a rendered
element against it. Author the change in early and the evidence describes one video while the sources
describe another.

---

## Phase 0 — Before any command

### 1. Select the Distribution

```bash
hypit paths --json
```

**Read now:** `../environment.md` — the three independent places, Distribution selection, the
prohibition on a registry install, the launcher substitution rule that makes every
`hypit-reference-video-tools` string below resolvable in a checkout, and the rule that commands
sharing reference state run from the same working directory.

**Done when:** an installed CLI or a contributor checkout is selected. If neither is available,
report that no runnable Hypit Distribution is present and stop.

### 2. Choose the project directory

Its own directory outside the installed Distribution, normally `<home>/<something>-reverse/`, named
after the video. Use a directory the author named only if they named one. Give it a `package.json`
with a name and `"private": true`, and nothing else — no field in it is read. `hypit check`, `plan`
and `build` find the package root by walking up from the project until a `package.json` appears, so
this file is what stops that walk at the project and lets `packages/local-<slug>/` resolve. It
matches no `pnpm-workspace.yaml` glob, so it enrolls the directory in nothing.

**Read now:** `../runtime.md` — the hard boundary between a project and a Distribution.

### 3. Load credentials

A project that keeps credentials in `.env` does not load them automatically:

```bash
set -a && source .env && set +a
```

**Read now:** `../credentials.md` — which variables each Provider needs. A variable a Provider needs
and this machine does not hold is named, and the route stops there. The Vertex pair is the one
exception: it selects an observer rather than blocking one, and step 5 owns it.

### 4. Read the observer question

**Read now:** `observers.md`, down to and including "Say which path is running" — the cost of each
observer, the credential decision table, the disclosure the author is owed, and the rule that one
reference has one observer for its whole life.

### 5. Probe for Vertex credentials

```bash
node .agents/skills/hypit/scripts/check-credentials.mjs GOOGLE_CLOUD_PROJECT GOOGLE_APPLICATION_CREDENTIALS_JSON
```

Report what this machine holds rather than asking the author to recall it. Both `set` means `gemini`
is available and the author chooses. Either one `missing` means `agent` is the path that can run
today.

### 6. Ask which observer reads the reference

Ask once. Name what each costs, and say that `agent` reads the reference a little less closely — a
shot arrives as sampled frames rather than continuous video, so continuity across it is read rather
than watched, and there is no sound, so a voice is attributed rather than heard. Say it once, take
the answer, and run.

**This is the only question this route asks about how it runs.**

### 7. Say which observer is reading

One line, before any evidence starts.

---

## Phase 1 — Evidence, with reading alongside

### 8. List installed vocabulary

```bash
hypit-reference-video-tools list_svml_packages
```

It reads `node_modules/@hypit` relative to the working directory and refuses when it is empty, so run
it from the repository root. Name the project with `--package-root` when the command is not run from
inside it. This is instant and may run before or during the sweep.

### 9. Prepare the reference

```bash
hypit-reference-video-tools prepare_reference --video-path <path> --observer gemini|agent
```

Verify the WhisperX service answered its health probe before running this — a first start can spend
several minutes loading the model. `../environment.md` says how; `../host-setup.md` covers the
failure branches.

**Read now:** `evidence.md` — what the four whole-reference observations cover, what `transcript` is
and how to recover it when it reports `status: "unavailable"`, and the `--redo` values.

**Done when:** the four whole-reference observations and `transcript` exist. On the `agent` observer
they come back as `pending_observations` for you to answer with `record_observation`; answer those
four first, because `observe_reference` quotes them into every shot's question and refuses to run
until they exist.

### 10. Run the full sweep, in the background

```bash
hypit-reference-video-tools observe_reference --reference-id <reference-id>
```

**Start this before step 11 and read while it runs.** Its prompts are fixed and nothing in step 11
changes what they ask. Reading first and observing afterwards makes the same run several minutes
longer for nothing.

On the `agent` observer, give each task its own subagent where the harness has them and run a pass
together; that is what makes the sweep parallel. Answering everything one call listed is not the end
of it — the sweep ends when `pending_observations` and `unresolved` are both empty.

### 11. Read the route's craft, while the sweep runs

Read completely, in this order — a reconstruction needs to know what a picture *is* before what one
generation owes another:

1. `continuity.md` — shot, overlay, B-roll, speaker, product and persistent-system rules.
2. `../playbooks/craft/graphic-compositions.md` — what may be a base picture, when a full screen is
   one authored composition, and where a missing picture comes from.
3. `../playbooks/craft/generated-dependencies.md` — what one generation owes another: the location,
   the split picture, the voice, the first frame, and the stretch too short to be a take.
4. `../playbooks/craft/frame-coverage.md` — what is on screen at every instant, and the edges nobody
   chose.
5. `../playbooks/craft/visual-continuity.md` — recurring anchors as explicit artifacts, one location
   generated once, and the reverse-view geometry that must hold across takes.
6. `../vocabulary.md` — how a package is chosen: enumerate every system before naming one, reuse
   before compose before declaring a gap, and what a real gap obliges.
7. `vocabulary.md` — what the reference evidence adds to that: enumerating from the observations, and
   measuring an appearance value rather than choosing it.

Do not skip one because the task looks like a familiar video format.

---

## Phase 2 — Interpret the evidence

### 12. Collect the sweep and inspect what failed

`unresolved` lists observations that failed outright. A complete observation that says "unclear" is
still complete. Be most suspicious of anything an observation asserts about change over time.
`evidence.md` says why and what to do.

### 13. Settle conflicts with narrow questions

```bash
hypit-reference-video-tools observe_reference --reference-id <id> --shot-id shot-007 \
  --question "How thick is the outline on the caption words, relative to the stroke width of the letters?"
```

One to three shots per question; `--batch <questions.json>` sends several. Ask about visible
attributes. Never ask which component to use. Do not re-observe a full shot to correct one.

**Done when:** every appearance value that changes what the viewer sees is measured rather than
defaulted, and every conflict between observations is settled.

### 14. Inspect candidate packages

```bash
hypit-reference-video-tools inspect_svml_vocabulary --package @hypit/<name> [--package …]
```

Enumerate the systems from the observations, then inspect a candidate for each. A system you never
inspected is a system you are about to invent.

### 15. Develop a project-local package, only for a proven gap

**Read now:** `../local-author-package.md`, completely.

**Done when:** the package installs and `inspect_svml_vocabulary` reads its declaration. A component
that loads is not yet a component that looks like the reference.

---

## Phase 3 — Author, check, wire

### 16. Write the four files

`main.svml`, `recipes.svs`, `build.svrun`, `hypit.runtime.json`. The Runtime Profile is part of the
deliverable even though this route runs nothing: without it the first thing the author meets is
`RUNTIME_CAPABILITY_UNBOUND`.

**Read now:**

- `final-sources.md` — Segment boundaries, the forced seam, and take durations from `estimate:Speech`.
- `../authoring.md` — never invent a component, attribute, child, port, Recipe property or literal
  value, and how an accepted Record is reused in the Run Source.
- `../playbooks/craft/captions.md` — Cue breaks, the Recipe keys, and what recomputes when speech
  changes.
- `../playbooks/craft/persona-and-audio.md` — one voice sample per person, and the identity anchors
  that make step 24 cheap.
- `../playbooks/index.md` and the craft files it names for the systems this reference actually
  contains. Those conditions can only be evaluated now, with the evidence in.

Do not author one source fragment per shot.

### 17. Check all three sources

```bash
hypit check path/to/main.svml
hypit check path/to/recipes.svs
hypit check path/to/build.svrun
```

Check all of them. Do not create a check wrapper.

### 18. Prove the graph traces

```bash
hypit-reference-video-tools preview_check /path/to/project/build.svrun
```

**Read now:** `../preview.md`.

`preview_check` reporting only `unresolved capabilities` and staying sound **is the pass**, and is
the state every reconstruction is in when its sources are first written. Neither this gate nor step
17 is bounded by the loop's attempt ceilings: a graph that does not trace is work that is not done.

---

## Phase 4 — The comparison loop

### 19. Read the loop

**Read now:** `reconstruction-loop.md`, as soon as the sources place an element — that is the first
moment the loop has something to render.

### 20. Render every stretch of every authored element

```bash
hypit-reference-video-tools render_element projects/<name>/build.svrun \
  --element <id> --segment <id>|--selection <id> --reference-id <id> --out <path>.mp4
```

A whole round is one call: `--batch <renders.json>`. `render_element` calls `make-placeholder` itself
for the layers a Build has not made.

### 21. Send every comparison for the element at once

```bash
hypit-reference-video-tools compare_reconstruction --reference-id <id> --shot-id <id> \
  --video <path>|--image <path> [--question <scope>] [--element <id>]
```

**Pass `--element <id>` every time**, or step 23 credits the comparison to nothing. Send all of an
element's comparisons before repairing anything.

### 22. Repair against the differences that round returned

Within the two ceilings `reconstruction-loop.md` sets. Then return to step 20 for the next element.

### 23. Close the route on the check

```bash
hypit-reference-video-tools reconstruction_check projects/<name>/build.svrun
```

It names each element that has never been compared and the command that compares it, and reports
`"passed": false` until none are left. It asks for participation rather than convergence — the loop
is deliberately bounded and may stop with visible differences remaining — so an element compared once
and stopped at its ceiling passes, and an element nobody looked at does not.

It also reads each timed picture's appearance Recipe and refuses a `playback` left at its default,
which draws generated material once and then draws nothing for the rest of the window.
`../playbooks/craft/generated-dependencies.md` says what to set.

How it picks a reference: exactly one prepared → it uses that one; several → it demands
`--reference-id <id>` and refuses without it; none → it refuses and tells you to run
`prepare_reference`.

A comparison run without `--element` is credited to no element, and a misspelled `--element` credits
nothing either — it reports logged element names that do not exist in the Source. Which package draws
an element makes no difference: a Track from installed vocabulary carries authored values exactly as
a project-local one does, and `render_element` stands in for the speech. A project that places no
drawing element passes with nothing to require.

**Done when:** `"passed": true`.

---

### 24. Apply the author's requested change

Read what you wrote and change it to what they asked for at step 6. The identity of each recurring
person and product is already a single anchor, because `../playbooks/craft/persona-and-audio.md` and
`../playbooks/craft/visual-continuity.md` required that while you were writing.
