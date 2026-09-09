# Executable Distribution

Read this to locate, install, or update the executable Hypit Distribution after installing the Skill.

## Keep three lifecycles separate

The installed Skill supplies production judgment. The executable Distribution supplies `hypit`,
`hypit studio`, official packages, and Runtime hosts. A video project supplies the work's Sources,
Runs, assets, local packages, Profile selection, and Results. They can live in unrelated locations
and none is installed as a side effect of another. `npx skills add hypit-ai/hypit -g` installs the
Skill's knowledge; the executable is the separate npm package `@hypit/hypit`.

## Find the installation already available

An available launcher can identify its version and physical locations:

```bash
hypit --version
hypit --help
hypit paths
```

`paths` includes the active Distribution, project, and host locations. A missing Runtime Profile is
a separate setup question from whether the executable is installed.

If the shell cannot find `hypit`, inspect the project's and npm's global package records:

```bash
npm ls @hypit/hypit --depth=0
npm ls --global @hypit/hypit --depth=0
npm prefix --global
```

A project installation can run through `npm exec --no -- hypit --version` and
`npm exec --no -- hypit paths`; `--no` declines npm's offer to install a missing package. A global
installation may need its executable directory added to the current shell's PATH: `<prefix>/bin`
on POSIX systems, or the prefix itself on Windows. Use the existing installation or its known
launcher, and retain the working command and location in project notes when useful for resuming.

## Install the executable package

The usual machine-wide installation command for a published release is:

```bash
npm install --global @hypit/hypit
```

A project can instead keep Hypit in its own dependencies and lockfile:

```bash
npm install --save-dev @hypit/hypit
npm exec --no -- hypit --help
```

Use the release version selected by the user or project when one is specified. If the selected
registry reports a missing package or version, that release is unavailable there. An official release
supplied as a tarball can be installed directly, for example
`npm install --global /path/to/hypit-release.tgz`. Report the actual installation error when the
release cannot be obtained.

## Let the installation channel own updates

Install, update, and remove the Distribution through the same package or release channel. Updating
it does not update an installed Skill or edit a video project. Updating the Skill does not replace the
executable Distribution. After installation or an update, use the selected launcher for `--version`,
`--help`, and `paths`, then continue with
`profile.md` for the current project's capabilities and Runtime choices.

The installed Distribution is the authority for exact Surface syntax. If a package or Surface named
by the Skill is absent from `hypit vocabulary`, report the version mismatch and update the selected
installation instead of inventing a translation.

A contributor checkout can execute its own Distribution after its documented workspace setup, but it
is a development arrangement, not an assumed location for ordinary production. Use one only when the
user explicitly supplied or selected that checkout.
