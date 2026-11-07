# `@hypit/nle-view`

Persistent NLE workspace projection over an audiovisual Programme. The View owns lane identity,
membership and presentation order. Rectangle placement and extent are derived from the Programme's
Occurrence, Placement and output Mapping; they are never copied into this package.

The pure edit planners change only this legacy Author View membership. It is not the persistent flat NLE
Project: current Move, Trim, Slip, Split, Roll and Ripple operations are revisioned `@hypit/nle` transactions,
and AVIR Programme values are disposable compiled results rather than editable endpoints.
The declaration facet validates the Programme reference and lane structure while contributing zero Records
and zero graph Components, so deleting a View cannot alter the compiled Programme.

## Optional subject projections

`NleSubjectProjector` is the data-only adapter seam for package-owned internal structure. A declaration may
register no projector, one projector, or several independent projectors. Requirements name exact author
inputs/outputs and Types; a Host must not scan values by shape or package convention.

A projected temporal region is display geometry only. It has no implicit move, trim, split, resize or drag
permission. Each writable `NleProjectedAction` instead delegates to an exact Author declaration planner,
action and Source/node subject. The projection provider may aggregate values owned elsewhere without
acquiring their mutation authority.

Multiple Programme endpoints do not require projectors: a Picture/Audio Source may simply place its two
Occurrence endpoints in separate View lanes. Multiple projectors are only for multiple independently useful
internal authoring projections, not for mirroring implementation layers.

Caption demonstrates the boundary: it projects internal Cue rows through an optional Occurrence Map and
offers component-owned Style/Hidden actions, but no temporal action. A future authored Timing package may
delegate shift or trim itself; a derived alignment remains read-only unless explicitly materialised.

## Headless assembly

`prepareNleSubjectProjection` joins a domain-resolved Programme subject to compiler provenance and the exact
owning declaration. It resolves projector requirements only by declared input/output edge names, and returns
the logical outputs an interactive Build must observe. `projectPreparedNleSubject` then consumes the already
materialized Records plus compiler-owned logical-output resolution. Neither step starts a Runtime, provider,
generation model, transcription job, renderer, or Result lookup.

`prepareNleViewProjection` applies that preparation to every endpoint in every persisted lane and unions all
required logical outputs. Once the Programme has closed, `projectPreparedNleView` accepts the realized endpoint
Maps and produces the complete lane → subject → package projection tree. Lane order remains View state; timing
and write authority still come from the Programme and declaration owners.

This split prevents an internal projection output from disappearing merely because Programme rendering did
not otherwise demand it. It also avoids reverse matching by Source id, value shape, package name, graph
adjacency, or rendered pixels. Author provenance carries the stable Source unit id as well as its display name,
so imported Sources with equal names cannot be edited through the wrong document.
