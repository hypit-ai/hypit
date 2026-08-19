# Reference-video vocabulary decisions

After observations, select candidate packages and run `inspect_svml_vocabulary`. Read each selected
package README as syntax authority. Compare the observation against declared inputs, outputs,
attributes, children, ports, Recipe properties, timing behavior, appearance and examples.

First enumerate every system the reference actually contains — base pictures, inserted elements,
full-screen graphic compositions, persistent overlays, captions, speech, music, sound effects — and
inspect candidates for each one. A system you never inspected is a system you are about to invent.
`inspect_svml_vocabulary` does not list what is installed; it reads the packages you name. Get the
names from `list_svml_packages`, which reports every installed package that declares an activation
along with the tags it registers:

```bash
hypit-reference-video-tools list_svml_packages
```

Never work from a remembered list of package names, and never conclude a capability is missing
because you did not think of the package that has it.

Use this decision order:

1. Reuse one existing component when it fully expresses the observation.
2. Compose multiple existing components when their declared outputs and timing express it without
   changing the observed semantics.
3. Declare a real vocabulary gap only when neither option works.

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

Installing the package is not the end of the gap route. Continue into `reconstruction-loop.md`: a
component that loads is not yet a component that looks like the reference.

The reference-video CLI remains limited to observation, vocabulary inspection and blind image
comparison; it does not generate components. Gemini does not write the package.
