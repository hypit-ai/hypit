# Post-completion natural-language revision route

When a completed reconstruction or description project receives a request such as “move this element
right” or “raise the captions”, start a separate revision route. Do not edit the rendered MP4, PNG,
WAV, preview mock or Artifact directly. The source remains authoritative.

## Recovery and state

Read `SKILL.md`, `recovery.md`, the parent `.hypit/route-state.json`, the project's
`.hypit/revision-state.json`, and `git status`. Start the state once:

```bash
hypit-reference-video-tools revision_state --action start \
  --project-root <project> --run build.svrun --parent-route description \
  --request 'raise the captions slightly'
```

The snapshot is atomic and small. It records the parent route/state digest, request summary, impact
and affected Source, durable artifact references, decisions, current stage and `next_action`.
Use `revision_state read` and `revision_state reconcile` after interruption or context compaction;
never resume from chat memory. Manual intent mapping and Source edits require an explicit checkpoint.
Machine evidence may advance only when its file/check predicate is true.

Stages are:

```text
request-captured → impact-assessed → intent-mapped → source-updated
→ gates-checked → preview-rendered → review-complete → final-checked
→ revision-complete → build-complete (only if paid generation changed)
```

`preview-rendered` and `review-complete` are not required work in this route. `review-complete` is
deliberately not a VLM/observer step. Revision does not call
`review_element`, `compare_reconstruction`, Vertex, WhisperX or any other visual observer. Mark that
stage only as an explicit mechanical checkpoint when the requested source change has been covered by
the deterministic checks. Revision itself performs no visual judgement; after it completes, if no
Studio session is running for the current Run, start Studio and show the author the updated result.

## Work sequence

1. Read the current `main.svml`, `recipes.svs`, `build.svrun`, runtime profile, brief and the target
   package README/vocabulary. Recover the target element's role in the author's intent.
2. Classify the request's impact: geometry/style, Script/semantic timing, graph structure, or paid
   generation. Record the affected Source files and the smallest invalidated graph closure.
3. Map natural language to the authoritative field before editing. “字幕往上一点” is a
   Frame/Placement/Recipe/Style change; a changed line is a Cue/SemanticTake/timing change; a new
   component is a vocabulary-gap and package change. A Hook or opening change also requires checking
   that later beats still fulfil its promise.
4. Edit only Source, Recipe or Run. Re-run package/Cue gates, `hypit check`, `preview_check`, and the
   route-specific final check. Do not render, compare, review or inspect any frame during revision;
   existing unchanged artifacts may be reused by digest. Once the gates pass, follow
   `studio-confirmation.md`'s conditional Studio handoff.
5. Check the final gate. Confirm cost again only when an image/video/voice generation input changed;
   geometry and layout revisions do not trigger a paid Build. Build only after explicit approval.

Revision never edits or regenerates mock media. If a later, explicit Studio session previews the
updated Run, that session must continue using the existing SVRun-native preview-mock path; never
revive `make_placeholder`, hand-written SemanticTracks, or absolute-path mock Candidates.
