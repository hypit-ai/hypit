# NLE Studio product adapter

> Status: current NLE Product Provider and browser adapter design.

## Boundary

NLE Studio is a Product Provider and browser adapter over existing authorities. The long-lived ApplicationHost launches
one NLE Studio Product Session against an existing ProjectHost and exposes its finite protocol through the selected
local transport. A Desktop tab, direct browser launch or Agent view presents that same product Surface.

```text
Desktop tab · browser · Agent view
        │
ApplicationHost
        │ Product Session lease
NLE Studio Product Session
  selection · playhead · zoom · pointer drafts
        │ finite product projection
NLE Studio backend
  ├─ ProjectHost context
  │    ├─ shared Project Media Service
  │    ├─ selected Package Environment
  │    └─ open owner-Service leases
  ├─ NLE Editing Surface
  │    ├─ NLE Project Service
  │    ├─ NLE View Service
  │    └─ selected package contributions
  ├─ audiovisual preview Executor port
  ├─ NLE Delivery Service
  │    └─ injected HtmlVideoExecutor
  └─ explicit Project/View file persistence
```

The NLE session backend is the product composition root. It leases the independently owned Project and View Services
from the ProjectHost registry; the Editing Surface routes each mutation to its fact owner. Closing the presenting
caller releases its Product Session lease without defining the ApplicationHost or ProjectHost lifetime.

The presenting caller mounts NLE Studio as one Product Surface. A product selector may choose among several installed
products, and the selected editor receives the viewport assigned to that Product Session.

## Lifetimes

The Project Service lives for the open NLE Project document and may be shared by several Product Sessions. An
explicitly selected View document has its own Service, revision and save lifecycle. When no View document is selected,
the NLE session backend creates a session-only View from the root Composition; it is never silently written beside the
Project.

Selection, playhead, viewport and pending pointer gestures live only in the browser client. Refreshing the page may
discard them without touching author facts. Timeline, Canvas and Inspector scenes are rebuildable finite projections.

Media catalog entries come from the ProjectHost's one Project Media Service. NLE Media references do not become a
second catalog, and another NLE or Canvas Product Session in the same project observes that same collection. Preview
frames and generations come only from the selected preview Action port. A structural Canvas remains useful when no
preview capability has been selected, but it is not presented as rendered programme output.

Video export is a Project-local `NleDeliveryService` Action. The application distribution injects an ordinary
`HtmlVideoExecutor` into the Product Provider; the Product Session opens the Service for its selected ProjectHost and
projects start, observe and cancel operations. Closing the Product Session closes that Service and cancels its active
delivery Actions. The Service owns its FFmpeg/browser process tree through the injected Executor.

The browser's Media bin projects that shared catalog. Selecting an available entry explicitly places it at the current
playhead on a compatible unlocked Track; when none exists, the browser first asks the NLE owner to create one. The
backend still performs the authoritative interpretation and materialization. In structural Canvas mode, an accepted
image or video resource may be shown inside its Present Item's layout as source identification. This is a direct media
resource projection, not Component or Operator evaluation and not an audiovisual preview frame.

The session assembles NLE authoring, Timeline presentation and Inspector presentation contributions from the
ProjectHost's already selected Package Environment. The NLE contracts validate and index those process-local
capabilities; ProjectHost does not interpret them. NLE Studio additionally owns the finite `hypit.nle-component`,
`hypit.nle-adjust` and `hypit.nle-transition` catalog contracts used by its text, subtitle, graphic, effect and
transition creation surfaces. Selecting an entry invokes the matching NLE materialization planner. The package owns
the exact Component or Operator symbol, closed initial parameters and declared defaults; it does not return arbitrary
Project commands.

Inspector contributions may project finite scalar fields and stable row collections. Every field id remains unique
within its section, so the browser submits only section, field and value; it never receives array indexes, JSON paths
or package functions. The backend resolves that field against the selected package's exact symbol and asks its pure
authoring reducer for replacement closed parameters. Package contributions cannot create Tracks, choose transaction
boundaries or persist interface state. Timeline presentation is descriptive only, while generic trim and split are
offered only when the selected package declares a conservative time-window operation.

