# Project files

Read this when starting, resuming, reorganizing, or handing over a video project. The layout below is
a working convention, not another Hypit format. Ordinary files remain owned by their subsystem, and
ordinary relative paths express the few relationships between them.

## Establish one production boundary

Treat one independently editable work as one Hypit project. The boundary may contain several cuts,
Generation Graphs, NLE files, exports, and production packages, but it should not be a portfolio of
unrelated productions. Related works can be sibling project roots in an ordinary Git repository.

Run commands from the production root. A small `package.json` marks that root and owns normal package
dependencies:

```json
{
  "name": "workshop-video",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "hypit": { "project": true }
}
```

For a new or existing directory, `hypit project init [directory]` creates or adds this marker and
creates a conservative `.gitignore` only when one is absent. It deliberately does not create a Graph,
Canvas, NLE, Runtime Profile, package lockfile, or central project manifest.

The CLI searches upward for a `package.json` whose `hypit.project` field is `true`. It does not turn a
component package, Runtime file, Graph, NLE file, or arbitrary working directory into a project.
Use `--project <directory>` when invoking a command from elsewhere. Relative references inside an
authored file remain relative to that file; choosing a project does not secretly rebase them.

Install project packages through the ordinary package manager and commit its lockfile. Components
created for this production normally live in `packages/` and are selected through `file:` dependencies.
Move one to its owner's npm scope only when it genuinely needs reuse across projects. The selected
Hypit Distribution supplies its official packages, but every independently distributed package used
by the production belongs in the project dependencies.

## Keep subsystem files separate

A practical project can look like this:

```text
production/
├── package.json
├── package-lock.json
├── README.md
├── BRIEF.md
├── TREATMENT.md
├── PROGRESS.md                 # optional while work is active
├── generation.graph.json       # long-running operation dependencies
├── generation.canvas.json      # optional spatial view of that Graph
├── film.nle.json               # directly editable media/effects timeline
├── media/
│   └── <asset>/
│       ├── <asset>.media.json  # Media Asset owner
│       ├── <media-file>
│       └── <representations>   # timed transcript, masks, analysis, and their resources
├── references/                 # supplied work worth reopening
├── documents/                  # scripts, copy, and other human-authored material
├── scripts/                    # explicit one-way authoring helpers
├── packages/                   # production-owned components
├── drafts/                     # unaccepted working material
├── exports/                    # viewing deliverables
├── hypit.runtime.json          # optional deployment selection
└── .hypit/                     # local execution and Result history; normally ignored
```

The names are conventional. There is intentionally no central project manifest listing every Graph,
Canvas, NLE, asset, package, and export. Each relationship belongs to its consumer:

- a Canvas names the Graph it displays;
- a Graph node names its inputs and may load a Media Asset;
- an NLE project names the Media Assets and component modules it uses;
- a Media Asset names its primary file and optional representations;
- normal package metadata selects component implementations;
- a Runtime Profile selects deployable Providers and local execution storage.

This separation is what keeps a project extensible. Generation is not embedded in the edit, Canvas
coordinates are not embedded in the Graph, NLE timing is not reconstructed from generation history,
and Runtime state is not an authored dependency.

[`examples/production-project`](../../../../examples/production-project/README.md) is the executable
minimum: the same Media Asset is consumed by a Generation Graph and a flat NLE, while the Canvas and
Runtime remain replaceable adjacent files.

## Accept generated media explicitly

A Generation Canvas may display an exact Build output while it is running or while its Result remains
available. That observation is not yet an input to the edit. When an output is accepted, materialize it
through its owning package into a stable `media/<asset>/` bundle, then edit the consuming Graph or NLE
to reference that Media Asset.

This is a one-way authoring seam, not a permanent reactive dependency. A later Build does not silently
replace accepted media, deleting Result history does not break the authored cut, and opening the NLE
does not need the generation Runtime. A small script may perform the copy and file edits, but its durable
result is the ordinary files it creates rather than hidden script state.

The same rule applies to semantic timing. A timed transcript or other analysis can remain a Media Asset
representation. An explicit authoring operation may inspect it and materialize captions or effects as
direct NLE items and values. The NLE does not retain a named semantic dependency or reverse lookup.

## Give each working document one job

- `BRIEF.md` preserves the user's goal, facts, constraints, requested changes, and
  [agreed paid scope](brief.md#brief-preserves-user-authority).
- `TREATMENT.md` is the director's current answer to the Brief: the intended piece in complete creative
  terms, before implementation mechanics.
- `README.md` explains how this particular project is organized when the files are not self-explanatory.
- `PROGRESS.md` is a short photograph of active work: the live question, next useful action, real blockers,
  active Build identities, and relevant cost. It is not a log and can disappear when nothing needs a handoff.
- `ANALYSIS.md` and `TIMELINE.md`, when kept with a reference, explain what that reference does and why.
  Exact reusable evidence belongs in a Media Asset representation or another clearly owned file.

Rewrite these documents when the current truth changes. Do not use notes as a second project database.
An exact Build/output address belongs on the Canvas or in Result history; accepted media belongs in
`media/`; direct edit decisions belong in the NLE; reusable behavior belongs in its package.

## Keep drafts, Results, media, and exports distinct

`drafts/` holds trial copy, designs, or media deliberately kept for further authoring. A Build output
can remain only in Result history until it is accepted; it does not need to be copied into `drafts/`.

`media/` contains accepted project inputs with stable file-relative identity. It is authored project
state and travels with the project.

`.hypit/` contains local execution data, Product storage, and Result history. It is useful evidence but
is not an authored dependency. Another machine can open the production without copying it.

`exports/` contains viewing deliverables. An MP4 export is not the editable production and should not
become the source of truth for the NLE that produced it.

## Keep reference truth and production truth separate

A reference says what an existing piece does. The production says what this new piece should do. Keep
supplied reference media and its analysis under `references/`, then explicitly accept any bytes that
become production inputs into `media/`. Finding a similar finished video answers an availability
question; it does not establish that the requested production is complete.

When several productions share code, publish or link an ordinary package. When they share a creative
reference, each Brief or Treatment can identify it. Do not introduce a central asset catalogue or allow
parent-directory references to make one project silently depend on another project checkout.

## Hand over an editable production

A handoff includes:

- the Graph, Canvas, NLE, notes, scripts, and other authored files that define the work;
- every referenced Media Asset bundle and document, preserving relative paths;
- production package source or installed-release dependencies, `package.json`, its lockfile, and any
  tarballs referenced by `file:` dependencies;
- the intended Runtime Profile, with credentials configured separately on the receiving machine.

Include `.hypit/` only when the recipient needs previous Build evidence, diagnostics, or unaccepted
outputs. Never require it merely to resolve an authored Graph or edit. External input files remain live
dependencies until accepted into the project and referenced by portable paths.

Resume by reading the Brief, Treatment, applicable Progress note, and the actual Graph, Canvas, NLE,
Media Assets, and Results involved in the next decision. Continue from usable Products already present;
loss of conversation context is not a reason to submit paid work again. If a running operation was
interrupted, inspect its Runtime state before starting another Build.
