# `@hypit/nle`

Persistent, flat editing authority for Hypit's HTML-capable non-linear editor.

An `NleProject` stores direct frame positions, file-backed media references, picture/audio tracks, package-owned Component and
Picture/Audio Effect instances, Transition and matte relations, editing Groups and nested
Compound projects. Opening or editing the project does
not compile an AuthorGraph, run a Provider, close an audiovisual Programme or recover declarations through
provenance.

Edits are immutable revisioned transactions. The command set covers media and track management; add, move,
trim, split, replace and remove for Items; and add, replace and remove for Transition, matte and Group relations.
A failed multi-command transaction leaves
the input revision untouched.

The serialized `NleProject` is the current editable work, not its editing history. Undo/redo belongs to a
document session: one accepted gesture records one atomic transaction and enough before/after state to restore
it. `NleEditSession` now supplies snapshot-based commit, undo, redo, redo-branch truncation, monotonic project
revisions and a logical savepoint/dirty state. Session history is deliberately not serialized with the project.
Host file paths remain outside Core; `@hypit/nle/node` is the first concrete atomic file adapter.
AVIR, `HtmlProgram` and `AudioProgram` are derived on demand and are never required to open or save the project.
The full boundary and history semantics are recorded in
[`design/html-effects-nle-project-and-undo.md`](../../design/html-effects-nle-project-and-undo.md).

The project-file language is strict, pretty-printed JSON with the `hypit.nle@1` format marker. It is a data
format, not HCL, SVML or TypeScript: direct frame values and string ids replace expressions and imports.
Package instances store an exact Module symbol plus canonical JSON parameters; installed package code supplies
their behavior. See [`examples/title-card.nle.json`](examples/title-card.nle.json) for a complete component-only
project with a package-owned animated Picture Filter. The filter's Item-local frame spelling is not an NLE Core
Keyframe format: its package validates and compiles those frames to an exact AVIR `TemporalControl`. NLE lowering
then closes the Item-local clock to a factual Programme-to-Control `TemporalMap`; a package resolver cannot return
a named occurrence/source binding.

Source-owned markers, semantic boundaries and media observations may be projected by an editor as snap guides.
Snapping is one authoring gesture: the accepted transaction stores the resulting frame or package parameter, not
the guide name or a live dependency on its owner. Moving or retiming the guide owner later therefore does not make
NLE export perform a named lookup. A product that wants linked editing updates the affected direct values together
in one transaction; it does not add a second temporal authority to the project.

`prepareNleProjectSave` freezes one exact JSON snapshot and logical history position. A Host writes its text and
then calls `completeNleProjectSave`; later edits remain dirty, and a save from a discarded undo branch cannot
mark its replacement branch clean. `@hypit/nle/node` supplies same-filesystem atomic write and validated reopen.

Export is one-way:

```text
NleProject
  -> resolved @hypit/audiovisual Programme
       + terminal bindings -> @hypit/audiovisual-html  -> HtmlProgram
       ` terminal bindings -> @hypit/audiovisual-audio -> AudioProgram
