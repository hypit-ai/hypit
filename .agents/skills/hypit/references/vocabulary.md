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

## Reuse, compose, or declare a gap

Use this decision order:

1. Reuse one existing component when its declared vocabulary expresses the element exactly — every
   property that changes what the viewer sees lands somewhere the package declares.
2. Compose multiple existing components when their declared outputs and timing express it to that
   same standard, without changing what the element is.
3. Declare a real vocabulary gap when neither option works.

**Resemblance does not qualify a package.** A tag that draws the same kind of thing, or that carries
every property except one, leaves that element unexpressed, and an element the installed vocabulary
cannot express as stated is a gap. Steps 1 and 2 apply where the declared vocabulary already carries
the element as the evidence states it; step 3 is the ordinary outcome everywhere else, and
`local-author-package.md` is the route for it.

Step 2 is not a way around step 3. Composition may express one element with several components; it
may not move an element out of its role because some other tag happens to draw the same shape. What
an element **is** decides which vocabulary owns it — words spoken aloud are captions, a full-screen
designed field carrying content is one composition — and that answer does not change because the
element is styled beautifully or because the owning vocabulary is missing one property. A package
that owns the role but cannot express the required appearance is a gap, exactly as much as no package
at all: `playbooks/craft/captions.md` works one such case through.

**Do not force a similar-looking tag into a role it does not own, and never invent a component,
attribute, child, port, Recipe property or literal value** — not even with the intention of
implementing it later. A picture that `playbooks/craft/graphic-compositions.md` defines as one
self-contained graphic composition may never be split across unrelated tags to make installed
vocabulary fit.

## Resolve every declared appearance property

Declared vocabulary tells you which properties exist. It never tells you their values; only evidence
does.

Before accepting step 1 or step 2, name the appearance properties the element must have and say where
each one lands in the declared vocabulary. A property with nowhere to land is the finding, and it
makes the gap — there is no acceptable shortfall. The one thing that may not happen is quietly
authoring something else that resembles it.

The properties to account for are the drawn structure that
`playbooks/craft/graphic-compositions.md` enumerates — the type, the paint, the geometry, the stack
order and the reveal. Work from that list rather than a second copy of it.

**A default value is not a decision.** A value nobody established is not evidence, and there is no
state where a guessed value is acceptable. Where the value comes from differs by route: a
reconstruction measures it — `reconstruction/vocabulary.md` says how — and original authoring decides
it deliberately and writes it down.

## A real gap

For a real gap, stop authoring sources and read `local-author-package.md` completely. Implement and
install the new project-local package, then run `hypit-reference-video-tools inspect_svml_vocabulary` against it before using its
tag. That call is not redundant with having just written the package: it proves the specifier
resolves, the activation contribution is wired, and the loader can decode the Surface. `pnpm check`
proves none of those, because activation lookups fail at runtime rather than at compile time.

The new package owns the whole composition. Its own surface — the paper, board, panel or texture the
composition always shows — is committed inside the package as a file, never demanded from the graph.
Only pictures that differ between videos are edges the source supplies.
`playbooks/craft/graphic-compositions.md` draws that line; a component that cannot draw itself
without a project document is on the wrong side of it.

After inspection, persist the result with `inspect_svml_vocabulary --run <build.svrun>`. Before
writing or checking Source, run `validate_local_author_packages --run <build.svrun>`. Every
`packages/local-*` directory must expose a real Surface, Producer and Fragment and must be imported
and used by the compiled Graph; otherwise the route stops with a machine-readable diagnostic.
