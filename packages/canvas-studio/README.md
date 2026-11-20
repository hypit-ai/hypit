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

Use the tool rail or double-click empty space to add a model or place Project Media on the board. Import local media
from the rail or drop files onto the canvas. Use search to locate a card and double-click it to trace its inputs.
Drag cards to move them, use the resize handle on the selected card, and use the hand tool or middle mouse button
to pan. Card placement is saved with the document. The viewport and groups are browser view settings.

Select a card to open its composer. Edit inputs there, drag connectors between compatible cards, or drop a connector
on empty space to add and connect a card in one edit. Select a completed result on an upstream card to make it
available when quoting or submitting a downstream recipe.

Open generation history to inspect and cancel runs, choose results, preview or export assets, and add generated media
to Project Media. Use **Add to editing** on a Media card or generated result to place it in a composition
and track of a saved project editing document. A generated result is adopted into Project Media before placement.
Project Media is available in both Canvas and NLE through the shared Project catalog.
