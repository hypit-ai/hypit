# Sharing a project package

Read this when someone else needs a project component, Prompt Kit, Model, or Provider.

Creating a component and distributing it answer different questions. Create the component when the
work needs its visual role, semantic behavior or interaction. Distribution begins when its owner
wants another project or person to use the same package. Its component model and ownership stay the
same across that boundary.

## Share the package that owns the component

A component normally begins under the video project's `packages/` directory. Give it an owner-scoped name,
such as `@studio/score-strip`. Sharing it means giving the other project that package's code, assets,
and usage instructions through an installable package.

Keep the same name when distributing it. The Source import uses the component's stable address:

```xml
<import as="score" from="@studio/score-strip@1"/>
```

The package manager separately records the installed release, such as `1.2.0`. Follow the package's
published vocabulary for its Source interface.

## Publish for repeated distribution

For stable reuse across projects, publish a versioned package under its owner's npm scope or private
registry when that owner chooses distribution. For a public scoped package, the publication command is:

```bash
npm publish --access public
```

Consumers install the selected release with their usual package manager:

```bash
npm install --save-exact @studio/score-strip@1.2.0
# or
pnpm add --save-exact @studio/score-strip@1.2.0
```

The project lockfile records the installed dependency tree. Updates are explicit package-manager
operations; Builds use the selected installed code. A missing package is an installation problem.
Select the intended new release in the consumer project, inspect its changed vocabulary where
relevant, check the actual Source and Invocation and review the changed behavior. New Builds load that selected
implementation; restart an existing Studio session to load package-code changes. Reuse compatible
project media through authored realization choices while recomputing the component being revised. The package's own
release notes describe any required author changes.

## Send a tarball to another person

For an explicit direct handoff or development check, build the package and run `npm pack` in its directory. A TypeScript package
compiles to JavaScript; a JavaScript package may already have executable files. Its `prepack` script
can perform the build. For example:

```bash
cd packages/score-strip
npm pack
```

For `@studio/score-strip` version `1.2.0`, npm creates `studio-score-strip-1.2.0.tgz`. Send that file.
The consumer can keep the tarball under the video project's `vendor/` directory and install it from
that project:

```bash
npm install ./vendor/studio-score-strip-1.2.0.tgz
```

Keep the tarball with the project while its dependency points to that file, along with `package.json`
and the lockfile. Source imports select author contributions; Runtime Profile entries select Provider
contributions. To send the next release, give it a new package version, create a new tarball, and
install that file explicitly.

## Make a public release discoverable

People can find a public component through its npm page, source repository, or a community link.
Ordinary package metadata makes those existing discovery surfaces useful. For example, add fields
like these to the package that already owns the component:

```json
{
  "description": "A speech-timed score strip for Hypit videos.",
  "keywords": ["hypit", "hypit-author-package", "scoreboard"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/studio/score-strip.git"
  },
  "license": "MIT"
}
```

The description and keywords help npm search. The README should show the visual role, a copyable
Source import and element example, the package's public outputs, and
the selected Hypit release used to check it. Include the declaration's poster and, when motion or state is
central to the idea, a short representative clip or animation. The source repository, publisher,
license and selected release give a recipient the facts needed to choose whether to install it.

After installation, inspect the package's own declarations:

```bash
hypit vocabulary @studio/score-strip
```

That output explains the installed release's declarations and vocabulary. npm or the selected private
registry remains the authority for package bytes and versions; the project lockfile records the
consumer's exact choice.

## Adapt the package under its owner's identity

Ordinary changes to words, media, timing, palette or exposed parameters remain in the consuming
project's Source and Recipes. When someone changes the reusable mechanics or public behavior, the
fork can take that owner's package scope and Module identity, subject to the original license. The
new package is then installed, versioned and imported through the same mechanism as any other shared
component.

## Include what the recipient needs

The package's `files` and `exports` should include its executable code, preview assets, and any Sources
or templates exposed by its vocabulary. Declare third-party runtime dependencies in `dependencies`. Include a README with
an actual Source example, the public outputs, any companion or asset requirements, and the Hypit
release used to check it. Inspect the tarball contents with `npm pack --dry-run`.

Use the installed example and package README for the selected release's public APIs and dependency
declarations. Check the package from a separate consumer project so local source links do not conceal
omitted files or dependencies.

Package code runs as trusted JavaScript in the host process. The recipient chooses which package and
release to install.

## Share a Prompt Kit as data

A Prompt Kit can export an `.svs` Source through ordinary package `exports`:

```xml
<import as="ugc" source="@studio/image-kits/phone-ugc-v1"/>
```

That reads the selected package data. The same packing, installation, versioning, and file-completeness
rules apply. [Project handoff](../creation/project-files.md#hand-over-an-editable-production) explains
sharing the Sources, saved Invocations, assets and Results needed to continue a video on another machine.
