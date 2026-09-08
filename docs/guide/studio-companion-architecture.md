---
title: Studio Companion Architecture
description: The boundary between domain components, Companion packages, Studio ABI and author writeback.
---

# Studio Companion Architecture

Hypit Studio is not a capability hidden inside a video component. The system has four independent
responsibilities:

```text
Core / Source compiler
  -> domain packages
  -> independent Studio Companion packages
  -> Studio application
```

Core owns typed graph compilation and execution without video or editor vocabulary. Domain packages
own public video values and deterministic programs without importing Studio. A separate
`*-studio` package translates one domain into the finite Studio ABI. Studio owns UI rendering,
revisioned source transactions and recompilation without recognizing Caption, Media, Ranking or any
other component by name.

## Companion kinds

- A **Track Companion** matches a terminal Type and exact `ModuleRef + Surface`, then declares lane,
  entities, ordered display layers, source bindings and visible Inspector fields.
- A **Film Companion** declares the Film reference that selects the semantic axis and the child
  references that are terminal Tracks.
- A **Script Companion** owns its grammar source map and Selection/Moment marker relocation.

The video Distribution explicitly carries its official set. A package actually selected by the
current Source closure may carry its own Companion facet. Their ids are qualified by the package
loader, and duplicate or ambiguous Companions are errors rather than replacement policy.

## Author provenance

Companions never search Source text. A Source Frontend may retain structural author elements and
input ranges while lowering syntax. Elaborator hygienizes those identities with Records, components
and outputs and emits transient `hypit.author-provenance@1` data. Studio joins its presentation
observations to those exact graph identities and resolves a write to one author endpoint.

The provenance is recomputed with every compile. It is not stored in SVML/SVS/SVRun, does not add an
id authors must maintain, and creates no lock, digest inventory or project database.

## Editing boundary

Studio exposes two structured operations:

- `timeline.adjust` follows executed Temporal lineage. Semantic authority changes Script markers;
  parameter authority changes the exact author endpoint; fixed authority is read-only.
- `parameter.adjust` changes only a binding explicitly selected by the Companion's Inspector table.

Companions choose from Studio's finite controls and gestures. They cannot inject DOM, CSS, a parser,
filesystem callbacks or a domain-specific widget. Author-language codecs produce Source edits;
Studio validates the current revision, applies every affected file as one transaction, recompiles,
and restores all files if publication or compilation fails.

This makes another Studio possible: it may consume the same domain contracts, Temporal lineage and
compiler provenance without requiring a domain component to know Hypit Studio exists.
