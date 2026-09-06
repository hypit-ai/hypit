# Sharing a project package

Read this when someone else needs a project component, Prompt Kit, Model, or Provider.

## Share the package that owns the component

A component can begin under the video project's `packages/` directory. Give it an owner-scoped name,
such as `@studio/score-strip`. Sharing it means giving the other project that package's code, assets,
and usage instructions. Neither author nor consumer needs a Hypit repository checkout.

Keep the same name when distributing it. The Source import names its logical Module ABI:

```xml
<import as="score" from="@studio/score-strip@1"/>
```

Here `1` is the Module interface version. The package manager separately records the npm release,
such as `1.2.0`. A release that preserves that interface keeps the same Source import.

## Send a tarball to another person

For a direct handoff, build the package and run `npm pack` in its directory. A TypeScript package
compiles to JavaScript; a JavaScript package may already have executable files. Its `prepack` script
can perform the build. For example:

```bash
cd packages/score-strip
npm pack
```

For `@studio/score-strip` version `1.2.0`, npm creates `studio-score-strip-1.2.0.tgz`. Send that file.
This route needs no registry account or publication. The consumer can keep it under the video
project's `vendor/` directory and install it from that project:

```bash
npm install ./vendor/studio-score-strip-1.2.0.tgz
```

Keep the tarball with the project while its dependency points to that file, along with `package.json`
and the lockfile. Source imports select author contributions; Runtime Profile entries select Provider
contributions. To send the next release, give it a new package version, create a new tarball, and
install that file explicitly.

## Publish for repeated distribution

When the owner wants a registry release, publish the built package under their npm scope or private
registry. For a public scoped package, the publication command is:

```bash
npm publish --access public
```

Consumers install the selected release with their usual package manager:

```bash
npm install @studio/score-strip@1.2.0
# or
pnpm add @studio/score-strip@1.2.0
```

The project lockfile records the installed dependency tree. Updates are explicit package-manager
operations; Builds use the selected installed code. A missing package is an installation problem.

## Include what the recipient needs

The package's `files` and `exports` should include its built activation, runtime code, preview assets,
and any Sources or templates exposed by its vocabulary. `hypit.activation` points to the shipped
JavaScript entry. Declare third-party runtime dependencies in `dependencies`. Include a README with
an actual Source example, the public outputs, any companion or asset requirements, and the Hypit
release used to check it. Inspect the tarball contents with `npm pack --dry-run`.

An executable Author Package develops against `hypit/author-kit` and the relevant `hypit/*` domain
subpaths, with `hypit` as a development dependency. Its release contains its own code and assets;
the active Hypit Distribution supplies the framework APIs when loading it. Check the package from a
separate consumer project so local source links do not conceal omitted files or dependencies.

Package code runs as trusted JavaScript in the host process. The recipient chooses which package and
release to install.

## Data packages remain data

A Prompt Kit can export an `.svs` Source through ordinary package `exports` without activation code:

```xml
<import as="ugc" source="@studio/image-kits/phone-ugc-v1"/>
```

That reads the selected package data. The same packing, installation, versioning, and file-completeness
rules apply. [Project handoff](../creation/project-files.md#hand-over-an-editable-production) explains
sharing the Sources, Runs, assets and Results needed to continue a video on another machine.
