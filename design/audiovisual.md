# Audiovisual Programme and HTML lowering

> Status: current owner design for AVIR and its terminal lowering seam.

## Purpose

AVIR is Hypit's closed audiovisual Programme: the terminal-independent relation model produced from an
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

The live Picture terminal is `HtmlProgram`. AVIR remains independent of DOM and browser APIs; one-way lowering resolves
installed Picture Source and Operator symbols and closes their HTML contributions into a resource-complete,
frame-addressable document. Chromium frame-buffer capture and Electron shared-texture capture execute that same
document. DOM, SVG, Canvas, WebGL and WebGPU may be implementation techniques inside the closed page.

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
  -> HtmlProgram + AudioProgram            (invocation-local terminal plans)
  -> selected HTML and Audio execution
  -> preview / delivery
  -> optional explicit Media adoption
```

The NLE Service owns author edits and produces a consistent snapshot. AVIR validation closes that snapshot
for one evaluation. Terminal lowering resolves the selected package implementations before long-running execution.
The HTML video Executor owns process lifetime, cancellation, progress, temporary
resources, caches and delivery. A delivery or preview cache is not a Media Asset until an explicit adoption
Action accepts it.

## Terminal and renderer selection

One linking invocation selects complete Picture Source/Operator contributions and Audio Operator contributions for the
Programme. Picture closes as `HtmlProgram`; Audio closes as `AudioProgram`. A delivery Action then selects an HTML
capture backend and local Audio execution. Chromium and Electron are backend alternatives for the same `HtmlProgram`
ABI. Private passes, textures, caches or workers may vary without changing observable AVIR semantics.

## Media seam

Resolved Media is an invocation-local AVIR Source. Its accepted Media interpretation supplies exact Picture
and Audio domains, stream selections and resource address. The audiovisual renderer samples those members
at the exact Source positions produced by AVIR mappings.

Current resource resolution and Media interpretation come from the Media owner for each invocation.

## Components and processing

A component package may:

1. lower its author parameters entirely into core AVIR relations; or
2. publish a Source or Operator implementation under a package-owned symbol and terminal contribution kind.

The second form extends the fixed evaluation model through an installed symbol. Invocation-local linking requires one
matching HTML or Audio implementation before it closes a terminal program. Parameters remain owned and validated by
the component package; AVIR carries their closed JSON-compatible value for the invocation.

### Operator temporal support

An Operator's `temporalSupport` is a renderer-independent signal relation. For each named input,
`before` and `after` state how far an output observation may read around that Programme position; `tail` states how
long the Operator may continue contributing after its ordinary input extent. A blur, echo, motion estimator or
look-ahead process can therefore declare the input interval it needs without creating another authored timeline or
requiring sequential playback.

Demand expansion is pure AVIR planning: an invocation-selected finite output range and exact Picture observations
expand through each input support, Occurrence placement and Temporal Map into Source-local ranges and samples. This
planning does not assign nodes to Terminals or define execution topology. The Picture Programme closes as one
complete HTML Terminal Programme. Current production HTML components are pointwise; until a non-pointwise HTML
execution ABI exists, linking reports such an Operator as unsupported instead of sampling only the current frame and
silently changing the result.

This is different from HTML frame readiness. `hypit-frame.waitUntil()` delays capture of one already selected output
frame while its page resources settle; it does not request neighbouring AVIR input positions.

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

`@hypit/audiovisual` owns:

- pure Programme types and validation;
- exact clock-free point evaluation;
- exact finite output-demand propagation into graph-node and Source-local ranges and samples;
- local spatial domains and sampling relations currently used only by AVIR;
- Media-to-Source projection;
- fixed package-symbol identities for Sources and Operators.

Authoring elements and the NLE document Reader do not belong to this package. They lower into this package's closed
Programme types through the NLE owner seam. A future authoring package may depend on NLE materialization APIs, but AVIR
must remain independent of that source language.

Spatial algebra remains a source module until another independent owner proves a second release consumer. Terminal
lowering, portable programs and platform execution have separate release boundaries: `@hypit/audiovisual-html`,
`@hypit/audiovisual-audio`, `@hypit/html-program`, `@hypit/audio-program`, `@hypit/html-render-local`, and the selected
Chromium or Electron implementation.

## Required behavior

The implementation preserves these invariants:

- an Occurrence preserves exact coordinated Picture and Audio mappings;
- a constant Picture borrows duration only from its Occurrence;
- point evaluation resolves exact Source positions without choosing a clock;
- a selected finite output range closes an exact output grid and deterministic Source-local demand;
- spatial remaps and animated controls remain renderer-neutral;
- spatial maps compose and invert across affine and projective coordinate relations;
- an explicit signal reconstruction survives exact evaluation on its selected mapped read;
- graphs reject cycles, unreachable facts, wrong signal ports and unclosed spatial domains;
- package-owned implementations are selected by package and symbol;
- resolved Media projects into the corresponding AVIR Source outputs.

The current production path demonstrates direct NLE input, accepted Media and project components, lowering into one
AVIR Programme, closing `HtmlProgram` and `AudioProgram`, and delivering one complete video through the Chromium
backend. Electron consumes the same terminal program through its shared-texture backend.