```

Each media-bin entry stores only a portable relative Media Asset document path. Opening, editing and saving the
NLE project therefore performs no media inspection, staging or analysis and does not require the media files to be
online. Before preview/export, the Host explicitly resolves those paths to ephemeral media values and supplies an
`NleMediaResolver`; AVIR lowering never writes them back into the project. Component items retain only their package reference, parameters and
NLE-owned placement; the selected NLE Host resolves only their package-owned `ProgramSource` contract and selected
Picture/Audio output names. A Component may be Picture-only, Audio-only or expose both. Effects resolve to ordinary
Picture or Audio Operators whose opaque execution programme travels with the Operator.
Materialized Caption cues are ordinary Component items whose package parameters own text and style; NLE Core has
no Caption item kind or resolver category.
The NLE therefore contains media and HTML-capable effects in one paint graph without storing DOM or making package
internals into parent timeline items.

`lowerNleProjectToAudiovisual()` returns the `AudiovisualProgram` itself. It does not return an HTML Source set,
Audio Source closures, `HtmlProgram` or `AudioProgram`. `@hypit/html-video` owns the optional direct-export link
session: it observes the one recursive structural lowering, joins selected Source outputs to independently selected
terminal package facets, and discards that session after terminal programmes are produced.

Package behavior enters the Host through the `hypit.nle-package@1` facet. Components, Effects, Transitions and
mattes are dispatched by exact Module symbol; missing and duplicate implementations fail instead of falling
back to a central kind table. The assembled registry is process-local and is never serialized into the NLE
project.

The Project is a central assembly authority, not a central behavior registry. Packages own Component, Effect,
Transition and matte semantics. Parameters are stored as package-owned canonical values; the Core does
not interpret them or infer editing handles from rendered rectangles. An optional package authoring facet may
independently expose parameter editors, Canvas handles or custom edit plans. None of those affordances is
required for a package instance to render, save, lower or participate in Project undo.

The first headless authoring seam is the separate `hypit.nle-authoring@1` facet. A Component or Picture/Audio Effect package
may inspect its own parameter value and interpret an opaque canonical edit operation. `NleAuthoringHost` locates
the exact instance and turns the package's next parameter value into an ordinary revisioned `item.replace` transaction;
Track locks, Project validation, commit and undo therefore remain authoritative. Authoring facets are optional,
process-local and ignored by the lowering Host. They contain no DOM editor, central parameter schema or required
Canvas handles.

The first one-way materializers are deliberately small:

- `createMediaAssetMaterialization` adds one Media Asset file reference plus one direct Media item; the manifest's
  interpretation is used only to validate and size that import transaction, so drag-and-drop does not need a
  runtime `BlobRef` before committing the edit;
- `createComponentMaterialization` adds one direct package Component instance;
- `@hypit/caption` owns Caption timing/presentation expansion into ordinary caption Component commands.

Applying these transactions retains no live relation to a generator, transcript, SVML source or Build run.

`@hypit/nle/node` exposes `createNodeNleMediaResolver()`: it resolves project-relative asset paths once, caches
duplicate file references, and returns the synchronous resolver used during lowering. A file Host can compose its
`open` callback with `@hypit/media-asset/node.resolveMediaAssetMediaFile()`, so optional transcript, mask and other
Representation files are not loaded merely to preview the base media.

A Transition connects one canonical outgoing/incoming overlap and lowers to a package-owned two-input Picture
Operator. Chained transitions are assembled as disjoint visible and overlap ranges. A matte connects one content
Item to another Picture Item; the matte can itself consume another matte, but dependency cycles are rejected.
The sampled matte Item is not painted independently.

A Group is editing-only and disappears during lowering. A Compound is different: it recursively stores another
flat `NleProject`, closes that child as an ordinary multi-output AVIR Source and can be trimmed or reused like any
other Item. Child and parent currently use the same frame rate, keeping `localStartFrame` unambiguous.

The spatial policy stores an explicit rectangle and `fill | contain | cover` fit on each picture item.
Tracks and item arrays are ordered back-to-front. This package deliberately contains no SVML parser, Build,
Runtime, Result, Provider, Narrative matcher, NLE View projection or reverse author writeback.

Audio participation is equally direct: an Item has an `audio` appearance when its Audio output belongs
to the mix. `audio.effects` is an ordered source-to-output chain of package-owned unary Audio Operators. Track mute
removes its Items from the mix; active Item roots join through the AVIR `mix` node and can be linked downstream to `AudioProgram`
`program`, `process` and `mix` nodes. NLE Core contains no gain, fade, EQ, pan or compressor enum. The first real
owner, `@hypit/audio-gain`, accepts constant or Item-local frame parameters and compiles them into its exact
`TemporalControl`; a crossfade is two ordinary gain envelopes over overlapping Items, not another timeline primitive.

Final video delivery remains downstream. `@hypit/html-video` consumes one structural NLE lowering through
`lowerNleProjectToHtmlVideoDeliveryPlan`, links the matching terminal Source implementations, derives `HtmlProgram`
and `AudioProgram`, and exposes an
injectable parallel render-plus-mux executor. This keeps delivery profiles, Providers, resources and output files out
of the persistent project while allowing a headless NLE document to export directly without an Author/Build Graph.
