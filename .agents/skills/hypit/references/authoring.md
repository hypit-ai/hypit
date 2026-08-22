# Hypit source authoring

Read `quickstart.md`, then the authoritative page it selects under `docs/quickstart/`.
Keep Author Source, Recipe Source and Run Source complete and internally consistent rather than
assembling independent per-shot source fragments.

Before writing an element, inspect what its Surface actually declares and read the owning package
README as its example — `vocabulary.md` names the command and decides which package owns an element
in the first place. The inspect output lists every attribute and every Recipe property with its
description and admitted values; that is the parameter reference. The README is the example, not the
reference — a thin README is a thin example next to a complete declaration. For `@hypit/<name>@1`,
the repository README is `packages/<name>/README.md`. Never invent a component, attribute, child,
port, Recipe property or literal value, and do not read a package's source code to learn its
syntax: the source is implementation, the declaration is the contract the loader checks against. Do
not infer one package's syntax from a neighboring package.

Install dependencies after package selections change. Validate with the existing commands, run from
the repository root:

```bash
pnpm check
pnpm hypit check path/to/main.svml
pnpm hypit check path/to/recipes.svs
pnpm hypit check path/to/build.svrun
hypit-reference-video-tools preview_check path/to/build.svrun
```

Check all of them, not only the Author Source: a Recipe the Author Source references and a Target the
Run Source demands are just as able to be wrong. Do not create a check wrapper.

**A check that passes is not a graph that traces.** `hypit check` proves a Source is legal — its
syntax, its references, its graph structure — and proves nothing about whether the tracks it declares
can actually be built, nor that an uncertain requirement was understood correctly. `preview.md`
proves the Run traces, before any Provider is reached — which is why the last command above,
`preview_check`, is part of validating a Run and not a later step. Run it from the repository root:
it resolves the installed packages against the working directory.

This file is about writing an element correctly, which is a narrower question than making the video
right. What a Track should contain, when a picture may be generated at all, how long a thing stays on
screen and what shows through when it does not — those are decided in `playbooks/index.md`, whose
required load order names the craft every program needs regardless of format. A whole video is
`original-authoring/index.md`, not this file: a Source can pass every check above with every one of
those decisions still unmade.
