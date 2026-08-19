# Develop a project-local author package

Use this workflow only after proving that no legal composition of installed packages expresses the
required behavior. A similar-looking tag is insufficient when its declared Types, timing or output
behavior differs. Never write an unknown tag before its package exists.

## Required reading

Read all of these completely before editing:

1. `docs/guide/author-packages.md`
2. `docs/guide/packages.md`
3. `docs/guide/conventions.md`
4. `packages/component-kit/README.md`
5. The closest existing package's README, `manifest.ts`, `surface.ts`, `component.ts`, and
   `activation.ts`

## Package boundary

Create a new package at `<project>/packages/local-<slug>/` named `@hypit/local-<slug>`. Use physical
version `0.0.0-dev` and logical Module version `1`. Only create a new package: do not edit, extend,
delete or overwrite an existing Hypit package to fill the gap.

The package is project-local even when the project is the Hypit checkout. Do not move it into an
official package automatically. After the result is accepted, offer promotion as a separate
contribution.

## Complete implementation

The main agent writes all code. Gemini must not receive or produce TypeScript, `package.json`,
Manifest, Surface, Producer, Validator or activation syntax.

Implement the parts required by the behavior, including:

- `package.json`, exports, dependencies and `hypit.activation`;
- Module Manifest, nominal Types and Producers;
- required Validators and deterministic Component handlers;
- Markup Surface vocabulary and decoder;
- activation contribution;
- lowering, Fragment or renderer implementation needed to produce the declared output;
- README and a preview for each visual Surface.

Choose raw versus structured Surface, timing dependencies, ProgramSpace, Frame, SemanticMap,
Artifact, Recipe and output Types from the observed behavior and closest package architecture. A
declaration-only or Surface-only package is incomplete.

## Install and validate

Reuse an existing workspace when it already includes `packages/*`; otherwise make only the minimal
workspace/package changes required. Add the package as a normal `workspace:*` dependency and run
`pnpm install`. Do not hide it under `.hypit/`, modify the package loader or invent a registry.

Repair in this order:

1. package/workspace resolution;
2. activation contribution;
3. Manifest, Producer, Type and Validator agreement;
4. Surface vocabulary and decoding;
5. implementation behavior;
6. source usage.

Use only existing checks:

```bash
pnpm check
pnpm hypit check path/to/main.svml
pnpm hypit check path/to/studio.svs
pnpm hypit check path/to/build.svrun
```

Use existing `--workspace` or `--package-root` options only when the project layout requires them.
Do not continue to final authoring until the package and sources pass the existing checks.
