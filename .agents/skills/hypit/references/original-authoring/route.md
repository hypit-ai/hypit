# Making a video from a description

Read a step, do it, read the next one. Each step names the files it needs; read those at that step.

This route produces a complete video program from what the author says they want: `main.svml`,
`recipes.svs`, `build.svrun` and the `hypit.runtime.json` that binds what they demand — wired, then
built once into a delivery.

The counterpart route is `../reconstruction/route.md`, which starts from a video to copy. Everything
between the two — what a picture is, what one generation owes another, which package owns an element
— is the same work and is written once, in the files these steps link. This page owns the order.

**This route spends.** One Build generates the pictures, the takes, the speech and the render, and
step 13 is where the author says yes to it. There is no reference to check against, so the two things
a reconstruction gets for free have to be decided deliberately: what the program is *for*, and what
every appearance value *is*. Neither has an evidence file to consult. Write them down rather than
discovering them at render time.

## Checkpoint and recovery

Start the project snapshot after creating the project directory:

```bash
hypit-reference-video-tools route_state --action start --project-root <project> \
  --route description
```

Route tools update machine-owned stages after successful checks, renders, and reviews. Record an
explicit checkpoint after brief decisions, Source edits, repairs, and Build actions. After any
interruption or context compaction, read `../recovery.md`, run `route_state --action reconcile
--project-root <project>`, and continue only from its `next_action`.

### Durable stage map

| state | update / completion predicate | recovery entry |
| --- | --- | --- |
| `environment` | explicit checkpoint after Distribution, project and credentials are selected | `hypit paths --json` |
| `brief-frozen` | explicit checkpoint naming the frozen brief, audience, format and claims | return to the brief checkpoint |
| `vocabulary-checked` | vocabulary inspection is persisted for the Run | `inspect_svml_vocabulary --run <run>` |
| `package-ready` | every `packages/local-*` package has real Surface/Producer/Fragment and is used by the compiled Graph | `validate_local_author_packages --run <run>` |
| `script-checked` | every caption Cue has at most four visible words | `validate_script_cues --run <run>` |
| `source-authored` | explicit checkpoint naming `main.svml` (and Recipe/Run when available) | `hypit check <run>` |
| `graph-checked` | `preview_check` returns `sound: true` after package and Cue gates | `preview_check <run>` |
| `review-planned` | `authoring_check` writes a plan | `authoring_check <run>` |
| `preview-rendered` | render output and timing sidecar both exist | `render_element --batch <round.json>` |
| `review-complete` | review log contains a complete record for the planned element | `review_element` / `record_review` |
| `repairs-complete` | explicit checkpoint after applying review findings | edit Source, then rerun the checks |
| `final-checked` | final `authoring_check` returns `passed: true` | `authoring_check <run>` |
| `build-complete` | explicit checkpoint after the durable Build record is accepted | `hypit build` (confirm cost first) |

The numeric `current_step` is only a cursor; `reconcile` starts at the first unmet predicate. It never
infers a creative brief, conformance judgement or repair from file presence alone.

## A description is the whole request

The author gives what the video should be — its subject, its length, its audience, who is in it, what
it says. The working directory, the project location, which packages to use, which generator, which
model tier and how many takes are **yours to decide rather than to ask for**.

---

### 1. Select the Distribution and place the project

**Read now:** `../environment.md` — the three independent places, Distribution selection and the
launcher substitution rule. `../runtime.md` — the hard boundary between a project and a Distribution.

The project gets its own directory outside the installed Distribution, normally `<home>/<name>/`,
named after the video, with a `package.json` carrying a name and `"private": true`.

### 2. Load credentials

```bash
set -a && source .env && set +a
```

**Read now:** `../credentials.md` — which variables each Provider needs.

### 3. Ask what the description leaves out

What is missing from a description is usually the duration, the aspect ratio and the language. Ask
those together, once. Ask about the video and nothing else.

Freeze the answers along with the Script's meaning, the format, the supplied assets and the factual
claims before any prompt is written. Everything downstream is measured against them.

### 4. Read the craft this program needs

1. Every craft file named in the first item of `../playbooks/index.md`'s required load order, in the
   order it gives them.
2. The format. `../playbooks/index.md` lists them; read the one that fits and only the additional
   craft files its own footer names.

### 5. Choose the packages

**Read now:** `../vocabulary.md` — which installed packages own the systems this program contains,
and whether any is genuinely missing. That file states why a system nobody inspected is one you are
about to invent, and this route is where that is easiest: there is no reference to contradict you.

