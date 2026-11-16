# NLE Studio local product adapter

> Status: current standalone local NLE product design.

## Boundary

NLE Studio is a product adapter over existing authorities. It is distributed by Hypit and runs through a loopback HTTP
service with a browser client. An Application Host may launch it inside an existing ProjectHost; the standalone CLI
first opens the selected Project Boundary through the same ProjectHost contract. It neither requires nor extends
another application shell.

```text
Browser session
  selection · playhead · zoom · pointer drafts
        │ finite HTTP projection
Local NLE Studio Host
  ├─ ProjectHost context
  │    ├─ shared Project Media Service
  │    ├─ selected Package Environment
  │    └─ open owner-Service leases
  ├─ NLE Editing Surface
  │    ├─ NLE Project Service
  │    └─ NLE View Service
  ├─ audiovisual preview Executor port
  └─ explicit Project/View file persistence
```

The NLE session backend is the product composition root. It leases the independently owned Project and View Services
from the ProjectHost registry; the Editing Surface routes each mutation to its fact owner.

The browser mounts NLE Studio directly as its root product. A product selector may choose among several installed
products in a larger Host, but it never wraps one product inside another product page. When NLE is the only selected
product, its editor owns the whole browser viewport; no Workbench shell, nested browser page or application-specific
outer layer is required.

## Lifetimes

The Project Service lives for the open NLE Project document and may be shared by several Product Sessions. An
explicitly selected View document has its own Service, revision and save lifecycle. When no View document is selected,
the NLE session backend creates a session-only View from the root Composition; it is never silently written beside the
Project.

Selection, playhead, viewport and pending pointer gestures live only in the browser client. Refreshing the page may
discard them without touching author facts. Timeline, Canvas and Inspector scenes are rebuildable finite projections.

Media catalog entries come from the ProjectHost's one Project Media Service. NLE Media references do not become a
second catalog, and another NLE or Canvas Product Session in the same project observes that same collection. Preview
frames and generations come only from the audiovisual Executor port. A structural Canvas remains useful when no
preview Executor has been selected, but it is not presented as rendered programme output.

## Local protocol and persistence

The loopback server serves the client and same-origin JSON operations for session observation, guarded Surface
commands, Inspector projection, save and reload. The protocol is a product adapter and carries no persistent format
marker or independent revision. Project and View revisions remain visible and separate.

Saving asks the selected Owner Provider to serialize each dirty owner snapshot, atomically replace its selected file
and mark that exact Service revision saved only after the write succeeds. Reload is an explicit user or caller
operation that accepts current file bytes into the corresponding Service. The Host performs no content hashing or
continuous integrity comparison.

## Package

`@hypit/nle-studio` is an independent release because it has a browser artifact, a Node deployment entry and a
product lifecycle distinct from headless `@hypit/nle`. It depends on public ProjectHost, NLE owner and Surface
contracts. The Project Media Service comes from the ProjectHost; preview remains an Executor dependency whose platform
implementation is separately selected.
