# Choosing the vocabulary

This file decides which package owns an element, before anything writes one. It applies to original
authoring and to reconstruction equally: what changes between the two is where the requirement comes
from — a description, or a reference the evidence describes — not how a package is chosen to meet it.

## Enumerate every system before you name a package

First enumerate every system the program actually contains — base pictures, inserted elements,
full-screen graphic compositions, persistent overlays, captions, speech, music, sound effects — and
inspect candidates for each one. **A system you never inspected is a system you are about to invent.**

Then, for each: select candidate packages and run `hypit-reference-video-tools inspect_svml_vocabulary`. Read each selected
package README as syntax authority. Compare what the element must be against declared inputs,
outputs, attributes, children, ports, Recipe properties, timing behavior, appearance and examples.

## What is installed: `list_svml_packages`

Reports every installed package that declares an activation, with the Surface tags it registers and
the models it offers. This is the only way to know what vocabulary exists: `inspect_svml_vocabulary`
reads packages you name, and the Build CLI is deliberately unable to scan a directory. Run it before
deciding anything is missing.

```bash
hypit-reference-video-tools list_svml_packages
```

It takes no arguments, needs no reference and no credentials — the binary is named for
reconstruction, this command is not. It reads official vocabulary from the installed Distribution
and project packages from the current project, so run it from the project directory.

Run it before concluding that a capability is missing. Do not run it to confirm something you already
know: a vocabulary gap is proven by inspecting the candidates and finding none that fits, not by
failing to remember one.

## What a package declares: `inspect_svml_vocabulary`

Reads the packages you name and reports, per Surface, its tag, its attributes and their accepted
Types, its children, its ports, the Recipe properties it admits with their fallbacks, and its preview.

```bash
hypit-reference-video-tools inspect_svml_vocabulary --package @hypit/<name> [--package …] \
  [--tag <Tag> …] [--without-previews]
```

`--package` may be repeated. `--tag` is optional and repeatable: omit it and every Surface in the
named packages is returned. The README remains the syntax authority; this reports what the loader
will actually accept, which is what a mistaken attribute is checked against.

Both commands print one JSON object to stdout. `list_svml_packages` is an array of
`{ package_name, tags, models }`; `inspect_svml_vocabulary` returns `{ packages, surfaces }` where
each Surface carries `package_name`, `module`, `surface`, `tag`, `mode`, `outputs`, `readme_path` and
`vocabulary` — whose own keys are `summary`, `attributes`, `children`, `example` and `notes`. **The
Recipe properties are inside the `recipe` attribute**, at `vocabulary.attributes[name=recipe].recipe`,
one entry per property; there is no `recipe` key beside `attributes`. A Surface re-exported from
another package carries no `vocabulary` at all — follow its `module` to the one that declares it. Read
the `accepts` lists on attributes: that is the declared Type an element must satisfy, and a property
with nowhere to land in those lists is the finding that makes a gap.

**That output is the complete authoring contract. Author from it, and do not read a package's source
code to learn an element's syntax.** Every recipe property carries its own `summary` and its admitted
`values` — the parameter reference is in the inspect output, not in the package. The README is the
example, and it is not a parameter reference: some READMEs are a single illustrative recipe, and a
thin one is not missing documentation, it is a thin example next to a complete declaration. The
source is implementation, and the loader refuses a mistaken attribute against the declaration, not
against the source — so reading it neither teaches the contract nor matches how the element is
validated.

## Judge component fit before writing Source

List the installed vocabulary, inspect the packages that plausibly own each visual system, and make a
short judgement. This is not a property-by-property score and it is not an exhaustive search through
unrelated packages. The Agent decides whether a candidate is close enough for the job, records why,
and chooses one of three outcomes:

- `reuse-existing`: the package owns the right role and is sufficiently close to what the program
  needs;
- `reuse-with-accepted-variance`: it is sufficiently close, but SVS cannot express a few named,
  unimportant appearance differences;
- `project-local-package`: the difference materially changes the component's core look, function,
  structure or behaviour.

Original authoring does not turn silence into a hidden specification. If the author asks for a
ranking board without defining every icon, shadow or radius, those details remain the Agent's design
space and an installed ranking component normally qualifies as `reuse-existing`. Reconstruction has
a picture to compare against, but a package that clearly represents the same visual system may still
qualify with a few low-impact skin differences recorded as accepted variance. A brand signature,
visual Hook, hierarchy, legibility, geometry or motion difference is not a small variance.
Original authoring records a variance only when the frozen brief or the author explicitly accepts
that difference; an unspecified detail is design freedom, not a variance.

Composition remains valid when several installed components genuinely express the requested system;
it may not move an element into the wrong semantic role merely because another tag draws a similar
shape. Never invent a component, attribute, child, port, Recipe property or literal value.

Installed packages are immutable dependencies. Do not modify them, copy or vendor their source into
the project, or read implementation source to discover undeclared syntax. If the author explicitly
chooses to copy a named package as a close structural sibling, that package's README and required
role files may be read as the bounded implementation skeleton; this is the only source-reading
exception. When the fit is not good enough, use the project-local package route and author it from
the visible requirement, inspect contract, README and `local-author-package.md`.

## Freeze the judgement

Before package development or Source authoring, write the decisions to the canonical
`.hypit/component-fit.json`. Keep it concise and record only what affected the choice:

```json
{
  "version": 1,
  "route": "description",
  "basis": ".hypit/brief.json and its frozen digest",
  "systems": [{
    "role": "ranking board",
    "inspected_candidates": ["@hypit/ranking"],
    "selected_package": "@hypit/ranking",
    "decision": "reuse-existing",
    "rationale": "same visual role and sufficiently similar presentation",
    "accepted_variances": []
  }]
}
```

`accepted_variances` contains short natural-language differences only for
`reuse-with-accepted-variance`; it is empty for the other decisions. Checkpoint the file before
developing a gap. For `project-local-package`, `selected_package` names the planned project specifier.

```bash
hypit-reference-video-tools route_state --action checkpoint --project-root <project> \
  --route description|reconstruction --state vocabulary-checked --status in_progress \
  --artifacts '{"component_fit":".hypit/component-fit.json"}'
```

The later Run-scoped `inspect_svml_vocabulary --run <run>` persists the vocabulary evidence and
completes `vocabulary-checked` only while this frozen file is valid. After compaction, read it before
resuming package work, Source authoring or visual repair.

## A real gap

For a real gap, stop authoring sources and read `local-author-package.md` completely. Implement and
install the new project-local package, then run
`hypit-reference-video-tools inspect_svml_vocabulary` against it before using its tag. That call is
not redundant with having just written the package: it proves the specifier
resolves, the activation contribution is wired, and the loader can decode the Surface. `pnpm check`
proves none of those, because activation lookups fail at runtime rather than at compile time.

The new package owns the whole composition. Its own surface — the paper, board, panel or texture the
composition always shows — is committed inside the package as a file, never demanded from the graph.
Only pictures that differ between videos are edges the source supplies.
`playbooks/craft/graphic-compositions.md` draws that line; a component that cannot draw itself
without a project document is on the wrong side of it.

After inspection, persist the result with `inspect_svml_vocabulary --run <build.svrun>`. Before
writing or checking Source, run `validate_local_author_packages --run <build.svrun>`. Every
project-owned package directory under `packages/` must expose a real Surface, Producer and
Fragment and must be imported and used by the compiled Graph; otherwise the route stops with a
machine-readable diagnostic. Package directory names are descriptive slugs, not a required
`local-` prefix.