For a proven gap, read `../local-author-package.md` completely and build the package.
Inspect the candidate packages now with `inspect_svml_vocabulary --package …` (without `--run`;
the Run is created in step 7). For a proven gap, build the package and keep it ready for the
Run-scoped validation after all four source files exist. Do not treat an import or an empty package
as proof that the vocabulary gap is solved.

### 6. Write the Script

The Script comes first and the shots come out of it: a Segment is what one `whisperx:SemanticTake`
aligns one Take to, so how the Script is cut decides how many generations there are and where the
seams fall.

**Read now:** `../script-time.md` — where a Segment ends, where a forced seam goes, and why each
take's duration comes from `estimate:Speech` rather than from the duration the author asked for.

Hard layout gate: captioned speech must use `||` Cue breaks in the Script, normally every 3–4 spoken
words. A long Segment without breaks is not acceptable; it becomes one overflowing Cue.

Give every planned shot one job — hook, context, evidence, mechanism, reaction, payoff, transition,
or CTA. Delete shots with no distinct job.
Draft every Cue with `||` between complete Alignment Units, normally every 3–4 visible words. The
Run-scoped mechanical check happens after `build.svrun` is created in step 7.

### 7. Write the four sources

`main.svml`, `recipes.svs`, `build.svrun`, `hypit.runtime.json`. Write all four before building any
of them; the Runtime Profile is part of the deliverable.

**Read now:** `../authoring.md` — the syntax authority, the check set, and how an accepted Record is
reused in the Run Source. `../runtime.md` — how to author a Profile.

Now run the persisted, Run-scoped gates before `hypit check`:

```bash
hypit-reference-video-tools inspect_svml_vocabulary --package <name> [--package …] --run build.svrun
hypit-reference-video-tools validate_local_author_packages --run build.svrun
hypit-reference-video-tools validate_script_cues --run build.svrun
```

`validate_local_author_packages` proves that every `packages/local-*` package has a real
Surface/Producer/Fragment and is used by the compiled Source Graph. `validate_script_cues` rejects
any Cue over four visible words; split it with `||` before continuing.

### 8. Check, then prove the graph traces

`../authoring.md`'s check set proves the sources are legal, which is a narrower claim than the graph
tracing. `../preview.md` proves the Run traces before a Provider is reached. Neither is bounded by any
attempt ceiling: a graph that does not trace is work that is not done.

### 9. Ask the check what to render, then render it

```bash
hypit-reference-video-tools authoring_check projects/<name>/build.svrun
```

Its `plan` is the list: each entry an element and a word range, with the reason. Feed it to
`render_element --batch` — the program is drawn once and every entry is cut out of those frames.

Keep the check JSON's `layout_geometry` with the renders. It is the deterministic Canvas/Frame report
for centre offsets, frame capacity, and containment; the reader still decides whether the visible text
or marks fit the intent and whether any bleed is deliberate.

**Read now:** `../element-review.md` — what the three rules are and why the list is what it is.
`../preview.md` holds `render_element` itself.

Render the whole set before reading any of it. Studio is also free and is for the author to look at;
it is not the picture this round reads.

### 10. Read each element against what you asked for

**Read now:** `conformance-round.md` — what the element is judged against, the
`--intent-file` it is judged with, and what the reader is asked.

One subagent per picture where the harness has them, dispatched together, and never opened by you.

### 11. Repair against what the round returned

Inside the two ceilings `../element-review.md` sets, in the dependency order it gives. A repair aimed
at something the round did not name is thrashing and earns no attempt.

### 12. Close the pre-Build work on the check

```bash
hypit-reference-video-tools authoring_check projects/<name>/build.svrun
```

**Done when:** `"passed": true`. It refuses while any drawing element has never been looked at, while
any stretch of the Script has nothing drawing a full frame over it, and while any timed picture is
configured to empty its window.

### 13. The Build

Confirm credentials, the Runtime Profile, the installed packages, model limits, resolution and
Endpoint prerequisites. Run `doctor`, `check` and `plan`.

`plan` is what makes the cost sayable. **Say what the Build will cost and get the author's yes before
submitting it.** This is the one point on this route where their money is spent.

**Read now:** `../runtime.md` — submitting the Build, `status`, `inspect`, and `get` for the finished
Artifact.

### 14. Ask whether the package outlives the video

If this job produced a project-local package, `../package-promotion.md` says how to judge whether it
should leave the project and what promoting it costs.

---

When a step here grows past three sentences that are not links, its content belongs in a file of its
own, or in the shared file it should have linked.
