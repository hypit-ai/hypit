# Recovering a Hypit route after interruption or context compaction

Treat every new turn as a possible context boundary. Do not continue from the chat transcript alone.
The durable source of progress is the project's `.hypit/route-state.json`; the durable source of truth
is the artifacts and checks it points to.

## Recovery sequence

1. Read `../SKILL.md`.
2. Read the route file that matches the project.
3. Read `<project>/.hypit/route-state.json` with `route_state --action read`.
4. Inspect `git status`, the recorded artifacts, and the last command.
5. Run `route_state --action reconcile --project-root <project>` (and inspect its conflict report).
6. Re-run the first unmet check or idempotent route command named by `next_action`; package and Cue
gates must be rerun before any preview or final check.
7. Continue only after the state reports the next step explicitly.

If the snapshot is missing, start one before continuing:

```bash
hypit-reference-video-tools route_state --action start \
  --project-root <project> --route reconstruction|description|variant|variant-package --run <run>
```

Use `--route description` for original-authoring and `--route reconstruction` for reference-video
work. A project has one active route; a route mismatch is an error rather than an invitation to merge
two histories.
`variant_init` normally starts `variant`; the main agent starts `variant-package` explicitly for a
staging project after a vocabulary gap has been proven.

For batch variants, do not look for `.hypit/route-state.json` on the base and assume it names the
batch. Read `variant-expansion/route.md`, then discover the sibling batch from the base locator:

```bash
hypit-reference-video-tools variant_state --action discover --project-root <base>
hypit-reference-video-tools variant_state --action reconcile --project-root <base> --batch-id <id>
```

Read the returned canonical `<batch>/.hypit/variant-expansion-state.json`, reconcile every unfinished
`variant-package` staging route and `variant` project route, inspect conflicts, and execute only the
first unmet `next_action`. `variant_init` reuses matching initialized copies and refuses conflicting
destinations. A component/package digest change, missing inspection evidence or file outside
`allowed_changes` is a conflict, not permission to overwrite it.

For a completed project with a new natural-language change, use `.hypit/revision-state.json` and the
`revision_state` commands described in `revision/route.md`. The project may be supplied directly and
need not have a parent creation route. When a parent route snapshot exists, reconcile it together
with the revision snapshot; otherwise validate the supplied Run as the baseline and start Revision
without inventing parent history. Revision does not call VLM/observer, render, or perform visual
review; it stops after the requested deterministic gates and leaves Studio untouched.

After a completed revision, a request for many derivatives starts a new variant-expansion batch from
the revised project. Reconcile the parent route and revision state before starting the batch; do not
fold the batch into Revision.

## What the state means

The state is a small snapshot, not a transcript. It records the current route step, completed steps,
manual decisions, a short next action, and pointers to files such as `state.json`, `round.json`, render
outputs, comparison/review logs, and the final check result. Full prompts and observer prose remain in
their existing logs and are never copied into the snapshot.

Machine-owned commands update the snapshot only after their success predicate is true. Source writing,
repair, observer judgement, and Build submission are manual boundaries and require an explicit
checkpoint:

```bash
hypit-reference-video-tools route_state --action checkpoint \
  --project-root <project> --route reconstruction --state review-planned \
  --status complete --next-action 'run final reconstruction_check' \
  --decision 'caption box is intentionally centred'
```

`reconcile` never guesses a creative decision. It can advance from durable files and passing checks,
but leaves an unrecorded manual step as the next action. If a recorded artifact disappeared, the next
reconciliation moves the route back to the first step whose evidence is missing.

## Idempotency and paid work

Repeated `prepare`, preview-mock, render, comparison, and check commands must reuse their existing
caches and logs. Never submit a paid Build merely because the context was compacted: inspect the state,
verify the Build/Record evidence, and resume observation with the existing command instead.
