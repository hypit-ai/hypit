# Reference-video reconstruction route

Read a step, do it, read the next one. Each step names the files it needs; read those at that step.

**Evidence-first rule:** This route never reads the repository's `examples/` projects. Do not open their
SVML, SVS, SVRun, README, assets or variants at any stage. The sole exception is the generic
`examples/minimal-author-package/` fixture, and only after a real vocabulary gap is proven and the local
package workflow requires its contract. The reference video and its persisted evidence are the source of
truth; after observation, consult only installed package vocabulary and craft guidance for the observed
systems. Examples belong to original authoring and variant planning, not reconstruction.

## What this route delivers

The complete environment is the hard gate. At route entry, read `../environment.md` completely, then
finish its checklist through the environment steps: Distribution, project boundary, credentials,
Runtime Profile, all selected managed programs, and health checks. The HypiHub WhisperX alignment
Endpoint is mandatory and its configured model must be reachable with the completed HypiHub OAuth
credential. Do not enter the
observation or authoring steps while any environment item is missing, installing, unhealthy, or
unconfirmed.

The components the video needs, `main.svml`, `recipes.svs`, `build.svrun`, and the Runtime Profile
that binds what they demand — **wired**, meaning `preview_check` proves every track the sources
declare traces to the Film. Every generation the Source declares is declared rather than performed:
no Build is submitted, and no video generation, speech synthesis, alignment or final render runs.
Those belong to the Build the author starts deliberately, after reading what was written.

Seeing the reconstruction is what that Build is for. What is settled here is that the graph traces,
which is the part a Build cannot repair. The route then pauses at the Studio confirmation handoff
before any paid Build; after explicit acceptance it may proceed with the Runtime Build lifecycle.
Once the paid Build has produced the accepted full video, any new natural-language change starts
`../revision/route.md` from that completed Run; never continue this creation route or edit the rendered file.

If the project is already complete and the author asks for a natural-language change, stop following
this creation route and read `../revision/route.md`. Revision edits Source/Recipe/Run and reruns deterministic
gates; it does not invoke a VLM or visual observer.

One exception, because it is not a generation of the video: a component's own surface — the field its
elements are drawn on — is produced while the package is authored, with `hypit image`, and committed
inside the package. `../playbooks/craft/generated-dependencies.md` draws that line.

**That exception covers the component's surface and nothing else.** Every other picture the video
shows — the inner picture of a card, an inserted screenshot, a thumbnail, a product shot, a logo
wall, a phone or monitor's content — is the video's content, and content is declared in `main.svml`
as a generation:

```svml
<copy:Value id="meme-look">A screenshot of a vertical social-media post…</copy:Value>
<gpt:Image id="meme-shot" prompt={meme-look} aspect-ratio="9:16" resolution="2K"/>
```

Writing `<media:Image src="./assets/meme.png"/>` instead spends money this route does not spend, and
loses the thing that mattered: the prompt. A declared generation carries its own description in the
Source, so it can be reread, corrected and rebuilt; a PNG on disk carries nothing, and the next
person has to invent the prompt again. `media:Image` is for material the author supplied.

The reference video itself is never supplied project media. It is observation/comparison evidence only.
Never copy it into project assets or wire its path into `media:Video`, `asset:Video`, a Media Track,
the Film, or a Run Target. Every visible shot must be newly authored as a generated take or an
explicitly author-supplied replacement asset. A project that directly plays the reference is invalid
and must be rejected before preview or Build.

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

If that same initial request also asks for many variants, step 23 still applies the requested
presenter/product/brand adaptation inside reconstruction. After step 24 passes, hand the adapted base
to `../variant-expansion/route.md`. Do not route the initial adaptation through Revision.

## Checkpoint and recovery

Start the project snapshot before the first route decision:

```bash
hypit-reference-video-tools route_state --action start --project-root <project> \
  --route reconstruction
```

The route tools update machine-owned stages after successful checks, renders, and comparisons. After
reference/observer decisions, Source edits, repairs, or Build actions, write an explicit checkpoint.
After any interruption or context compaction, read `../recovery.md`, run `route_state --action
reconcile --project-root <project>`, and resume only from its `next_action`. The snapshot is evidence
of intent; files and check results remain the authority.

### Durable stage map

