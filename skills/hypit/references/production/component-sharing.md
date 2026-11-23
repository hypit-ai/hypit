# Sharing Project Packages (`component-sharing.md`)

Read this when sharing a custom NLE component package, Canvas capability, or provider package across projects or with another person.

Creating a component and distributing it answer different questions. A component normally starts inside a video project under `packages/<name>/`. Distribution begins when its owner wants another project to install and use the same package.

## Package Structure (`./hypit` Export)

A Hypit package uses standard Node ESM packaging with a `./hypit` subpath export in `package.json`:

```json
{
  "name": "@studio/score-strip",
  "version": "0.1.0",
  "description": "A speech-timed score strip component for Hypit NLE timelines.",
  "type": "module",
  "exports": {
    "./hypit": {
      "types": "./dist/hypit.d.ts",
      "default": "./dist/hypit.js"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "prepack": "pnpm run build"
  }
}
```

The `./hypit` module exports `hypitPackage` containing `package`, `contributions` (e.g., `hypit.nle-component-definition`, `hypit.nle-authoring`, `hypit.nle-inspector`, `hypit.nle-render`), and optional `catalog` starter entries.

## Registering in a Consumer Project

1. Install the package with `pnpm` (or `npm`):
   ```bash
   pnpm add --save-exact @studio/score-strip@0.1.0
   ```
2. Declare the package and any catalog entries in the consumer project's `hypit.project.json` under `packages`.
3. Reference its components in SVML using `<component package="@studio/score-strip" symbol="scoreStrip"/>`, or import its helpers in TSX authoring.

Updates are explicit package-manager operations recorded in `pnpm-lock.yaml`. Restart an open NLE Studio or Canvas Studio session after upgrading a package so the host reloads the new build.

## Publishing or Handing Off a Tarball

- **Registry release**: publish under an npm scope or private registry (`npm publish --access public`).
- **Direct tarball handoff**: run `pnpm pack` (or `npm pack`) inside the package directory to produce `studio-score-strip-0.1.0.tgz`. The recipient can place it under `vendor/` and install it directly (`pnpm add ./vendor/studio-score-strip-0.1.0.tgz`).

## What to Include for Recipients

- Compiled JavaScript and type declarations in `dist/` (verify with `npm pack --dry-run`).
- Any bundled static assets (fonts, SVG templates, icons) listed in `files`.
- A concise `README.md` showing the package name, exported component symbols, `<parameters>` JSON schema, `<media-input>` / `<value>` slots, and a copyable SVML `<present>` snippet.
- Test installation in a separate consumer project to ensure no unbundled workspace-only imports or missing dependencies slipped through.
