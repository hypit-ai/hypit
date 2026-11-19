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

Use **Add card**, or double-click blank space, to search the installed model palette and Project Media. Move or resize cards directly. Moving cards snaps to nearby edges and centres. Use the hand tool or middle mouse button to pan, and the zoom controls to frame the board. Card placement is saved with the document; the camera and current selection belong to the open tab.

Drag between compatible ports to link cards. Dropping a port on blank space offers compatible new cards and saves the card and its connection together. Select a wire to disconnect it, or edit inputs by name in **Parameters**. Select an exact completed result on the source card before using its output in a downstream quote or Invocation.

**Results** shows attached Invocations and their published outputs. Preview a media resource, select it for downstream use, or adopt it into Project Media. The board previews image and video Media cards and explicitly selected image or video results. Adopted Media is available to Canvas and NLE through the shared Project catalog.
