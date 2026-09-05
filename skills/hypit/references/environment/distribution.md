# Executable Distribution

Read this when the `hypit` command itself is unavailable, or when the installed Hypit Distribution
must be installed, updated, or located. Profiles and Managed Programs begin only after the executable
Distribution exists.

## Keep three lifecycles separate

The installed Skill supplies production judgment. The executable Distribution supplies `hypit`,
`hypit-studio`, official packages, and Runtime hosts. A video project supplies the work's Sources,
Runs, assets, local packages, Profile selection, and Results. They can live in unrelated locations
and none is installed as a side effect of another.

Check for an existing Distribution first:

```bash
hypit --help
hypit paths
```

When the command is absent, use the installation channel explicitly documented by the current Hypit
release or supplied by the user. If no release channel or trusted source has been provided, report
that the executable Distribution is missing; a Runtime Profile cannot repair that absence.

## Let the installation channel own updates

Install, update, and remove the Distribution through the same package or release channel. Updating
it does not update an installed Skill or edit a video project. Updating the Skill does not replace the
executable Distribution. After an update, run `hypit --help` and `hypit paths`, then continue with
`profile.md` for the current project's capabilities and Runtime choices.

A contributor checkout can execute its own Distribution after its documented workspace setup, but it
is a development arrangement, not an assumed location for ordinary production. Use one only when the
user explicitly supplied or selected that checkout.