| state | update / completion predicate | recovery entry |
| --- | --- | --- |
| `environment` | explicit checkpoint after Distribution, project, credentials, Runtime Profile, selected programs and all health checks are ready | `hypit paths --json` / `hypit runtime up` |
| `reference-prepared` | checkpoint after `prepare_reference` reports ready `state.json` | `prepare_reference` or `route_state reconcile` |
| `reference-observed` | explicit observer checkpoint; all required observation answers are complete | `observe_reference` / `record_observation` |
| `vocabulary-checked` | Run-scoped vocabulary inspection and the frozen `.hypit/component-fit.json` are both persisted | `inspect_svml_vocabulary --run <run>` |
| `source-authored` | explicit checkpoint naming `main.svml` (and Recipe/Run when available) | `hypit check <run>` |
| `package-ready` | every project-owned package under `packages/` has a real Surface/Producer/Fragment and is used by the compiled Graph | `validate_local_author_packages --run <run>` |
| `script-checked` | every caption Cue has at most four visible words | `validate_script_cues --run <run>` |
| `graph-checked` | `preview_check` returns `sound: true` after package and Cue gates | `preview_check <run>` |
| `layout-checked` | `layout_check` executed and every candidate was repaired or explicitly accepted | `layout_check --run <run>` / `layout_accept` |
| `review-planned` | `reconstruction_check` writes a plan | `reconstruction_check <run>` |
| `preview-rendered` | render output and timing sidecar both exist | `render_element --batch <round.json>` |
| `comparison-complete` | comparison log contains a complete record for the planned element | `compare_reconstruction` / `record_observation` |
| `repairs-complete` | explicit checkpoint after applying comparison findings | edit Source, then rerun the checks |
| `final-checked` | final `reconstruction_check` returns `passed: true` after all gates | `reconstruction_check <run>` |
| `build-complete` | explicit checkpoint after the durable Build record is accepted | `hypit build` (confirm cost first) |

The numeric `current_step` is only a cursor; `reconcile` starts at the first unmet predicate. It never
infers the observer's creative judgement or a repair from file presence alone.

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

When working in this checkout, create the independent project at
`<checkout-root>/projects/<video-name>-reverse/` (use a safe slug). Use a directory the author named
only if they explicitly named one. Give it a `package.json`
with the runtime-safe minimum `{ "name": "<project-name>", "version": "0.0.0", "private": true, "type": "module" }`.
`hypit check`, `plan`
and `build` find the package root by walking up from the project until a `package.json` appears, so
this file is what stops that walk at the project and lets the project's `packages/<slug>/` resolve. It
matches no `pnpm-workspace.yaml` glob, so it enrolls the directory in nothing.

**Read now:** `../runtime.md` — the hard boundary between a project and a Distribution.

### 3. Load credentials

Check `<checkout-root>/.env` first, then `<project-root>/.env` if present, and load each before
credential probing (the project file overrides duplicate names):

```bash
set -a
[ ! -f <checkout-root>/.env ] || . <checkout-root>/.env
[ ! -f <project-root>/.env ] || . <project-root>/.env
set +a
```

If the loaded variables satisfy the selected observer/Provider, continue without asking the author
for them again. HypiHub OAuth is the default; only configure an author-owned key when explicitly requested.

**Read now:** `../credentials.md` — which variables each Provider needs. A variable a Provider needs
and this machine does not hold is named. If HypiHub OAuth is not configured, complete that login before
continuing; do not use `agent` to bypass the environment gate.

Create the project's `hypit.runtime.json` now with at least the local media and HypiHub WhisperX endpoints,
then select and start it before reference preparation:

```bash
hypit runtime use hypit.runtime.json
hypit runtime up
```

Step 15 completes the same Profile with every capability reached by the authored Source; it does not
create the first Profile after transcription has already needed one. Checkpoint `environment` only
after this preliminary Profile and the selected credentials are ready.

### 4. Read the observer guidance

**Read now:** `observers.md`, down to and including "Say which path is running" — the cost of each
observer, the credential decision table, the disclosure the author is owed, and the rule that one
reference has one observer for its whole life.

### 5. Use the default Gemini observer

`observers.md`'s "Choosing" section holds the credential checks and disclosure. Environment setup has
already completed the credential flow. Use `gemini` by default; use `agent` only after an explicit user
request.

### 6. Say which observer is reading

One line, before any evidence starts.

---

## Phase 1 — Evidence, with reading alongside

### 7. List installed vocabulary

```bash
hypit-reference-video-tools list_svml_packages
```

It resolves project-owned packages from the working directory (or the directory named by
`--package-root`) and resolves installed `@hypit/*` packages from the active Hypit Distribution
fallback. `--package-root` never replaces that Distribution root, so no `npm link` or package self-link
is needed. This is instant and may run before or during the sweep.

### 8. Prepare the reference

```bash
hypit-reference-video-tools prepare_reference --video-path <path or link> --observer gemini|agent
```

`--video-path` takes a link as readily as a path. The result names the link it fetched under
`source_url`, which is the only record of which video was reconstructed once the bytes are on disk.

Verify the HypiHub WhisperX model answers its model-card probe before running this. The selected
Runtime Profile and OAuth credential are the source of truth; `../environment.md` says how and
`../host-setup.md` covers the local fallback's failure branches.

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
inspected is a system you are about to invent. Apply `../vocabulary.md`'s shared fit judgement, write
the concise canonical `.hypit/component-fit.json`, and checkpoint `vocabulary-checked` as
`in_progress` before developing any gap. A small accepted variance belongs in that file; it is not a
reason to copy or modify an installed package.

