# Audiovisual Programme and execution

> Status: current owner design for AVIR and audiovisual execution.

## Purpose

AVIR is Hypit's closed audiovisual Programme: the renderer-independent relation model produced from an
NLE snapshot, installed project components, accepted Media and explicitly opened Published Surfaces. It
describes direct edit time, occurrence placement, signal reads, picture composition, audio mixing and
package-owned processing without choosing an output clock or a platform renderer.

NLE Projects, component parameters, Media Assets and strong owner documents remain authoritative. A Host may inspect
or serialize an AVIR projection for diagnostics; reopening the work rebuilds it from those owners and the installed
package selection.

An ordinary TypeScript/TSX author program is evaluated at author time to materialize or update NLE facts. The accepted
NLE snapshot and resolved installed implementations are the input authority for AVIR lowering.

## One live evaluation constitution

Every live AVIR implementation obeys one operational model:

- a Picture is evaluable at any exact position in its finite Programme domain;
- an Audio signal is evaluable over explicitly requested finite ranges;
- a Source read names an exact local position or range and never implies sequential playback;
- spatial sampling maps a finite target domain into a finite source domain;
- an Operator declares its named inputs, temporal support, controls and installed package implementation;
- output frame rate, audio sample rate, canvas, quality and encoding belong to the execution request;
- evaluating one requested position does not require executing earlier Programme positions.

“HTML-like” means this frame-addressable contract, not DOM ownership. HTML, Canvas, SVG, WebGL, WebGPU or
a native renderer may implement the same Programme. A renderer may internally use passes, tiles, textures,
caches, workers and demand propagation; those are executor-private implementation details.

Live AVIR Sources implement exact position and finite-range evaluation according to this contract.

## Programme facts

One Programme owns:

- a finite exact temporal domain;
- an optional finite Picture output domain;
- resolved Source definitions and their outputs;
- Occurrences that give Sources local duration, active ranges and parent placement;
- exact occurrence-to-source temporal mappings;
- optional package-owned signal reconstruction selected for one mapped Source read;
- a Picture graph of transparent, use, restrict, crop, remap, over and apply relations;
- an Audio graph of silence, use, restrict, mix and apply relations;
- package-owned Source and Operator symbols with closed parameters.

A timeless Picture owns no artificial temporal domain. Its duration belongs to each Occurrence. Picture
and Audio from one Source may be selected by one Occurrence so their coordinated placement remains one
fact.

A Temporal Map answers which exact Source position is read at a Programme position. Ordinary Picture and
Audio sampling follows the selected Source implementation's normal signal interpretation. When author intent
requires another reconstruction, such as nearest-picture selection, frame interpolation or pitch-preserving
Audio stretch, the signal selection carries an explicit package symbol and closed parameters. Reconstruction
does not own speed: the Temporal Map remains the only target-to-source position relation. It is attached to
the mapped read rather than the Media leaf or a downstream effect because it needs both that Source and that
specific Mapping. A renderer must implement or accurately reject the selected reconstruction.

An installed implementation is named by npm package and package-owned symbol. npm semver and the project
lockfile select its version. AVIR carries no package source text or language registry. The lowering package validates
parameters before the Programme closes; an executor reports a precise missing-package or unsupported-symbol
diagnostic before evaluation.

## Ownership and lifetime

```text
NLE Project + component packages + Media / Published Surface references
  -> NLE snapshot and component lowering
  -> closed AVIR Programme                 (invocation-local projection)
  -> selected audiovisual Executor
  -> preview / review / delivery
  -> optional explicit Media adoption
```

The NLE Service owns author edits and produces a consistent snapshot. AVIR validation closes that snapshot
for one evaluation. The audiovisual Executor owns process lifetime, cancellation, progress, temporary
resources, caches and delivery. A delivery or preview cache is not a Media Asset until an explicit adoption
Action accepts it.

## Renderer selection

One audiovisual Action selects a complete Picture implementation and a complete Audio implementation for
the Programme it executes. Picture and Audio may use different platform implementations because they are
different signal domains. The executor may compile supported subgraphs and use private passes, caches or
workers only when that does not change observable AVIR semantics. Otherwise capability validation fails before
work begins.

## Media seam

Resolved Media is an invocation-local AVIR Source. Its accepted Media interpretation supplies exact Picture
and Audio domains, stream selections and resource address. The audiovisual renderer samples those members
at the exact Source positions produced by AVIR mappings.

Current resource resolution and Media interpretation come from the Media owner for each invocation.

## Components and processing

A component package may:

1. lower its author parameters entirely into core AVIR relations; or
2. publish a Source or Operator implementation under a package-owned symbol that obeys the live AVIR ABI.

The second form extends the fixed evaluation model through an installed symbol. A renderer validates support for that
symbol before evaluation. Parameters remain owned and validated by the component package; AVIR carries their closed
JSON-compatible value for the invocation.

## External authoring and materialization

Scene and other spatial authoring systems are strong peer owners. Their ordinary path into NLE is:

```text
authoring owner -> explicit record Action -> Publication or file -> Media adoption -> NLE occurrence
```

A strong owner may instead expose a live Published Surface only when it can meet an explicit
frame-addressable contract with stable addressing, cancellation and exact results. The surface remains owned by its
source domain until an explicit NLE occurrence or Media adoption accepts it.

A project component may instead materialize an authoring program into an NLE Composition before lowering. That
authoring program remains outside AVIR; only the resulting NLE snapshot and resolved package implementations cross
the lowering seam.

An external materialization program publishes files for adoption. An installed component participates after NLE has
closed its instance parameters and Media inputs: it may lower those values into core AVIR relations or implement the
fixed Source/Operator ABI. AVIR semantics determine evaluation.

Generation results enter composition when a completed Publication is selected for Media adoption, parameter use or
another target-owner materialization.

## Package and source shape

The first release boundary is `@hypit/audiovisual`:

- pure Programme types and validation;
- exact clock-free point evaluation;
- local spatial domains and sampling relations currently used only by AVIR;
- Media-to-Source projection;
- fixed package-symbol identities for Sources and Operators.

Authoring elements and the NLE document Reader do not belong to this package. They lower into this package's closed
Programme types through the NLE owner seam. A future authoring package may depend on NLE materialization APIs, but AVIR
must remain independent of that source language.

Spatial algebra remains a source module until another independent owner proves a second release consumer.
Web lowering and local platform execution remain source concerns until browser/process weight or an
independent consumer proves `@hypit/audiovisual-web` or `@hypit/audiovisual-local` as release boundaries.

## Required behavior

The implementation preserves these invariants:

- an Occurrence preserves exact coordinated Picture and Audio mappings;
- a constant Picture borrows duration only from its Occurrence;
- point evaluation resolves exact Source positions without choosing a clock;
- spatial remaps and animated controls remain renderer-neutral;
- spatial maps compose and invert across affine and projective coordinate relations;
- an explicit signal reconstruction survives exact evaluation on its selected mapped read;
- graphs reject cycles, unreachable facts, wrong signal ports and unclosed spatial domains;
- package-owned implementations are selected by package and symbol;
- resolved Media projects into the corresponding AVIR Source outputs.

The first production path must then demonstrate a TSX-like author program or direct NLE input, accepted Media plus one
project component, materialization into one NLE snapshot, lowering into one Programme and reaching preview or delivery
through one complete renderer.
