# Post-completion natural-language revision route

Use this route whenever a natural-language change targets a completed Hypit project. The project may
have just finished reconstruction, original authoring, variant expansion or an earlier revision, or the author may hand
over an already completed project directory directly. Revision does not require the current agent to
have created the project and does not require a parent creation route to exist.

For a directly supplied directory, first locate its canonical Run and Source/Recipe closure, then
run `validate_local_author_packages`, `validate_script_cues`, `hypit check`, `preview_check` and
`layout_check` to
confirm the existing project is a sound revision baseline. If `.hypit/route-state.json` exists, read
and reconcile it; if it does not, do not invent a reconstruction or description history. Start
`revision_state` without `--parent-route` and persist the baseline check evidence with the first
checkpoint.

Requests such as “move this element right” or “raise the captions” start a separate revision route.
Do not edit the rendered MP4, PNG, WAV, preview mock or Artifact directly. The source remains
authoritative.

Before any revision command or project inspection, read `../environment.md` completely and finish its
environment checklist. The selected Distribution, project boundary, credentials, Runtime Profile,
selected managed programs and their health checks must all be confirmed; the HypiHub WhisperX
alignment Endpoint and its configured model must be reachable with the completed HypiHub OAuth
credential. Do not begin a revision from a
partial, installing, unhealthy or unconfirmed environment, even when the change itself appears
deterministic or the user asks to bypass setup.

## Recovery and state

Read `../../SKILL.md`, `../recovery.md`, the project's current `.hypit/revision-state.json` view, its
`.hypit/revisions/<revision-id>/state.json` history state and immutable `request.json`, `git status`, and
the parent `.hypit/route-state.json` only when one exists. Start the state once.

From a completed reconstruction or original-authoring route:

```bash
hypit-reference-video-tools revision_state --action start \
  --project-root <project> --run build.svrun --parent-route description \
  --request 'raise the captions slightly'
```

From one completed variant project, target that child directory rather than its base or batch root:

```bash
hypit-reference-video-tools revision_state --action start \
  --project-root <batch>/023-example --run build.svrun --parent-route variant \
  --request 'make the presenter framing tighter'
```

From a directly supplied completed project with no parent route state:

```bash
hypit-reference-video-tools revision_state --action start \
  --project-root <project> --run build.svrun \
  --request 'raise the captions slightly'
```

The current snapshot is atomic and small. Each start gets a new `revision_id`; its state and request
are kept under `.hypit/revisions/<revision-id>/`, so a later revision cannot overwrite the earlier
history. It records the execution-scoped parent route path/digest when one exists, request summary,
impact and affected Source, durable artifact references, decisions, current stage and
`next_action`. Use `revision_state read` and `revision_state reconcile` after interruption or context
compaction; never resume from chat memory. Manual intent mapping and Source edits require an explicit
checkpoint. Machine evidence may advance only when its file/check predicate is true.
When a gate command returns `evidence`, checkpoint that immutable path; do not point revision history
at a same-named latest-result view directly under `.hypit/`.

Stages are:

```text
request-captured → impact-assessed → intent-mapped → source-updated
→ gates-checked → preview-rendered → review-complete → final-checked
→ revision-complete → build-complete (only if paid generation changed)
```

`revision_state` checkpoints use the numeric `--step` flag, not a stage name. The mapping is:

| Step | Stage |
|---:|---|
| 1 | request-captured |
| 2 | impact-assessed |
| 3 | intent-mapped |
| 4 | source-updated |
| 5 | gates-checked |
| 6 | preview-rendered |
| 7 | review-complete |
| 8 | final-checked |
| 9 | revision-complete |
| 10 | build-complete |

For example, after editing Source, record step 4 with:

```bash
hypit-reference-video-tools revision_state --action checkpoint \
  --project-root <project> --step 4 --status complete \
  --decision "source update recorded"
```

Use the same numeric mapping for every later checkpoint; `--state` is not accepted by
`revision_state`.

`preview-rendered` and `review-complete` are not required work in this route. `review-complete` is
deliberately not a VLM/observer step. Revision does not call
`review_element`, `compare_reconstruction`, Vertex, WhisperX or any other visual observer. Mark that
stage only as an explicit mechanical checkpoint when the requested source change has been covered by
the deterministic checks. Revision itself performs no visual judgement; after it completes, if no
Studio session is running for the current Run, start Studio, capture the URL printed by the server,
and give the author the exact URL with the updated result.

## Work sequence

1. Read the current `main.svml`, `recipes.svs`, `build.svrun`, runtime profile, brief and the target
   package README/vocabulary. Recover the target element's role in the author's intent. For a
   directly supplied project, use its authored Source, project documentation and current graph as the
   frozen intent evidence; do not force it through reconstruction or original authoring first. For a
   completed variant, read the parent variant route's `variant_brief`, `format_plan`, `component_plan`
   and immutable final-check evidence. Its `allowed_changes` explains how the batch agent originally
   produced that variant, but it is not an authorization boundary for the user's later Revision.
2. Classify the request's impact: geometry/style, Script/semantic timing, graph structure, or paid
   generation. Record the affected Source files and the smallest invalidated graph closure.
3. Map natural language to the authoritative field before editing. A request such as “move the
   captions up slightly” maps to a Frame/Placement/Recipe/Style change; a changed line is a
   Cue/SemanticTake/timing change; a new
   component is a vocabulary-gap and package change. A Hook or opening change also requires checking
   that later beats still fulfil its promise.
4. Edit only Source, Recipe or Run. Re-run package/Cue gates, `hypit check`, `preview_check` and
   `layout_check`, then
   checkpoint their immutable evidence as the Revision final gate. When the parent is `variant`, do
   **not** run `variant_check`: that command belongs only to initial batch production and would
   reapply the old `allowed_changes` to a new user-authorized request. Do not render, compare, review
   or inspect any frame during revision. **Read now:** `../layout-checks.md`. Its browser measurements
   are mechanical candidate evidence rather than visual judgement; repair genuine issues or persist a
   reason for intentional geometry before completing `gates-checked`;
   existing unchanged artifacts may be reused by digest. Once the gates pass, follow
   `../studio-confirmation.md`'s conditional Studio handoff.
5. Check the final gate. Confirm cost again only when an image/video/voice generation input changed;
   geometry and layout revisions do not trigger a paid Build. Build only after explicit approval.

Revision never edits or regenerates mock media. If a later, explicit Studio session previews the
updated Run, that session must continue using the existing SVRun-native preview-mock path; never
revive `make_placeholder`, hand-written SemanticTracks, or absolute-path mock Candidates.

If the author asks for many independent derivatives after this revision is complete, reconcile and
finish `revision_state`, then start `../variant-expansion/route.md` from the revised project. The
batch is not another revision step: its main agent rechecks examples, format/component plans, package
gaps and per-variant scopes before copying or dispatching work.