### 14. Develop a project-local package, only for a proven gap

**Read now:** `../local-author-package.md`, completely.

**Done when:** the package has a real Manifest, Types, Producers, Validators, Surface, decoder,
Fragment, activation, README and preview, and `validate_local_author_packages --run <build.svrun>`
reports that the Source imports and compiled Graph uses it. A component that merely loads is not done.
If no gap remains, remove unused project-owned package directories.

---

## Phase 3 — Author, check, wire

### 15. Write the sources and complete the Runtime Profile

Write `main.svml`, `recipes.svs` and `build.svrun`, then extend the existing `hypit.runtime.json` with
every capability those Sources reach. The Runtime Profile is part of the deliverable: without it the
first thing the author meets is `RUNTIME_CAPABILITY_UNBOUND`.

Author the Source before validating project-local packages: `package-ready` can only be completed
after `main.svml` and `build.svrun` compile a Graph that actually uses each package. Now persist the
Run-scoped half of the frozen vocabulary decision. This completes
`vocabulary-checked` only when `.hypit/component-fit.json` remains valid:

```bash
hypit-reference-video-tools inspect_svml_vocabulary --package @hypit/<name> [--package …] \
  --run build.svrun
```

**Read now:**

- `final-sources.md` — Segment boundaries, the forced seam, and take durations from `estimate:Speech`.
- `../script-time.md` and `../playbooks/craft/captions.md` — every captioned passage must be split
  with `||`, normally every 3–4 spoken words; do not rely on renderer wrapping.
- `../authoring.md` — never invent a component, attribute, child, port, Recipe property or literal
  value, and how an accepted Record is reused in the Run Source.
- `../playbooks/craft/captions.md` — Cue breaks, the Recipe keys, and what recomputes when speech
  changes.
- `../playbooks/craft/persona-and-audio.md` — one voice sample per person, and the identity anchors
  that make step 23 cheap.
- `../playbooks/index.md` and the craft files it names for the systems this reference actually
  contains. Those conditions can only be evaluated now, with the evidence in.

Do not author one source fragment per shot.
Before `hypit check`, run `validate_script_cues --run <build.svrun>`; every Cue must contain at most
four visible words and use `||` between complete Alignment Units.

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

### 17. Create the comparison plan

Run `layout_check --run <run>` first and settle its candidates. **Read now:** `../layout-checks.md`.
Mechanical measurements only point the Agent toward relationships worth judging; the reference and
design intent decide whether any crop, offset or overlap is a problem. Then run
`reconstruction_check` once to persist the element/window plan. Do not invent a render list from
the Source; the check's plan is the durable handoff to the comparison round.

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

`comparison-round.md` uses preview-mock estimate timing; `--reference-id` selects comparison evidence, not mock timing.
The program is realized and drawn once into one mp4 and entries are cut from it serially, so render
the whole list in one `--batch` call; the batch does not run concurrent preview staging workers.

Keep `.hypit/layout-check.json` beside the round. Its realized stable-state measurements remain
candidate evidence; the reference and observer/Agent intent judgement remain authoritative.

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

### 23. Apply the author's requested change

Read what you wrote and change it to what they asked for at the start. The identity of each recurring
person and product is already a single anchor, because `../playbooks/craft/persona-and-audio.md` and
`../playbooks/craft/visual-continuity.md` required that while you were writing.

If the author requests a change after seeing the preview, leave this route and follow
`../revision/route.md`; do not pay or Build a source that has not passed the final deterministic gate.

### 24. Re-run the final deterministic gate

After any requested change (or when there was none), run `reconstruction_check` again and require
`passed: true`. This is the last source/graph gate before the paid handoff.

If the initial request includes batch variants, enter `../variant-expansion/route.md` from this
checked, adapted base now. The variant route defaults to source delivery; do not Build the base first
unless the author explicitly requested it.

### 25. Studio confirmation and paid handoff

**Read now:** `../runtime.md` and `../studio-confirmation.md`. Before realizing the preview-mock Run,
disclose the selected Provider and credential source for every paid capability. Credentials must already
be usable from the completed environment gate; if not, stop and return to environment setup. Realize the preview-mock Run first, then start Studio with
the returned temporary `preview.svrun` (never the original unresolved Run), show the complete
estimate-timed mock, return the exact URL printed by Studio, and obtain explicit acceptance and cost approval. If the author declines, enter
`../revision/route.md` and do not Build. Once accepted, submit the paid Build and persist its accepted
Build-Record Run; start Studio for that accepted Run, return the exact URL printed by Studio, while
the HyperFrames/final render proceeds concurrently.

After acceptance, continue with `../runtime.md` for the approved paid Build and retrieval lifecycle.

When the accepted full video is available, a later request such as moving an element or raising
captions is a new revision request. Start `revision_state` against the accepted-material Run and
follow `../revision/route.md`; after its deterministic gates, Studio may hot-reload (or be started for the
Run if none is running), but Revision still performs no VLM/visual review.
