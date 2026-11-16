# `@hypit/nle`

Durable direct audiovisual composition, exact edit transactions, one open Service per Project document and
deterministic lowering to `@hypit/audiovisual`.

An ordinary TypeScript/TSX author program may materialize an initial Project through an explicit authoring action,
but the Project document is the authority for subsequent edits. Its current SVML serialization is owned by this
package; it is not a separate authoring or renderer IR. NLE edits reopen and lower the saved Project
without re-running the TSX program.

The NLE Project owns a Root plus reusable named Composition definitions, tracks, Present Items, source time and picture
placement. It does not own editor selection, playhead, zoom, thumbnails, renderer processes or delivery policy. Media
and component implementations are
resolved explicitly by the lowering Host and are never serialized into the Project.

The Project also owns one registry of named typed Shared Values. A declaration identifies an exact package Component
slot, one exact package Operator's parameters or an NLE semantic slot such as `picture.layout`. One generic command family, reverse-user index,
deletion rule and Inspector owner serve the registry while each declaration retains its own validation, authoring and
lowering meaning.

Component Items bind package slots by explicit reference; occurrence-local `parameters` remain separate, and
lowering passes resolved values as a slot map instead of merging them. Picture Items keep layout inline or reference a
compatible Shared Value. Spatial authoring supports explicit share, link and unlink; editing changes the one resource,
while unlink copies its resolved value back inline. View-backed edits guard every linked user's Track. Shared Values
cannot form chains, contain expressions or target arbitrary document paths.

Processes use the same rule for package Operator parameters. A Process stores either one inline closed value or one
reference to a Shared Value declared for its exact Operator symbol. The process-authoring planner performs explicit
share, link and unlink operations, and Inspector editing of a shared value guards every current user's Track.

Component Items may bind package-defined input names to portable Media Asset references. The Host resolves those
references for one lowering invocation before resolving the component Source. Picture and Audio appearances may also
select package-owned Signal Reconstruction for their exact mapped reads; constant Picture outputs remain constant and
cannot be reconstructed.

`NleProjectService` owns the process-local revision, undo/redo, dirty/savepoint state and observation for one open
Project. The Project file contains none of those session facts. Saving and reload remain explicit Host operations;
the Service does not hash or monitor files in the background.

Pure Project commands cover direct move, trim, slip and retime as well as exact split, roll, explicit-scope ripple
trim and attached-Audio detachment. Magnetic editing, selection and durable edit grouping remain outside the Project.
Pure materialization, spatial-authoring and Process-parameter planners produce those same transactions, while the
disposable Composition index derives reverse lookups without adding persistent facts.

A Composition Present references another definition in the same Project. References are reusable and acyclic; all
definitions share one Project Service and save lifetime. Lowering namespaces and expands nested occurrences into the
same closed AVIR Programme. Its exact temporal preimage
pulls child regions and Control mappings through piecewise affine rate, reverse, hold, wrap and ordinary edit
relations. A finite multi-preimage becomes multiple flat occurrences; non-constant cubic roots reject explicitly
rather than being sampled or approximated.

Present appearances may own ordered occurrence-local Picture and Audio Processes. Independently timed Adjust Items
process the signal accumulated below their Track position. Both retain exact Control time, explicit enablement and
inline or shared parameters, and lower to native AVIR Operator applications; package UI metadata and executor plans
are not persisted.

Picture Transitions and Mattes are explicit multi-Item Project relations. Transitions evaluate canonical overlap
chains; Mattes form acyclic dependencies whose source Items are sampled but not independently painted. Both lower to
native multi-input AVIR Operators.

The persistent root is `<svml>`. npm and the project lockfile select package implementation versions.

## View subpath

`@hypit/nle/view` owns the optional durable editing arrangement for one Project. Its
`hypit.nle-view` document stores a portable Project reference, active Composition, edit grid and per-Composition
Track locks, row heights and linked-edit Groups. Selection, playhead, viewport state and preview caches remain
outside it.

One open View document has one independent `NleViewService`; revision, undo/redo and savepoints are process-local.
Project changes do not silently rewrite a View. The Host may explicitly reconcile stale references. A Track lock is
checked only for Project transactions initiated through that View and never changes Project or AVIR meaning.

`projectNleTimeline` joins the active Composition with those durable View choices and finite invocation-local Item
observations. Component packages and preview caches may contribute bounded titles, layers and presentation tokens;
the projection accepts no markup and persists none of those observations.

Package authoring contributions declare whether ordinary time-window edits preserve Component and Operator meaning;
the View combines those declarations with Track locks and relation safety before exposing Timeline capabilities.
Presentation remains separate: package Timeline contributions can provide finite text and Host-backed artwork, while
Inspector contributions provide finite fields whose process-local operation projectors are stripped from the Scene.
Only a separately installed authoring contribution can turn such an operation into an ordinary Project transaction.
Component packages may independently contribute authoring and Inspector presentation for an exact shared-value slot.
The Inspector reports the Project resource and all current users; an edit through one View requires every affected
Track to be writable and replaces the one shared Project value.

`projectNleCanvas` exposes active-Composition Item frames and fitted Source rectangles without inspecting package
render trees. Spatial handles follow View locks and a product affordance policy. Inspector and Canvas scenes remain
rebuildable projections and carry neither persistent format markers nor Service revisions.

## Editing Surface subpath

`@hypit/nle/surface` composes one open `NleProjectService`, one open `NleViewService`, explicitly selected package
contributions and the finite Timeline, Canvas and Inspector projections. Its typed `observe` and `command` ports are
the shared application boundary for a frontend, local product adapter or Agent tool.

The Surface preserves independent Project and View revisions, rechecks guards before mutation and returns transient
projection-invalidation receipts. It owns no combined document or revision. A Project mutation that makes View
references stale remains accepted and observable until the caller explicitly reconciles the View. File persistence,
preview/export Actions and transport adapters remain Host responsibilities.
