# Reference-video vocabulary decisions

After observations, select candidate packages and run `inspect_svml_vocabulary`. Read each selected
package README as syntax authority. Compare the observation against declared inputs, outputs,
attributes, children, ports, Recipe properties, timing behavior, appearance and examples.

First enumerate every system the reference actually contains — base pictures, inserted elements,
full-screen graphic compositions, persistent overlays, captions, speech, music, sound effects — and
inspect candidates for each one. A system you never inspected is a system you are about to invent.
`inspect_svml_vocabulary` reads the packages you name, so name the ones you know and inspect them.
When a system has no package you can think of, `list_svml_packages` reports every installed package
with the tags it registers and the models it offers:

```bash
hypit-reference-video-tools list_svml_packages
```

Run it before concluding that a capability is missing. Do not run it to confirm something you already
know: a vocabulary gap is proven by inspecting the candidates and finding none that fits, not by
failing to remember one.

Use this decision order:

1. Reuse one existing component when it fully expresses the observation.
2. Compose multiple existing components when their declared outputs and timing express it without
   changing the observed semantics.
3. Declare a real vocabulary gap only when neither option works.

Step 2 is not a way around step 3. Composition may express an observation with several components; it
may not move an element out of its role because some other tag happens to draw the same shape. What
an element **is** decides which vocabulary owns it — words spoken aloud are captions, a full-screen
designed field carrying content is one composition — and that answer does not change because the
element is styled beautifully or because the owning vocabulary is missing one property. A package
that owns the role but cannot express the observed appearance is a gap, exactly as much as no package
at all: `../playbooks/craft/captions.md` works one such case through.

Before accepting either step, name the observed appearance properties and say where each one lands in
the declared vocabulary. A property with nowhere to land is the finding. Either it makes the gap, or
it is written down as an accepted deviation with its reason before you continue — the one thing that
may not happen is quietly authoring something else that resembles it.

Do not force a similar-looking tag into a role it does not own. Do not invent attributes or write a
nonexistent tag with the intention of implementing it later. A picture that
`../playbooks/craft/graphic-compositions.md` defines as one self-contained graphic composition may
never be split across unrelated tags to make installed vocabulary fit.

## Resolve every declared appearance property

Declared vocabulary tells you which properties exist. Only observation tells you their values.

- After inspection, list the declared properties that change what the viewer sees and are not yet
  resolved by evidence: exact font and weight, size, line height, alignment, colour, stroke colour
  and width, shadow colour, offset, blur and opacity, glow, emphasis or active-item treatment, frame
  geometry, corner radius, border, padding, stack order, and reveal or typing rhythm.
- Each shot's `text_appearance` observation already describes drawn type in these terms. Read it
  before asking anything.
- Resolve what remains with a narrow `observe_reference --question` over the one to three shots where
  the element is most legible. Ask about visible attributes, never about components or syntax. A
  question costs one request and does not disturb cached observations.
- A default value is not an observation. Accepting one is allowed only as a recorded deviation after
  the evidence came back inconclusive.
- Read a persistent system's appearance from the shots where it is clearest and apply it to the whole
  system, as `continuity.md` requires.

## Real gaps

For a real gap, stop final-source authoring and read
`../local-author-package.md` completely. Implement and install the new project-local package, then
run `inspect_svml_vocabulary` against it before using its tag. That call is not redundant with having
just written the package: it proves the specifier resolves, the activation contribution is wired, and
the loader can decode the Surface. `pnpm check` proves none of those, because activation lookups fail
at runtime rather than at compile time.

The new package owns the whole observed composition. Its own surface — the paper, board, panel or
texture the composition always shows — is committed inside the package as a file, never demanded
from the graph. Only pictures that differ between videos are edges the source supplies.
`../playbooks/craft/graphic-compositions.md` draws that line; a component that cannot draw itself
without a project document is on the wrong side of it.

Installing the package is not the end of the gap route. Read `final-sources.md` and write the three
sources, then continue into `reconstruction-loop.md`: a component that loads is not yet a component
that looks like the reference.

The reference-video CLI remains limited to observation, vocabulary inspection and blind image
comparison; it does not generate components. Gemini does not write the package.
