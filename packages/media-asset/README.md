# `@hypit/media-asset`

Portable, file-first author documents for media explicitly accepted into a Project Boundary. A document stores
one manifest-relative primary file, its durable `MediaInterpretation`, a required UTC `media.adoptedAt`
timestamp with millisecond precision, and independently owned Representations.
It contains no execution resource handles, hashes, freshness state, Provider facts or NLE placement.

The `service` entry opens the shared Media Asset collection lifetime used by one `ProjectHost`. Its catalog is a
finite projection of current manifests and current file availability. `service/node` supplies the ordinary local
directory adapter; refresh rereads the collection and does not maintain byte identity or freshness truth.

`host.media.observeLibrary()` returns the folder tree and its revision. Unfiled Catalog entries appear at its
root. `host.media.editLibrary({ kind, expectedRevision, ...fields })` commits a folder edit or an asset move
to `media/library.json`. The tree references the same Media Assets used by other project documents.

On a Node ProjectHost, `host.media.adoptFile(request, { inspect, select })` accepts a local file, records the
adoption time at publication and returns a project-relative Media Asset `reference`. The caller chooses the
inspection and stream selection policy. For a
local audio file, for example. Supply a folder ID to place the adopted asset in that folder:

```ts
import { defaultMediaSelection } from "@hypit/media";
import { inspectMediaFileForAdoption } from "@hypit/media-local";

const mediaType = "audio/wav";
const { reference } = await host.media.adoptFile({ sourcePath, mediaType }, {
  inspect: (path, context) => inspectMediaFileForAdoption(path, mediaType, context),
  select: inspection => defaultMediaSelection(inspection, mediaType),
});
```

Use the returned `reference` in composition declarations. `host.media.open(reference)` reads its interpretation,
and `selectMediaSourceWindow` from `@hypit/media` selects an exact window before placement.
Use `inspectMediaFileFromContainerIndex` when the source declares both presentation endpoints in its container index.
