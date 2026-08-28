---
title: Hypit Skill Architecture
description: How the Hypit skill turns descriptions and reference videos into checked projects.
---

# Hypit Skill Architecture

This document is the maintainer's map of the Hypit skill. The skill is an agent-driven production
workflow: the agent makes creative decisions, and repository tools turn those decisions into
SVML/SVS/SVRun, check the resulting graph, persist evidence and resume safely after interruption.

The important distinction is:

- the agent decides what the video means, what it should look like and what to change;
- tools decide whether the written project is legal, wired, covered, measurable and recoverable;
- a visual observer reports differences, but the agent decides whether a report is a real defect.

## How a request becomes a video

```text
user request
  → route selection
  → intent/reference evidence
  → format and vocabulary decisions
  → Author Source + Recipe Source + Run Source + Runtime Profile
  → graph/package/Cue/layout gates
  → preview materialization and visual comparison (creation routes)
  → repairs and repeated gates
  → final deterministic gate
  → Studio confirmation
  → explicitly approved paid Build
```

The result is a complete video because the route does not stop at writing a prompt or a component:
it creates the Script and timing, connects every visual/audio Track to a Film, declares every external
generation in the Run, checks that the graph reaches the requested Target, and only then hands the
same Run to Studio or Build.

## Route selection and handoffs

| User input | Route | What it owns | Handoff |
|---|---|---|---|
| Description, topic, brief or named format with no reference video | `original-authoring` (original authoring) | Intent, Hook, Script, visual design and complete new project | Final gate → optional `variant-expansion`; later natural-language change → `revision` |
| Reference video or link, optionally “use my presenter/product/brand” | `reconstruction` (reconstruction) | Reference evidence, shot structure, matching Source, then the requested initial adaptation | Final gate → optional `variant-expansion`; later natural-language change → `revision` |
| Natural-language change to a completed project or completed variant | `revision` (revision) | A bounded Source/Recipe/Run edit and deterministic revalidation | Completed revision → optional `variant-expansion` or Studio/Build |
| N independent versions from a validated project | `variant-expansion` (variant expansion) | Global format/component plan, package gaps, copy-first projects and child-agent scopes | Each child → `variant-complete`; later manual change to one child → `revision` |

The initial presenter/product/brand change attached to a reconstruction remains inside reconstruction;
it is not routed through Revision. Revision begins only when the user later asks for another change.

## Shared phases

### 1. Environment and durable start

The agent selects the Distribution, independent project directory, Runtime Profile, credentials and
(for reconstruction) the observer. It starts the appropriate state machine before authoring:

```bash
hypit-reference-video-tools route_state --action start --project-root <project> --route description
hypit-reference-video-tools route_state --action start --project-root <project> --route reconstruction
```

The Runtime Profile is written before any command that needs a managed capability. `hypit runtime use`
selects it and `hypit runtime up` prepares the local Worker/programs. This prevents later reference,
preview or Build steps from failing because the execution environment was never declared.

### 2. Establish intent or reference evidence

For original authoring, read `brief-intake.md`, inspect semantically relevant complete projects under
`examples/`, recover their intent rather than copying their Source, select the format playbook and
freeze `.hypit/brief.json`. The brief records audience, Hook, narrative progression, visual/audio/text
relationships, claims and unresolved decisions.

For reconstruction, prepare the video and cache its bytes and whole-reference evidence:

```bash
hypit-reference-video-tools prepare_reference --video-path <file-or-link> --observer <observer>
hypit-reference-video-tools observe_reference --reference-id <id>
```

Preparation supplies media metadata, transcript/alignment and the reference observation envelope.
The observation sweep supplies persistent systems, people/voices, visual type and sound context for
the whole video. Shot observations and narrow questions resolve structure that cannot be safely
inferred from one frame. These artifacts are why reconstruction can produce a whole video rather
than only imitate one screenshot.

### 3. Choose format and vocabulary before Source

