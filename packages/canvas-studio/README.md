# Hypit Canvas Studio

Canvas Studio provides a browser board and a Product Session for a Project Canvas. The Hypit Application distribution registers its provider and HTTP adapter alongside NLE Studio. CLI commands and the browser access the same Canvas Service through the ProjectHost.

In the Project directory, install the Model packages and select their palette entries in `hypit.project.json`. For example:

```sh
pnpm add @hypit/gpt-image @hypit/seedance
```

```json
{
  "format": "hypit.project",
  "name": "Opening",
  "packages": [
    { "name": "@hypit/gpt-image", "catalog": ["gpt-image-2"] },
    { "name": "@hypit/seedance", "catalog": ["seedance-2.5-flash"] }
  ]
}
```

```sh
hypit canvas create generation/opening.canvas.json --name "Opening"
hypit canvas open generation/opening.canvas.json
hypit canvas catalog generation/opening.canvas.json --json
```

Add a recipe card and edit its inputs in the inspector. A media port can take Project Media or a card output. Select an exact completed result on the source card before using its output in a downstream quote or Invocation.

History shows attached Invocations and their published outputs. Preview a media resource, select it for downstream use, or adopt it into Project Media. Adopted Media is available to Canvas and NLE through the shared Project catalog.
