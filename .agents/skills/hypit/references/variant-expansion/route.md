# Variant expansion route

Use this route after a reconstruction, original-authoring or revision project has passed its final
deterministic gate, or when the author supplies an existing project that passes the same gate. It
derives exactly N independent source projects from one frozen base project. It does not reinterpret
initial reconstruction customization as Revision: presenter, product and brand changes included in
the original reconstruction request remain reconstruction step 23 work.

The default deliverable is checked Source. Do not render, visually review or submit a Build unless
the author explicitly asks for finished videos. A Build spends money and still requires a fresh cost
approval; context recovery is never approval to repeat it.

## Recovery comes first

At the start of a new turn or after context compaction:

1. Re-read `../../SKILL.md` and this route.
2. Run `variant_state --action discover --project-root <base>`.
3. Read the canonical state it reports.
4. Inspect the parent route/revision digest, `git status`, recorded artifacts and `last_command`.
5. Run `variant_state --action reconcile --project-root <base> [--batch-id <id>]`.
6. Reconcile every unfinished `variant-package` staging route and every unfinished `variant` route.
7. Stop on recorded conflicts; otherwise execute only the first unmet step named by `next_action`.

The base locator is `<base>/.hypit/variant-expansions/<batch-id>.json`; the canonical batch state is
`<batch>/.hypit/variant-expansion-state.json`. Never recover a sibling batch path from chat memory.
Batch state read-modify-write operations are serialized by a batch-local lock; variant agents update
only their own variant record so concurrent completions cannot replace one another with stale arrays.

## Batch state

Start once, after the base project is selected:

```bash
hypit-reference-video-tools variant_state --action start \
  --project-root <base> --output-root <batch-root> --run <base>/build.svrun \
  --count <N> --delivery-mode source --request '<the complete request>'
```

Use `--delivery-mode build` only when the author explicitly requested finished variants. The durable
batch stages are:

```text
baseline-validated → examples-inspected → format-plan-frozen → slate-drafted
→ vocabulary-enumerated → component-plan-frozen → package-gaps-classified
→ workload-disclosed → package-gaps-resolved → slate-frozen → projects-copied
→ variants-dispatched → variants-complete → aggregate-checked
→ [build-planned → build-approved → build-complete] → expansion-complete
```

Manual creative decisions are checkpointed explicitly. `reconcile` may confirm machine predicates,
roll missing evidence back, and report digest or scope conflicts; it never invents a Format DNA,
Slate, component choice, allowed change or cost approval.

## 1. Validate and freeze the base

The base must be a completed reconstruction, original-authoring or revision project, or an existing
project that passes its corresponding deterministic checks. Record the parent route/revision digest.
Do not Build merely to create a base for expansion.

If the request began as “reconstruct this video with my product and make 100 variants,” finish the
reference reconstruction and apply that product/person/brand adaptation inside reconstruction first.
Variant expansion starts from that adapted, checked base. Revision is used only for a later natural-
language change to an already completed project.

After an individual variant reaches `variant-complete`, a later natural-language change to that child
project leaves this route and starts `../revision/route.md` with `--parent-route variant`. The original
`allowed_changes` remains batch-production history; it does not constrain that Revision. Do not run
`variant_check` after Revision has started. Later batch reconciliation validates the immutable check
that completed the original variant and does not reinterpret Revision edits as batch scope escape.

## 2. Inspect examples and freeze format decisions

**Read now:** `../brief-intake.md`, then inspect complete projects under the checkout's `examples/`
directory when it exists. Recover intent, Hook, narrative development and the relationship between
visuals, audio and text. README clone sets are useful evidence of the intended expansion pattern, but
their Source, people, products, claims and assets are not templates.

**Read now:** `../playbooks/index.md`. Select each variant's format from its intent. Read the matching
`formats/*.md` file completely and the craft files its footer names. Keep the base format by default.
A switch among ranking, street interview, podcast or another format is a high-change variant and must
be explicit in the plan.

Persist `format-plan.json`. Each entry records the variant id, example basis and digest, playbook path,
and frozen Format DNA: Hook, narrative progression, speaker/role grammar, layout system, timing model,
caption/overlay behavior, audio relationship and what must remain invariant. Checkpoint
`examples-inspected` and `format-plan-frozen`; file existence alone does not make either decision.

