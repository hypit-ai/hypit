# Project files

Read this when starting, resuming, or reorganizing a video project. The layout below is a working
convention, not syntax: Hypit resolves ordinary paths and does not assign meaning to these directory
names.

## Establish the project boundary

Run commands from the video project's root. A small `package.json` makes that root explicit and
can later hold the project's component dependencies:

```json
{
  "name": "workshop-video",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

The CLI uses the nearest `package.json` above the command's working directory, or that directory
itself when none exists. Passing a Source or Runtime path does not select a different project.
Sources can live below the root, with file and Source imports relative to the declaring file.

| Boundary | When to set it explicitly |
| --- | --- |
| `--workspace <directory>` | Choose the Source containment root when running from another directory |
| `--asset-root <directory>` | Admit assets stored elsewhere while keeping Source imports in their workspace |
| `--package-root <directory>` | Resolve project packages from another installation location |

For example, `hypit check authors/main.svml --asset-root /path/to/shared-media` admits intentionally
referenced shared media. Keep the same relevant boundaries for subsequent commands. An ordinary
project uses its own package installation; reserved `@hypit/*` packages come from the selected
Distribution. [Distribution](../environment/distribution.md) explains locating that executable,
and [component vocabulary](../production/vocabulary.md#let-ordinary-package-management-own-distribution)
explains installing project packages.

## Keep reference truth and target truth separate

A reference archive says what an existing piece does. A production says what the new piece should do
and contains the files that make it. One reference can inform several productions, and one production
can draw from several references; ordinary relative links express those relationships without a
central project index.

```text
project/
├── references/
│   └── <reference>/
│       ├── source.*
│       ├── ANALYSIS.md
│       ├── TIMELINE.md
│       ├── transcript.json
│       ├── evidence/
│       ├── PROGRESS.md          # only while understanding is in progress
│       └── drafts/              # optional observation experiments
├── productions/
│   └── <target>/
│       ├── BRIEF.md
│       ├── TREATMENT.md
│       ├── PROGRESS.md
│       ├── authors/
│       ├── recipes/
│       ├── runs/
│       ├── assets/
│       └── drafts/
├── assets/                      # inputs shared by several targets
├── packages/                    # project Author Packages shared by targets
├── hypit.runtime.json
└── package.json
```

A target may have several Author Sources, Recipe Sources, and Runs. Re-running one Run creates another
Build, not another target. Keep files for one target together so their relationship is readable from
the filesystem rather than inferred from matching names elsewhere in the project.

For example, one understood reference can support two distinct target works without being copied:

```text
references/viral-ad/
productions/product-version/
productions/short-version/
```

Each production links to `../../references/viral-ad/` from its own Brief or Treatment and keeps its own
Sources and Runs.

The CLI finds the project from the command's working directory as described above; Source and Run files may live in any
subdirectory inside it. Shared assets and packages can stay at project root. Target-specific assets
stay with that target. A reference file that is also intentionally used in the new film can be
referenced in place; its documentary role does not require a duplicate.

## Give each document one job

- `ANALYSIS.md` is the current whole-piece understanding of a reference: form, story, recurring
  systems, relationships, function, and why the work holds together.
- `TIMELINE.md` says what happens when in the reference, including concurrent picture, speech,
  Caption, Typography, MG, Effect, and Audio behavior.
- `transcript.json` is word-level speech evidence. It is evidence, not the director's interpretation.
- `evidence/` contains only media worth reopening, with ordinary human-readable names.
- `BRIEF.md` preserves the user's goal, facts, constraints, and requested changes.
- `TREATMENT.md` is the director's current answer to the Brief: the intended new piece in complete
  creative terms, before implementation details.
- `authors/`, `recipes/`, and `runs/` are the exact production implementation.
- `PROGRESS.md` is a short photograph of the work now: the live question, next useful action, real
  blockers, active Build ids and reusable Results. When handing work over, retain the relevant Run
  and Runtime Profile, exact Build id and public Output names needed to continue. Run Candidates own
  the actual reuse choices; the note points to them. Established conclusions belong in their owning
  document instead.

Rewrite these files when the current truth changes. They are not logs. `PROGRESS.md` may exist beside
a reference or a production because either kind of work can span conversations; it does not mark a
stage and can disappear when there is nothing useful to hand over.

## Drafts and Results are different things

`drafts/` holds unpublished authoring material that is not part of the current Source: trial copy,
temporary designs, or media deliberately exported for further work. A Build output remains in that
Build's Result even if a later Run does not use it. The absence of a later reference already says it
was not adopted; it does not need to be copied into `drafts/`.

When an output is deliberately exported into the project, place it according to its new role. It may
become an `asset`, a `draft`, or direct input to another production.

## Resume from present facts

After interruption or context compaction, read the current Brief, Treatment, reference archive,
Source, Recipe, Run, and the short `PROGRESS.md` that applies. Then inspect the project's actual Build
Results and Runtime status. Continue from usable outputs already present; loss of conversation context
is not a reason to submit the same paid work again.

A command interruption or missing reply can leave the Worker running. [Builds](../production/builds.md)
explains how to identify active work and continue through a new Run after a failed attempt, including
a Provider submission timeout with no receipt.
Completed Outputs remain in Results without being exported as files. Keep or add their Run Candidates
when revising downstream work; neither the notes nor an unchanged output name selects them automatically.
