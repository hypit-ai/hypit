# Project-local author packages

Create a local package only after inspecting installed vocabulary and confirming that no existing
Surface can express an important visual role. A small stylistic difference is not a missing
capability.

## Boundaries

- Put the package under the author project's `packages/` directory and use the project's own scope.
- Do not edit, vendor or copy an installed package.
- Keep the package reusable across multiple elements in this project; video-specific words, people,
  products and timing remain in Source/Recipe.
- Do not hand-author SVG assets or inline SVG.
- Use the public package activation, Surface, Producer and Fragment APIs only.

Inspect the real schemas before implementing:

```bash
hypit-reference-video-tools inspect_svml_vocabulary --package <closest-package>
hypit-reference-video-tools inspect_visual_schema
```

## Minimal package shape

The package must provide:

- a `package.json` with the appropriate Hypit activation entry;
- a public Surface vocabulary with explicit inputs, outputs and Recipe properties;
- a Producer that returns the declared nominal output Type;
- a Fragment that projects the produced value into the Runtime/Composition system;
- a README describing the public vocabulary and a preview project using it.

Prefer composition of existing public operations over new Runtime capabilities. Add a new capability
only when an external or local service genuinely owns that work.

## Validation

Install the project dependencies, then inspect the package through the same public loading path used
by an author project:

```bash
hypit-reference-video-tools list_svml_packages
hypit-reference-video-tools inspect_svml_vocabulary --package <local-package>
hypit-reference-video-tools validate_local_author_packages --run <project>/build.svrun
hypit-reference-video-tools validate_script_cues --run <project>/build.svrun
hypit check <project>/build.svrun
hypit-reference-video-tools preview_check <project>/build.svrun
hypit-reference-video-tools render_previews <project>/packages/<package>
hypit-reference-video-tools layout_check --run <project>/build.svrun
```

These commands report separate facts. A package is ready when its declared vocabulary loads, the
project actually imports and uses it, the graph traces, its previews render, and visual inspection
matches the requested design. Do not manufacture an override file when a command is broken. Report
the exact defect, fix the tool or package, and rerun the relevant command.

## Promotion

Finish the video before considering promotion. If the component has clear value across unrelated
projects, read `package-promotion.md` and ask the author before moving it into the Hypit repository.
Otherwise it remains ordinary project source.