## 3. Draft the Slate

Write `slate.json` with exactly N distinct, decision-complete entries. Each entry must provide at
least:

```json
{
  "slug": "short-unique-slug",
  "brief": { "direction": "the complete variant decision" },
  "component_class": "svml-only",
  "allowed_changes": ["main.svml"],
  "vocabulary": { "mode": "inherited", "packages": [] }
}
```

`component_class` is one of `svml-only`, `existing-component`, `composed-components` or
`new-package`. Use `vocabulary.mode: "inspect"` and list the assigned packages whenever a variant
switches to a package the base did not use. A validated staging package can be injected once copied:

```json
"inject_packages": [
  { "package_id": "my-component", "destination": "packages/my-component" }
]
```

The package id must name a ready package frozen in batch state; the tool resolves its recorded
`package_root` and refuses any digest mismatch. The destination must stay under the copied project's
`packages/` directory. `allowed_changes` is authoritative. A `svml-only` variant must allow exactly
`main.svml`. Add `.svs`, `build.svrun`, runtime or package paths only when the frozen decision actually
changes Recipe/Style, Graph/Target/Candidate, capability or component implementation.

Checkpoint `slate-drafted`, but do not freeze or dispatch it yet.

## 4. Enumerate vocabulary and decide package work globally

**Read now:** `../vocabulary.md`.

Before any package or variant agent starts, the main agent runs:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <candidate> [--package …]
```

Read every selected package's returned `readme_path`; never infer syntax from package source. Persist
the complete listing/inspection as the batch vocabulary evidence and write `component-plan.json`.
Classify every variant before dispatch:

- base components, SVML-only changes;
- an installed component the base does not currently use;
- a deliberate composition of installed components;
- a proven vocabulary gap requiring one project-local package.

The component plan names exact Module, Tag, relevant Recipe properties, package README and inspection
evidence. It also names which variants share each new package. Checkpoint `vocabulary-enumerated`,
`component-plan-frozen` and `package-gaps-classified`.

## 5. Disclose workload before agents start

Tell the author, without pausing by default:

- how many variants are fast `main.svml`-only work;
- how many change SVS/Run or switch/compose installed components;
- how many new packages are required, their purpose and affected variants;
- that new package development materially increases completion time;
- whether any requested delivery would invoke paid generation.

Persist the same counts and message in `workload_disclosure`, then checkpoint `workload-disclosed`.
Wait only for paid work, a material creative scope expansion, or a missing core decision.

## 6. Resolve every package gap before ordinary variants

Create one staging project per distinct gap and start:

```bash
hypit-reference-video-tools route_state --action start \
  --project-root <staging> --route variant-package --run <staging>/build.svrun
```

The package agent must read `../vocabulary.md`, `../local-author-package.md`, the assigned format and
craft documents, `../authoring.md` and `../preview.md`. Its route is:

```text
gap-confirmed → guidance-loaded → types-frozen → implemented
→ vocabulary-inspected → package-validated → graph-checked → package-ready
```

It must repeat `list_svml_packages` and `inspect_svml_vocabulary` to confirm the gap, freeze Types and
Manifest before implementation, then run Run-scoped inspection, `validate_local_author_packages` and
`preview_check`. If package assets require paid generation, obtain cost approval first.

When the route has passed through `graph-checked`, checkpoint the batch package entry with
`status: "ready"` and name the package directory as `package_root` when it is below the staging
project root. `variant_state` freezes that package tree's digest, writes package-digest evidence, and
completes the staging route's `package-ready` step. The same digest is injected into every assigned
variant; never develop the same component twice.

No dependent variant may be copied or dispatched while its package route is incomplete. Once every
gap is ready, checkpoint `package-gaps-resolved`, make all Slate decisions final, and checkpoint
`slate-frozen`.

## 7. Copy first

Run:

```bash
hypit-reference-video-tools variant_init \
  --project-root <base> --output-root <batch-root> --slate <slate.json>
