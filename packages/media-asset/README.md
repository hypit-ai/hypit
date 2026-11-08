# `@hypit/media-asset`

Portable, file-first import boundary for one interpreted media file and zero or more package-owned media
representations.

`hypit.media-asset@1` is a strict JSON manifest. It stores a relative media file, the already resolved
`MediaInterpretation` facts that must not be guessed again, and explicit representation document references. The
manifest is the persistent authority; `ResolvedMediaAsset` is only its validated in-memory projection after a
Host resolves files to transient `BlobRef`s.

A representation is not synonymous with analysis. Speech transcripts, object tracks, masks, depth, camera
motion or an editable atlas may be imported from existing files, authored by people or produced later by an
Analyzer. Media Asset loading never starts an Analyzer, Provider, Build or Runtime.

Core owns only three optional bindings:

- `temporal.mapToMedia` maps representation-local target time to the media-local source domain;
- `picture` states that a package interprets coordinates in normalized media display space, after
  sample-aspect-ratio and rotation interpretation;
- `audio` states that a representation describes the selected media audio member.

The exact representation document and any dense companion files remain owned by the referenced `TypeRef`'s
package. Every dense or auxiliary file is still declared explicitly in the Representation's `resources` map;
Core stages those bytes without interpreting the package-owned names. Missing package code does not erase the manifest entry or prevent the base media from being resolved;
using that representation requires the Host to locate its owner and fail accurately when it is unavailable.

Paths are portable and relative to the manifest. No same-name discovery, parent traversal, absolute path,
registry, content hash or hidden database participates in the relation. A package document may itself reference
ordinary dense files such as mask video or model weights.

`resolveMediaAssetDocument()` receives file resolution as a callback. It checks MIME agreement and returns a
`ResolvedMediaAsset`, but deliberately does not open or interpret representation documents. Editor overlays,
inspectors, Analyzers and NLE materializers can therefore be contributed independently without extending Media
Asset Core.

`resolveMediaAssetMedia()` is the narrow playback path: it resolves only the primary media file and leaves every
optional Representation document and dense resource cold. Resolution is an explicit Host action, not a persistent
`prepared/unprepared` state.

Packages contribute readers through the `hypit.media-representation@1` facet. The process-local Host dispatches
by exact `TypeRef`, rejects duplicate owners and supplies only the selected asset, Representation and a byte-read
capability. This is the backend assembly seam for format packages; it is not a Studio UI contract and it does not
run analysis.

`@hypit/timed-transcript` and `@hypit/object-track` are the first two concrete readers. Object Track demonstrates
the spatial side without adding a central analysis schema: its editable JSON owns named normalized rectangles and
exact local sample times, while the Media Asset binding alone relates that file to media display space and time.
Dense masks, depth and camera motion can follow the same facet as separately typed packages.

`@hypit/media-asset/node` adds `readMediaAssetDocumentFile()`, `resolveMediaAssetMediaFile()` and
`resolveMediaAssetDocumentFile()`. The latter
anchors every declaration to the manifest directory and hands each absolute file to a Host callback. It does not
select a ResourceStore or retain another copy of the asset.

The Node port also exposes `importMediaAssetFile()`. It accepts package-owned inspection and selection callbacks,
reports cancellable task progress, optionally copies bytes, and atomically publishes a new manifest without
overwriting an existing file. It deliberately owns no queue, FFmpeg policy or Studio pending state.

For long-running operation graphs, `@hypit/media-asset-generation` contributes two value nodes.
`@hypit/media-asset-generation@1#media` projects the interpreted media as `PreparedMedia`;
`@hypit/media-asset-generation@1#resource` projects the primary file as an ordinary
`Blob` for image, video or audio model ports. The saved graph keeps only a portable Media Asset reference:

```json
{
  "id": "interview",
  "using": {
    "module": { "name": "@hypit/media-asset", "version": "1" },
    "name": "media"
  },
  "inputs": {
    "asset": { "value": { "path": "assets/interview.media.json" } }
  }
}
```

During Build preparation, the package reads the manifest through the Host Workspace and resolves only its primary
media file into the requested typed Record plus a transient attachment. These are projections of one asset authority,
not two copies or a persistent mode. The node itself is not executable work, has no Product and never enters Result
history. Downstream operation nodes consume the Record normally; Runtime sees closed values and bytes, never a
project path. Representations remain cold and independently owned.