The main agent reads `playbooks/index.md`, the selected format and its linked craft documents. It
enumerates the visual/audio systems and runs:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <candidate> [--package ...]
hypit-reference-video-tools inspect_visual_contract
```

`inspect_svml_vocabulary` is the public contract for what an installed Surface accepts. The visual
contract describes Visual Element shapes, admitted styles, enum values and seal invariants. The agent
records one concise component-fit decision per system in `.hypit/component-fit.json`: reuse an existing
package, reuse it with a small accepted variance, or develop a project-local package. Installed
package source is not needed for ordinary authoring. Only a confirmed close-sibling copy may read the
copied package's necessary role files.

If there is a real gap, the package route runs before dependent Source is accepted:

```text
gap-confirmed → guidance-loaded → types-frozen → implemented
→ vocabulary-inspected → package-validated → graph-checked
→ layout-checked → package-ready
```

The package agent uses `local-author-package.md`, the public contract and the minimal fixture. It must
expose a Manifest, Surface, Fragment, Producer, Validator, activation and preview, and it must be
imported and used by the project graph. `validate_local_author_packages` is the package gate.

### 4. Author the four project sources

| File | Responsibility |
|---|---|
| `main.svml` | Script, narrative, component declarations, prompts and semantic timing references |
| `recipes.svs` | Style, appearance, playback, layout and other recipe values |
| `build.svrun` | Author binding, Candidates, satisfactions and Targets |
| `hypit.runtime.json` | Runtime packages, Providers, credentials and local execution |

The Script is written before shot-level generation: Segments define Take boundaries, Cues keep
captioned speech readable, and `estimate:Speech` provides deterministic timing. Source declarations
make each generation and graph edge explicit, so later checks can identify exactly what is wrong.

### 5. Deterministic graph and layout gates

Before visual comparison, the route runs:

```bash
hypit-reference-video-tools validate_script_cues --run <run>
hypit check <run>
hypit-reference-video-tools preview_check <run>
hypit-reference-video-tools layout_check --run <run>
```

These gates answer different questions:

- package/Cue checks prove project packages and Script boundaries are usable;
- `hypit check` proves Source syntax, references and graph structure;
- `preview_check` proves tracks trace through packages to the Film;
- `layout_check` realizes the actual composition in a hidden browser and reports candidate geometry
  findings such as internal vertical offsets, parent/Canvas overflow and settled top-level overlap.

Layout findings are evidence for the agent, not automatic truth. The agent repairs genuine problems or
records an intentional geometry decision with `layout_accept`, then reruns `layout_check` until all
candidates are resolved or accepted. A relevant Source, Recipe, package, font or runtime change
invalidates affected evidence.

The two extraction rules used by both creation routes are:

| Check | Extraction rule | Why |
|---|---|---|
| Visual review | For each distinct visual declaration/style change, take the **full clip at its first appearance**. | The full clip preserves entrance, movement, exit and transient visual differences. It avoids rechecking every caption text or timestamp when the visual declaration is unchanged. |
| Mechanical layout | For each `Present`, take one frame from its **longest stable interval**. | A settled frame measures actual DOM geometry without mistaking normal animation for overflow or offset. |

Do not swap these rules: visual review judges the complete clip against the brief or reference, while
`layout_check` only measures realized layout and returns candidates for the Agent. Content/time extremes
are not additional selection rules; stable overflow is found in the per-`Present` measurement, and
transient or media-internal problems remain visible to the full-clip review.

### 6. Creation-route visual review and repair

Original authoring calls `authoring_check`; reconstruction calls `reconstruction_check`. Each command
reads Source and creates the visual-review plan described above. The longest-stable-interval sample
belongs only to the separate hidden-browser `layout_check`, not to this visual review.

For each plan entry:

```text
render_element → rendered preview/mock artifact → visual observer/reviewer
→ record findings → agent repairs Source/Recipe/package choice → rerun gates
```

Reconstruction compares the rendered element against the prepared reference with
`compare_reconstruction`; original authoring uses `review_element`/`record_review` against the frozen
brief. The observer reports visible differences. The agent decides which are defects, intentional
design or an incorrect component-fit decision. It never copies or edits an installed package to force
a match. After repairs, the plan and mechanical gates are rerun until the final check passes.

### 7. Final gate, Studio and Build

`authoring_check` or `reconstruction_check` is the final deterministic gate. It requires package/Cue,
graph, layout and review/comparison evidence to be current. Only after it passes does the agent use
`studio-confirmation.md` to materialize the estimate-timed preview and show the live Run in Studio.
Studio acceptance is separate from visual comparison and confirms the intended structure before
spending. `hypit build` is submitted only after explicit cost approval.

## Route workflows

### `original-authoring` (original authoring)

```text
environment → brief-frozen → examples/format/craft decisions
→ vocabulary/component-fit → package-ready → Script and four sources
→ script-checked → source-authored → graph-checked → layout-checked
→ review-planned → preview-rendered → review-complete → repairs-complete
→ final-checked → Studio confirmation → optional Build
```

This route turns an open-ended description into a complete program by freezing the intended viewer
result first, choosing a format and package vocabulary second, then writing every semantic and graph
edge needed by the Film. It has no reference video, so `brief.json` is the authority for later review.

| Step | Agent work | Tool or document | Durable result and reason |
|---|---|---|---|
| 1. Start | Choose the Distribution, project directory, runtime and credentials; start the route snapshot. | `environment.md`, `runtime.md`, `route_state start`, `hypit paths`, `hypit runtime use/up` | A runnable project and a recovery cursor exist before authoring begins. |
| 2. Make the request executable | Turn the description into audience, Hook, promise, beats, claims, speakers and visual/audio/text relationships. Inspect complete semantic examples; do not copy their Source. | `brief-intake.md`, `examples/` | `.hypit/brief.json` freezes what “correct” means, so review has a target instead of a vague “looks good”. |
| 3. Freeze format and craft | Select the matching playbook and load its required craft documents. | `playbooks/index.md`, `formats/*.md`, linked `craft/*.md` | The program gets a timing model, shot grammar, caption rules and visual continuity rules. |
| 4. Fit components | Enumerate candidate packages, inspect their public vocabulary and decide reuse, accepted variance or a local package. | `list_svml_packages`, `inspect_svml_vocabulary`, `inspect_visual_contract`, `vocabulary.md`, `component-fit.json` | Every visual role has a legal Module/Tag/Recipe contract before Source is written; a real gap is solved once through `local-author-package.md`. |
| 5. Write the Script | Split the narration into Segments/Takes and short Cues; assign each shot one job and keep timing semantic. | `script-time.md`, `authoring.md` | `main.svml` contains the complete spoken/text progression and deterministic `estimate:Speech` timing. |
| 6. Wire the project | Author `main.svml`, `recipes.svs`, `build.svrun` and `hypit.runtime.json`; declare each generation, Track, Candidate, satisfaction and Target. | `authoring.md`, `runtime.md` | The Film graph is explicit and reproducible rather than a prompt plus disconnected assets. |
| 7. Prove sources and graph | Run package, Cue, syntax, graph-trace and realized-layout gates. | `validate_local_author_packages`, `validate_script_cues`, `hypit check`, `preview_check`, `layout_check` | The project is legal, every Track reaches the Film, and browser geometry has been measured before visual review. |
| 8. Plan the visual review | Ask the route check for one full clip at the first appearance of each distinct visual declaration/style change. | `authoring_check` | `.hypit/evidence/` records exactly what must be reviewed; the agent does not omit a style change or invent a render list. The longest stable sample is produced separately by `layout_check`. |
| 9. Render and review | Materialize the planned preview/mock clips, read every entry against the frozen brief, and record findings. | `render_element`, `review_element`, `record_review`, `element-review.md`, `conformance-round.md` | Each visual system has explicit evidence, including text fit, coverage, contrast, motion and geometry. |
| 10. Repair and close | Repair only confirmed issues, rerun affected gates and review entries, then run the final route check. | `layout_accept` when geometry is intentional; `authoring_check` | `final-checked` means no required visual review, graph, package, Cue or layout evidence is stale. |
| 11. Hand off | Create the estimate-timed preview-mock Run, show Studio, disclose cost and Build only after approval. | `preview-mock.md`, `studio-confirmation.md`, `hypit plan/build/status/inspect/get` | Studio sees the live Film graph; the paid Build reuses the checked Run and produces the complete delivery. |

### `reconstruction` (reconstruction)

```text
environment → reference-prepared → reference-observed
→ examples/format/craft decisions → vocabulary/component-fit → package-ready
→ Script and four sources → script-checked → source-authored → graph-checked
→ layout-checked → review-planned → preview-rendered → comparison-complete
→ repairs-complete → final-checked → initial-adaptation → final check again
→ Studio confirmation → optional Build
```

The reference is converted into durable evidence, not kept in agent memory. Observations define
people, persistent systems, shot boundaries, words and visual relationships; the Source recreates
those as Segments, Takes, Tracks and Film edges. The comparison round checks rendered results against
the corresponding reference stretches. That evidence/author/repair loop is what makes the route
capable of rebuilding the entire video.

The reconstruction order is deliberately different from a description-only job:

| Step | Agent work | Tool or document | Durable result and reason |
|---|---|---|---|
| 1. Prepare | Select the observer once, resolve a local file or download/cache a link, and start route state. | `observers.md`, `credentials.md`, `prepare_reference`, `route_state start` | A stable reference id, media metadata and observer choice prevent later turns from rereading a different file or silently changing observers. |
| 2. Observe the whole video | Run the fixed whole-reference sweep, then read its transcript/alignment, persistent systems, people/voices, visual type and sound context. | `observe_reference`, `evidence.md` | Whole-video evidence establishes what exists throughout the program; it is the basis for reconstructing every shot, not one representative frame. |
| 3. Resolve structure | Inspect shot boundaries and ask narrow questions where a single frame cannot establish an appearance value, transition or relationship. | `observe_reference --question`, `continuity.md`, `reconstruction/vocabulary.md` | Ambiguities become persisted evidence before Source is authored, so timing and continuity are not guessed from chat memory. |
| 4. Choose format and components | Read examples/playbooks, enumerate candidate packages, inspect public vocabulary and classify any real package gap. | `brief-intake.md`, `playbooks/index.md`, `list_svml_packages`, `inspect_svml_vocabulary`, `component-fit.json` | The recreated program has a legal component for each observed visual role; installed packages remain immutable. |
| 5. Build a faithful Source | Convert transcript and observations into Script Segments/Takes/Cues, then author all four sources and every graph edge. | `final-sources.md`, `authoring.md`, `script-time.md`, `runtime.md` | The source describes the entire reference timeline, including narration, overlays, B-roll, transitions, audio and Targets. |
| 6. Prove the baseline | Run Run-scoped vocabulary/package/Cue checks, syntax, graph tracing and realized layout. | `inspect_svml_vocabulary --run`, `validate_local_author_packages`, `validate_script_cues`, `hypit check`, `preview_check`, `layout_check` | No comparison is attempted until the written graph can actually produce every declared Track. |
| 7. Create the comparison plan | Determine every distinct declaration and every reference stretch it occupies; keep stable intervals and shot boundaries. | `reconstruction_check`, `comparison-round.md`, `element-review.md` | The plan covers the whole video, not only a convenient still; each item has its own reference tokens and render window. |
| 8. Render and compare | Render all planned stretches from the same Run, then submit the reference/render pairs to the selected observer. | `render_element --batch`, `compare_reconstruction --batch` | The observer reports visible differences while preserving the reference/render pairing and timing. |
| 9. Repair the reconstruction | Agent judges each finding against evidence, fixes Source/Recipe or a component decision, and never copies/edits an installed package. | `reconstruction/route.md`, `layout-checks.md`, `layout_accept` | Confirmed defects are repaired; intentional crop, overlap or offset can be documented without corrupting the package boundary. |
| 10. Recheck the faithful base | Rerun the comparison and deterministic gates until the reconstruction itself passes. | `reconstruction_check`, `preview_check`, `layout_check` | This separates “faithfully reconstructed” evidence from later author customization. |
| 11. Apply initial customization | Only now replace the requested presenter, product or brand in the completed reconstruction. Rerun the route check plus deterministic gates; differences caused by the requested adaptation are not silently treated as package defects. | `main.svml`/`recipes.svs`/`build.svrun`, `reconstruction_check`, `hypit check`, `preview_check`, `layout_check` | The reference evidence remains honest while the delivered base contains the requested adaptation. This is still reconstruction, not Revision. |
| 12. Hand off | Show the checked Run in Studio and request explicit cost approval before Build. | `studio-confirmation.md`, `hypit plan/build` | The same checked graph becomes the complete paid video; a later natural-language change routes to Revision. |

The reconstruction data flow is:

```text
reference bytes
  ├─ transcript/alignment ───────────────→ Script Segments, Cues, estimate:Speech
  ├─ whole-video observations ───────────→ people, voices, persistent visual/audio systems
  └─ shot observations and questions ────→ shot boundaries, states, relationships
                                             ↓
                         main.svml + recipes.svs + build.svrun + runtime profile
                                             ↓
                         Tracks → packages → Film → Target
                                             ↓
                         preview_check → review plan → render/compare every owed stretch
                                             ↓
                         agent repairs → deterministic gates → Studio/Build
```

That mapping is the completeness guarantee: every observed word becomes timed Script, every observed
visual/audio role becomes a Track or package-backed element, and every Track must trace to the Film
before any paid generation is possible.

### `revision` (revision)

Revision can start from a directly supplied completed project, a reconstruction, an original project,
an earlier revision or one completed variant:

```text
request-captured → impact-assessed → intent-mapped → source-updated
→ gates-checked → optional preview-rendered/review-complete
→ final-checked → revision-complete → optional Build
```

The agent locates the canonical Run and validates the existing baseline. It maps natural language to
the smallest Source/Recipe/Run field, records the affected graph closure, edits only those layers,
and reruns package/Cue, `hypit check`, `preview_check` and `layout_check`. Revision performs no VLM or
reference comparison; Studio is only a display handoff after deterministic checks pass.

| Step | Agent work | Tool or document | Durable result and reason |
|---|---|---|---|
| 1. Locate baseline | Accept a completed project directory directly or locate the parent route/variant and canonical Run. | `revision_state start`, `route_state read/reconcile`, `git status` | `request.json` and a new revision id preserve the exact baseline; Revision never invents a missing reconstruction history. |
| 2. Assess impact | Decide whether the request affects geometry/style, Script/timing, graph wiring, package choice or paid generation. | `authoring.md`, current brief, component-fit, package README | `impact` and affected Source files define the smallest graph closure to invalidate. |
| 3. Map intent | Translate natural language to an authoritative field (Cue, Frame/Placement, Style, Candidate, Target, etc.). | `revision_state checkpoint`, source and graph inspection | The change is scoped before editing, preventing a casual request from rewriting unrelated files. |
| 4. Edit minimally | Modify only `main.svml`, `recipes.svs` or `build.svrun`; update runtime/package only when capability/component truly changes. | `revision/route.md`, `script-time.md`, `layout-checks.md` | Generated media and accepted Build artifacts remain untouched; source remains the authority. |
| 5. Revalidate | Run package/Cue, syntax, graph, preview and realized-layout checks; repair or accept layout candidates. | `validate_local_author_packages`, `validate_script_cues`, `hypit check`, `preview_check`, `layout_check`, `layout_accept` | `gates-checked` proves the revision is wired and measurable without invoking a visual observer. |
| 6. Finish or hand off | Persist final evidence, optionally show Studio, and Build only if generation inputs changed and cost is approved. | `revision_state`, `studio-confirmation.md`, `hypit plan/build` | A completed revision can feed another variant batch; a later request starts a new revision id. |

### `variant-expansion` (variant expansion)

The main agent makes global decisions before any child agent starts:

```text
baseline-validated → examples-inspected → format-plan-frozen → slate-drafted
→ vocabulary-enumerated → component-plan-frozen → package-gaps-classified
→ workload-disclosed → package-gaps-resolved → slate-frozen → projects-copied
→ variants-dispatched → variants-complete → aggregate-checked
→ [build-planned → build-approved → build-complete] → expansion-complete
```

Tools and outputs are:

1. `variant_state start` records the base, count, request and delivery mode.
2. `brief-intake.md`, examples and playbooks produce `format-plan.json`.
3. The main agent writes exactly N distinct entries in `slate.json`, each with an allowed file scope.
4. `list_svml_packages` and `inspect_svml_vocabulary` produce global vocabulary evidence and
   `component-plan.json`.
5. The workload disclosure tells the author how many variants are SVML-only, medium-scope or require
   a new package. Each distinct package gap is solved once in staging and frozen by digest.
6. `variant_init` copies the base first, preserves author assets and Source, excludes generated state
   and results, injects only ready packages and creates each child route state.
7. Child agents read their copied project, brief, plans, allowed scope, assigned README/evidence and
   required playbook documents. They make the minimum change and run `validate_script_cues`,
   `hypit check`, `preview_check`, `layout_check` and `variant_check`.
8. The batch aggregate check proves every child is complete. A later manual change to one child exits
   this route and starts `revision` in that child directory.

Each child route is:

```text
baseline-copied → brief-frozen → change-scope-frozen → guidance-loaded
→ vocabulary-verified → package-ready → script-checked → source-updated
→ graph-checked → layout-checked → final-checked → variant-complete
```

The batch is intentionally “copy first, then edit”:

| Step | Main agent or child work | Tool or document | Durable result and reason |
|---|---|---|---|
| 1. Validate base | Confirm the parent creation/revision final gate and record its digest. | `route_state/revision_state reconcile`, `variant_state start` | Every child starts from the same known-good Film graph. |
| 2. Decide the slate | Inspect examples, choose each format/Format DNA, draft exactly N distinct briefs and allowed scopes. | `brief-intake.md`, `playbooks/index.md`, `format-plan.json`, `slate.json` | Creative direction is decided once globally; children do not invent incompatible formats. |
| 3. Decide vocabulary/workload | Inspect packages and public vocabulary, choose reuse/composition/new package, then disclose fast/medium/new-package counts. | `list_svml_packages`, `inspect_svml_vocabulary`, `component-plan.json`, `variant_state checkpoint` | The author knows the cost/time impact before agents start; no child discovers a package gap halfway through. |
| 4. Stage new packages | Develop each distinct local package once, validate it in staging, freeze its digest and mark it ready. | `route_state --route variant-package`, `local-author-package.md`, `validate_local_author_packages`, `preview_check`, `layout_check` | Shared package work is reused safely and cannot mutate installed packages. |
| 5. Copy the base | Clone the project with copy-on-write where possible, retain authored assets/source, remove generated state/results and old Build bindings, inject only ready packages. | `variant_init` | Each child is independent, reproducible and free of stale paid/generated artifacts. |
| 6. Dispatch bounded work | Give each child its copied project, brief, format/component plan, README/evidence and allowed scope. | child `route_state`, `variant_state` | The batch can run in parallel while each child has an auditable contract. |
| 7. Verify and edit | Child verifies vocabulary only when its component changes, edits the minimum allowed files, and runs all mechanical gates. | `inspect_svml_vocabulary --run` when needed, `validate_script_cues`, `hypit check`, `preview_check`, `layout_check`, `variant_check` | A fast SVML-only variant stays fast; scope escapes become explicit conflicts instead of silent rewrites. |
| 8. Aggregate and deliver | Reconcile unfinished children, aggregate checks, and optionally plan/approve paid Builds. | `variant_state reconcile`, aggregate report, `hypit plan/build` | 100-item batches resume only unfinished children and never repeat a paid Build after compaction. |

## JSON state machines and recovery

State is split into a current pointer and execution-scoped history so context compression never becomes
the source of truth:

| Concern | Durable location |
|---|---|
| Creation current view | `<project>/.hypit/route-state.json` |
| Creation execution history/evidence | `<project>/.hypit/routes/<route-id>/state.json`, `.hypit/evidence/` |
| Base brief and component fit | `<project>/.hypit/brief.json`, `<project>/.hypit/component-fit.json` |
| Revision current view/history | `.hypit/revision-state.json`, `.hypit/revisions/<revision-id>/{state.json,request.json}` |
| Variant batch locator | `<base>/.hypit/variant-expansions/<batch-id>.json` |
| Variant batch state | `<batch>/.hypit/variant-expansion-state.json` |
| Child/staging state | Child or staging `.hypit/route-state.json` and route history |

Every state record contains the route id, current cursor, completed steps, `next_action`, decisions,
conflicts, last command, artifact paths and artifact digests. Machine evidence is content-addressed;
manual decisions such as the brief, component fit, format plan, Slate and allowed changes are recorded
explicitly rather than inferred from files.

A route transition is always a write of evidence, not a chat assertion:

```text
agent makes a decision or edits Source
  → checkpoint records the decision and input digest
tool runs a check/render/review
  → successful output is stored at an immutable evidence path
state advances only when that output satisfies the stage predicate
  → current view + execution history are atomically updated
```

The state shape is intentionally small but explicit:

```json
{
  "version": 1,
  "route": "description",
  "route_id": "...",
  "current_step": "graph-checked",
  "completed_steps": ["environment", "brief-frozen", "source-authored"],
  "next_action": "layout_check --run build.svrun",
  "decisions": { "brief": ".hypit/brief.json", "component_fit": ".hypit/component-fit.json" },
  "evidence": [{ "kind": "preview_check", "path": ".hypit/evidence/...json", "digest": "..." }],
  "conflicts": [],
  "last_command": "hypit-reference-video-tools preview_check ..."
}
```

`checkpoint` is for an explicit agent decision or completed command; `read` is for displaying the
durable cursor; `reconcile` recomputes only machine predicates and rolls back stale evidence; and
`discover` finds a batch locator after the agent no longer remembers its directory. A stage is never
advanced merely because a file happens to exist.

The public state commands are:

```bash
# creation routes
hypit-reference-video-tools route_state --action read --project-root <project>
hypit-reference-video-tools route_state --action checkpoint --project-root <project> \
  --route <description|reconstruction> --state <stage>
hypit-reference-video-tools route_state --action reconcile --project-root <project>

# revision
hypit-reference-video-tools revision_state --action start --project-root <project> \
  --run <project>/build.svrun --request '<change>'
hypit-reference-video-tools revision_state --action read --project-root <project>
hypit-reference-video-tools revision_state --action checkpoint --project-root <project> \
  --step <stage-number> --status complete --decision '<what was decided>'
hypit-reference-video-tools revision_state --action reconcile --project-root <project>

# variant batch
hypit-reference-video-tools variant_state --action discover --project-root <base>
hypit-reference-video-tools variant_state --action checkpoint --project-root <base> \
  --batch-id <id> --step <stage-number> --status complete
hypit-reference-video-tools variant_state --action read --project-root <base> --batch-id <id>
hypit-reference-video-tools variant_state --action reconcile --project-root <base> --batch-id <id>
```

All JSON writes use a temporary file followed by atomic rename. A corrupt file is preserved and
reported, never replaced by an empty state. `reconcile` verifies each machine-step predicate, checks
parent/source/package/evidence digests, rolls stale steps back to the first unmet one and reports
conflicts. It never invents creative decisions, silently widens an allowed scope, repeats a completed
variant or resubmits a paid Build.

After interruption or context compaction, read the skill and applicable route again, discover/read the
canonical state, reconcile it, inspect conflicts, and execute only the first unmet `next_action`.
This is why the skill can run a long reconstruction or a 100-variant expansion without relying on
conversation memory.
