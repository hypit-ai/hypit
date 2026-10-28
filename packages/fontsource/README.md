# `@hypit/fontsource`

This package adapts font packages already selected by an authored project's ordinary
`package.json` and lockfile into Hypit's generic `FontArtifactRef` value.

```xml
<import module="@hypit/fontsource@1" as="fontsource"/>
<fontsource:Face
  id="inter"
  package="@fontsource-variable/inter"
  weight="700"
  style="normal"
/>
```

The official `@hypit/hypit` Distribution supplies this adapter as an ordinary versioned dependency.
A custom Distribution can depend on it the same way. Install only the font families the project
actually uses in that project's `package.json`; its lockfile owns their versions. The adapter contains
no font catalog and no bundled family dependencies. It reads `metadata.json`, CSS and font files from
installed packages without executing their code. Other npm font packages and project-owned files can
be declared directly through `@hypit/media@1` `Font` and `FontStack` declarations.