```

The command creates `NNN-<slug>/` projects under the batch root. It uses copy-on-write when the
filesystem supports it and falls back to ordinary copying. It preserves authored SVML, SVS, runtime,
configuration, local packages, ordinary assets and the top-level `build.svrun`; it excludes Git and
dependency state, old `.hypit`, secrets, logs/caches, non-canonical preview/mock/accepted-material
Runs and generated result directories. Media are never excluded merely because of their extension.

Historical `<build-record>` candidates and only the `<satisfy>` declarations selecting those
candidates are removed from each copied canonical Run. Authored files, values, files, fragments,
targets and unrelated satisfactions remain. The copied state records a digest for every retained
file, writes the variant brief and `allowed_changes`, starts its `variant` route, and injects only the
validated packages assigned to that variant. Re-running `variant_init` reuses matching initialized
projects and refuses conflicting destinations.

## 8. Dispatch variant agents in bounded waves

The main agent supplies each variant agent only its copied project and fixed plan entries. The main
agent, not the child, has already chosen examples, format, Format DNA, component strategy and scope.
Checkpoint `variants-dispatched` only after the agents have actually been assigned; route-state files
created by `variant_init` are not proof of dispatch.

Every variant agent reads:

1. its copied project, `.hypit/variant-brief.json` and `.hypit/allowed-changes.json`;
2. its `format-plan.json` and `component-plan.json` entry;
3. the assigned format playbook and every craft document linked by its footer;
4. `../authoring.md`, `../script-time.md` and `../preview.md`;
5. the assigned package README and inspection evidence.

Checkpoint `guidance-loaded` after those reads. The agent does not rescan examples or replace the
format/component decision.

Vocabulary behavior is fixed:

- unchanged Module/Tag/component combination and Recipe contract may use the inherited base evidence;
- a package or component change requires `list_svml_packages`, Run-scoped
  `inspect_svml_vocabulary`, and the returned README inside the copied project;
- a claimed new gap must be returned to the main agent. The variant agent may not start package
  development or silently invent a Tag, attribute or Recipe value.

If the plan is inconsistent with installed declarations, record the conflict and stop that variant.
Do not widen scope, change format or choose another component locally.

## 9. Make the minimum change and check it

The variant route is:

```text
baseline-copied → brief-frozen → change-scope-frozen → guidance-loaded
→ vocabulary-verified → package-ready → script-checked → source-updated
→ graph-checked → final-checked → variant-complete
```

Change only the files named by `allowed_changes`:

- content, identity, product, Script and prompts in `main.svml`;
- Recipe/Style changes in `.svs`;
- Graph/Target/Candidate changes in `build.svrun`;
- capability changes in runtime;
- confirmed component changes in imports, project packages or dependencies.

Do not reformat, rename or rewrite unaffected files. Then run the package/Cue gates, `hypit check`,
`preview_check`, and:

```bash
hypit-reference-video-tools variant_check --run <variant>/build.svrun
```

`variant_check` is mechanical only. It verifies vocabulary evidence, package use, Cue lengths, source
legality, graph tracing, frame-coverage/playback facts, generated-result leakage and the digest diff
against `allowed_changes`. It reports Frame/Canvas boundary and layout geometry facts without making
a visual judgement. It never renders or invokes a VLM.

If the diff escapes `allowed_changes`, the route becomes blocked and the batch records
`scope-expansion-required`. The main agent decides whether the requested brief genuinely requires the
wider scope, atomically updates the batch variant record, baseline manifest, variant brief and
`.hypit/allowed-changes.json`, records the decision/conflict resolution in batch state, and
redispatches that variant. The three frozen scope copies must agree; a child never makes this change
silently.

## 10. Aggregate and optionally Build

As variants finish, `variant_check` updates their batch records and writes
`<batch>/.hypit/aggregate-check.json`. `variants-complete` requires every child route to be complete;
`aggregate-checked` requires every mechanical report to pass. Interrupted large batches resume only
unfinished routes.

For source delivery, checkpoint `expansion-complete` after aggregate success. For finished-video
delivery, prepare a Build plan and disclose the total cost, then checkpoint `build-planned`. Obtain
explicit approval and checkpoint `build-approved` before the first paid submission. Persist each
Build result and checkpoint `build-complete` only when all requested outputs are durable. Reconcile
the state before any retry so a context boundary never repeats a paid Build.