The Inspector separately projects NLE-owned ownership controls for existing Component value slots. An inline slot can
be shared or linked; a shared slot can be rebound or unlinked by copying its resolved value inline. These operations
change only explicit Item bindings and Project Shared Values and therefore use the same Surface revisions, View guards
and invalidations as every other Project transaction. The package contributes the slot's value semantics, not the
ownership transaction or its UI.

## Local protocol and persistence

The loopback server serves the client and same-origin JSON operations for finite observation, guarded Surface commands,
save and reload. `POST /api/observe` accepts the Product Session's finite observation union. Initial `open` contains
status, Timeline, Canvas, Composition navigation, Item-to-Media projection, Media, Catalog, Preview and delivery
availability without embedding either complete owner document. Inspector is another keyed observation. The protocol is a product
adapter and carries no persistent format marker or independent revision. Project and View revisions remain visible
and separate.

Every accepted mutation returns one compact receipt containing current owner status, changed owners, invalidated
projection names and an optional result address. The browser retains unaffected projections and rereads only the
invalidated Timeline, Canvas, Media, Catalog, Preview or delivery observation. Inspector is reread only for the
selected Item when invalidated. `GET /api/events` streams NLE Project and View changes, Project Media Catalog
generations and Delivery progress. The browser rereads the finite open projection on connect or reconnect and
rereads invalidated projections on live edits. The Delivery observation endpoint provides the current result or
diagnostic by handle.

`POST api/deliveries` starts an export of the session's already selected NLE Project document through the injected
Delivery Service. `GET api/deliveries/:handle` observes it and `DELETE api/deliveries/:handle` requests cancellation.
The destination remains a portable Project path validated by that Service.

Within the Product Session mount, `POST api/media/import?name=...` carries one raw browser `File` body. The adapter
streams it to an invocation-local temporary file, calls the Node Project Media Service's adoption Action with bounded
container-index inspection, then
removes the temporary file. Multiple selected files are separate sequential requests. The route returns the refreshed
Media identity in its receipt and invalidates the Media projection. Media identity remains the resulting
project-relative Media Asset manifest path. This transport does not place the accepted Media into the NLE document.

Saving asks the selected Owner Provider to serialize each dirty owner snapshot, atomically replace its selected file
and mark that exact Service revision saved only after the write succeeds. Reload is an explicit user or caller
operation that accepts current file bytes into the corresponding Service. The Host performs no content hashing or
continuous integrity comparison.

A Media placement operation carries one Project Media reference, destination Composition and Track, exact session
revisions and frame-grid placement. The product adapter resolves the accepted Media interpretation, converts frames
to exact NLE time, calls the NLE Media materialization planner and submits its ordinary Project transaction through
the Editing Surface. Media resource routes accept only capability tokens owned by that Product Session and support
byte ranges without publishing filesystem paths.

A Component materialization operation carries the selected package and offering id, destination, Item id, frame-grid
placement and exact session revisions. The backend resolves only an offering selected by the Project manifest, calls
the NLE Component materialization planner and submits the resulting transaction through the same Surface. Component
offerings resolve through the ProjectHost's selected Package Environment. Package Timeline artwork, when present,
stays process-local and is exposed through an opaque same-origin presentation resource route.

An Adjust materialization resolves one selected effect offering and creates an independently timed Item on a
compatible Picture or Audio Track. A Transition materialization resolves one selected transition offering and an
explicit pair of Present Items at a direct Picture cut. Its one atomic Project transaction moves the incoming Item by
the chosen transition duration and adds the relation, so the Service never accepts an unowned overlap as an
intermediate state. Existing overlaps, gaps and incompatible selections are rejected by current NLE structural rules.

## Package

`@hypit/nle-studio` is an independent release because it has a browser artifact, Product Provider and product lifecycle
distinct from headless `@hypit/nle`. It depends on public ProjectHost, NLE owner and Surface contracts. The Project
Media Service comes from the ProjectHost; preview and delivery remain explicit Executor dependencies whose platform
implementations are selected by the application distribution.
