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

## The video is the whole request

The author gives one thing: a video, as a path to a file or as a link to one. A link — TikTok,
YouTube, Instagram, Bilibili — is fetched by `prepare_reference` before anything else runs, with the
`yt-dlp` pinned under `services/yt-dlp` and run through `uv`, and every step after that reads the downloaded file without knowing it was ever a link. The
download is cached by the link, so a route restarted after an interruption reaches the same bytes and
therefore the same reference rather than paying for its observations twice. The working directory, the project name, which
packages to use and where the result goes are yours to decide. Ask the author about the video and
nothing else — what it is for, who is in it, what it should say. Those answers describe the result
they want; record them and apply them at step 23. Never interrupt to ask which generator, which
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

### 5. Probe for Vertex credentials, then ask which observer reads

`observers.md`'s "Choosing" section holds the command, what each answer means, and the disclosure the
author is owed. Run it, put the question once, take the answer, and run.

**This is the only question this route asks about how it runs.**

### 6. Say which observer is reading

One line, before any evidence starts.

---

## Phase 1 — Evidence, with reading alongside

### 7. List installed vocabulary

```bash
hypit-reference-video-tools list_svml_packages
```

It reads `node_modules/@hypit` relative to the working directory and refuses when it is empty, so run
it from the repository root. Name the project with `--package-root` when the command is not run from
inside it. This is instant and may run before or during the sweep.

### 8. Prepare the reference

```bash
hypit-reference-video-tools prepare_reference --video-path <path or link> --observer gemini|agent
```

`--video-path` takes a link as readily as a path. The result names the link it fetched under
`source_url`, which is the only record of which video was reconstructed once the bytes are on disk.

Verify the WhisperX service answered its health probe before running this — a first start can spend
several minutes loading the model. `../environment.md` says how; `../host-setup.md` covers the
failure branches.

**Read now:** `evidence.md` — what the four whole-reference observations cover, what `transcript` is
and how to recover it when it reports `status: "unavailable"`, and the `--redo` values.

**Done when:** the four whole-reference observations and `transcript` exist. On the `agent` observer
they come back as `pending_observations` for you to answer with `record_observation`; answer those
four first, because `observe_reference` quotes them into every shot's question and refuses to run
until they exist.

### 9. Run the full sweep, in the background

```bash
hypit-reference-video-tools observe_reference --reference-id <reference-id>
```

**Start this before step 10 and read while it runs.** Its prompts are fixed and nothing in step 10
changes what they ask. Reading first and observing afterwards makes the same run several minutes
longer for nothing.

On the `agent` observer, give each task its own subagent where the harness has them and run a pass
together; that is what makes the sweep parallel. Answering everything one call listed is not the end
of it — the sweep ends when `pending_observations` and `unresolved` are both empty.

### 10. Read the route's craft, while the sweep runs

Read completely, in this order — a reconstruction needs to know what a picture *is* before what one
generation owes another:

1. `continuity.md` — shot, overlay, B-roll, speaker, product and persistent-system rules.
2. Every craft file named in the first item of `../playbooks/index.md`'s required load order, in the
   order it gives them. That page owns the list; restating it here is how a required file once became
   reachable from one route and invisible to the other.
3. `../script-time.md` — what a Segment is bound to, and why never a number of seconds.
4. `../vocabulary.md` — how a package is chosen: enumerate every system before naming one, reuse
   before compose before declaring a gap, and what a real gap obliges.
5. `vocabulary.md` — what the reference evidence adds to that: enumerating from the observations, and
   measuring an appearance value rather than choosing it.

Do not skip one because the task looks like a familiar video format.

---

## Phase 2 — Interpret the evidence

### 11. Collect the sweep and inspect what failed

`unresolved` lists observations that failed outright. A complete observation that says "unclear" is
still complete. Be most suspicious of anything an observation asserts about change over time.
`evidence.md` says why and what to do.

### 12. Settle conflicts with narrow questions

`evidence.md`'s "Narrow questions" section holds the command, what a question may ask, and why
re-observing a whole shot to correct one is the wrong repair.

**Done when:** every appearance value that changes what the viewer sees is measured rather than
defaulted, and every conflict between observations is settled.

### 13. Inspect candidate packages

```bash
hypit-reference-video-tools inspect_svml_vocabulary --package @hypit/<name> [--package …]
```

Enumerate the systems from the observations, then inspect a candidate for each. A system you never
inspected is a system you are about to invent.

### 14. Develop a project-local package, only for a proven gap

**Read now:** `../local-author-package.md`, completely.

**Done when:** the package installs and `inspect_svml_vocabulary` reads its declaration. A component
that loads is not yet a component that looks like the reference.

---

## Phase 3 — Author, check, wire

### 15. Write the four files

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
  that make step 23 cheap.
- `../playbooks/index.md` and the craft files it names for the systems this reference actually
  contains. Those conditions can only be evaluated now, with the evidence in.

Do not author one source fragment per shot.

### 16. Check every source, then prove the graph traces

One command does both: it checks every Source the Run reaches — the Run, the Author it names, the
Recipe sheets and kits the Author imports — and then proves the graph traces. A Source that does not
check is refused before tracing, with the file and position.

```bash
hypit-reference-video-tools preview_check /path/to/project/build.svrun
```

**Read now:** `../preview.md`, which says which refusal is the pass. A Source that declares its
generations rather than performing them is the state every reconstruction is in when its sources are
first written. This gate is not bounded by the round's attempt ceilings.

---

## Phase 4 — The comparison round

### 18. Read the round

**Read now:** `../element-review.md`, then `comparison-round.md`, as soon as the sources place an
element — that is the first moment the round has something to render.

### 19. Ask the check what to render, then render it

`reconstruction_check` returns a `plan`: each entry an element and a word range, with the reason it
earned a look, and a picture path it will be rendered to. That is the round — it is not yours to work
out from the Source.

Its output is already a `render_element --batch` file: `renders` is in it. So:

```bash
hypit-reference-video-tools reconstruction_check projects/<name>/build.svrun --reference-id <id> > round.json
hypit-reference-video-tools render_element projects/<name>/build.svrun --batch round.json --reference-id <id>
```

`comparison-round.md` says to pass `--reference-id` every time so the stand-in runs on the
reference's clock. The program is drawn once and every entry is cut out of those frames, so render
the whole list in one `--batch` call.

### 20. Send every comparison at once

The same file is a `compare_reconstruction --batch` file too — `comparisons` is in it, and each entry
carries `--element` already, so step 22 can credit it. Nothing is written between the two commands.

```bash
hypit-reference-video-tools compare_reconstruction --reference-id <id> --batch round.json
```

### 21. Repair against the differences that round returned

Within the two ceilings `../element-review.md` sets. Then return to step 19 for the next element.

### 22. Close the route on the check

```bash
hypit-reference-video-tools reconstruction_check projects/<name>/build.svrun
```

It names each element that has never been compared and the command that compares it, and reports
`"passed": false` until none are left. It asks for participation rather than convergence — the round
is deliberately bounded and may stop with visible differences remaining — so an element compared once
and stopped at its ceiling passes, and an element nobody looked at does not. It also refuses a
`playback` left at its default — `../playbooks/craft/generated-dependencies.md` says what to set — and
an uncovered stretch of the Script, and reports every Frame reaching past the Canvas.

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

### 23. Apply the author's requested change

Read what you wrote and change it to what they asked for at the start. The identity of each recurring
person and product is already a single anchor, because `../playbooks/craft/persona-and-audio.md` and
`../playbooks/craft/visual-continuity.md` required that while you were writing.
