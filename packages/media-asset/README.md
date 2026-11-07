# `@hypit/media-asset`

Portable, file-first import boundary for one prepared media file and zero or more package-owned media
representations.

`hypit.media-asset@1` is a strict JSON manifest. It stores a relative media file, the already resolved
`PreparedMedia` facts that must not be guessed again, and explicit representation document references. The
manifest is the persistent authority; `PreparedMediaAsset` is only its validated in-memory projection after a
Host resolves files to transient `BlobRef`s.

A representation is not synonymous with analysis. Speech transcripts, object tracks, masks, depth, camera
motion or an editable atlas may be imported from existing files, authored by people or produced later by an
Analyzer. Media Asset loading never starts an Analyzer, Provider, Build or Runtime.

Core owns only three optional bindings:

- `temporal.mapToMedia` maps representation-local target time to the PreparedMedia local source domain;
- `picture` states that a package interprets coordinates in normalized PreparedMedia display space, after
  sample-aspect-ratio and rotation interpretation;
- `audio` states that a representation describes the selected PreparedMedia audio member.

The exact representation document and any dense companion files remain owned by the referenced `TypeRef`'s
package. Every dense or auxiliary file is still declared explicitly in the Representation's `resources` map;
Core stages those bytes without interpreting the package-owned names. Missing package code does not erase the manifest entry or prevent the base media from being resolved;
using that representation requires the Host to locate its owner and fail accurately when it is unavailable.

Paths are portable and relative to the manifest. No same-name discovery, parent traversal, absolute path,
registry, content hash or hidden database participates in the relation. A package document may itself reference
ordinary dense files such as mask video or model weights.

`resolveMediaAssetDocument()` receives file resolution as a callback. It checks MIME agreement and returns a
`PreparedMediaAsset`, but deliberately does not open or interpret representation documents. Editor overlays,
inspectors, Analyzers and NLE materializers can therefore be contributed independently without extending Media
Asset Core.

Packages contribute readers through the `hypit.media-representation@1` facet. The process-local Host dispatches
by exact `TypeRef`, rejects duplicate owners and supplies only the selected asset, Representation and a byte-read
capability. This is the backend assembly seam for format packages; it is not a Studio UI contract and it does not
run analysis.

`@hypit/media-asset/node` adds `readMediaAssetDocumentFile()` and `resolveMediaAssetDocumentFile()`. The latter
anchors every declaration to the manifest directory and hands each absolute file to a Host callback. It does not
select a ResourceStore or retain another copy of the asset.
