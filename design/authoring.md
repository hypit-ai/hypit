# Component authoring and NLE materialization

> Status: current design for the authoring boundary. NLE owns the durable edit.

## Purpose

An optional Composition Source can author a new edit. The NLE Project is the durable authority for editing:

```text
accepted local inputs + TSX Composition Source
  -> materialization
NLE Project document
  -> delivery compilation
HtmlProgram + AudioProgram
  -> selected video delivery
```

The Composition Source is an ordinary `.tsx` module with a small Hypit authoring vocabulary. It supplies functions,
module imports, conditions, loops and author-time data selection with source/module lifetime. The caller resolves
explicit inputs before invoking a synchronous author function that returns finite edit declarations.

The NLE Project is the durable author document that says what the edit is now. Its current markup representation is
SVML, an XML-like spelling interpreted by the NLE Reader and serializer. TSX evaluation materializes NLE facts.

Delivery compiles each accepted snapshot into execution-facing Picture and Audio programs.

## Three layers and their lifetimes

| Layer | Question | Lifetime and authority |
| --- | --- | --- |
| TSX author program | What reusable program and initial author intent should be materialized? | Source/module lifetime; its package or project owns it |
| NLE Project | What is this edit now? | Durable owner document; NLE Service edits it |
| Terminal Programs | What exact HTML Picture and Audio graph will execute? | Invocation-local closed execution input |

The layers are connected by explicit actions:

```text
module import       loads a component implementation
materialize         turns an author program into NLE facts
edit                mutates NLE Project facts
compile             produces HtmlProgram and AudioProgram for the requested output
deliver             executes the closed terminal programs
```

This separation is deliberately asymmetric. Above NLE, ordinary TypeScript, packages and callers may evaluate
variables, expressions, conditions and loops. Materialization accepts their closed result. The delivery compiler
combines selected package implementations with the Project’s direct editing facts, which include occurrences, exact
time, layout, ordered processing, relations and package-owned closed values.

After materialization, an installed package can make its own closed values editable without supplying product UI.
The exact `(package, symbol)` in the Project selects bounded Timeline, Inspector, authoring and temporal facets from
the package chosen by the project lockfile. A presentation facet produces a finite read model; a pure authoring
reducer accepts one semantic operation and returns a replacement closed value. The Host alone turns that value into
an NLE transaction and retains revision, View-guard and validation authority.

## Composition Source

`@hypit/nle/authoring` supplies a JSX factory and the synchronous `defineComposition` / `materializeComposition` seam.
TypeScript can lower the TSX with `jsx: "react"` and `jsxFactory: "jsx"`; the factory collects declarations and has
no React runtime. `Composition` and `Track` arrange the edit. `Media` and `Component` place occurrences with optional
source maps and ordered Processes. `Item` places an already constructed NLE Item. `Transition`, `Matte` and
`SharedValue` declare exact relationships and reusable values.

```tsx
import { Composition, Media, Track, defineComposition, jsx, seconds } from "@hypit/nle/authoring";

export default defineComposition((input: { opening: { path: string } }) => (
  <Composition id="main" width={720} height={1280}>
    <Track id="picture" kind="picture">
      <Media id="opening" asset={input.opening} at={seconds("0")} duration={seconds("13")}
        picture={{ layout: { x: 0, y: 0, width: 720, height: 1280, fit: "cover" } }} />
    </Track>
  </Composition>
));
```

A named input can refer to accepted Media, a measured point or range in a selected take, or other closed data.
`projectSourceInstant` and `projectSourceRange` project exact source time through a single forward affine placement,
including trim and constant forward speed. An out-of-window point fails with its supplied label. Other mappings
require the caller to choose a concrete projection. TSX is trusted project code; synchrony does not sandbox effects.

## Materialization into NLE

Materialization evaluates the author program at author time and produces ordinary NLE Project facts. It must create
stable local ids, explicit references and closed values for every fact that the NLE can edit.

The materializer validates the result with the NLE Project validator. An occurrence becomes a `present`, local
effects become nested `process` declarations, and a cut can carry a `transition`. SVML retains stable IDs, exact
time, explicit references and package symbols.

After materialization, the NLE Project is authoritative for direct editing. A trim, split, slip, retime, transition
change or parameter edit mutates the NLE Project, then compiles the new snapshot for the requested output. TSX source and NLE facts retain
their separate persistence lifetimes.

Re-materialization is explicit. The Jensen importer creates a separate SVML and refuses to replace an existing file.
Adopting materialized facts into an existing edit requires an NLE transaction against its current revision.

## Component instances and expansion

A project can place a package component as one Component Present. A project program can also materialize
a local Composition with independently editable child Items.

A Component Present stores:

- a stable package and symbol selection;
- closed occurrence parameters;
- explicit package-defined Media input references;
- optional package value slots with inline or Project-shared ownership.

The selected package supplies the local Picture extent, optional duration and `HtmlVisual` through
`hypit.nle-render`. The delivery compiler maps the Present's source time to the visual's local frame.
A visual may also request an Item-local time Control for behavior attached to the visible edges. For instance a
caption can follow source time for word timing and evaluate its own entrance and exit against the Item window.
[Component render contract](../packages/nle-delivery/README.md#project-package-render-contributions)

For a Component with editable Media inputs, its authoring contribution declares each current slot's identity,
label, requiredness and accepted interpretation. The package may derive slots from stable collection entries.
Studio supplies accepted Project Media references for the declared slots and validates their interpretations on bind
or materialization. The Component remains responsible for evaluating its required inputs.

When a project program exposes internal objects for direct editing, it materializes them as ordinary NLE Items in
a local Composition. The program resolves their identities, times and references before the caller accepts the result
through an NLE transaction. Each materialized Item can then be selected and edited directly in Studio.

The package owns the reusable visual behavior of a Component Present. The NLE occurrence owns its placement,
source time and selected parameters. A caller that materializes editable children chooses the target Composition
and the transaction that accepts the resulting Items.

## Authoring relations

The authoring vocabulary expresses these editing relations.

```text
Present       places a Media, Component or local Composition in programme time
TimeMap       maps item-local target time to source or child time
Process       applies an Operator to one Present with exact Item-local Control time
Adjust        applies an Operator to the signal accumulated below one real Track position
Transition    supplies outgoing and incoming inputs over an explicit overlap
Matte         supplies content and matte inputs without independently painting the matte
Composition/Track establishes nested local order and Audio participation
Control       maps a local authoring domain to an Operator parameter
```

These relations preserve enough information to compile exact source reads, picture composition and audio mixing.

## AIGC, semantic and other owners

AIGC, semantic analysis, Scene, Script and Feedback remain peer owners. Their results enter authoring through explicit
References, Publications, Media adoption, parameter values or materialization programs:

```text
Generation / Semantic / Scene owner
  -> completed typed result
  -> explicit adoption or authoring-time materialization
  -> TSX values or NLE references
  -> NLE Project
```

Each peer result keeps its producing owner and enters NLE through the stated adoption or materialization operation.
A preparation script or Canvas may submit and await Seedance or WhisperX ahead of time. The Composition Source
receives selected Media and timing evidence; it does not initiate an Invocation. The caller may read local inputs
asynchronously before invoking it. The duration of an edit occurrence is separate from a Model request duration.

## Syntax decision rules

The current persistent SVML syntax and the eventual TSX spelling must preserve these facts without exposing execution
internals:

1. every editable object has a stable id;
2. programme start and duration are separate from source-time mapping;
3. exact source mappings support affine pieces, reverse, hold and wrap;
4. transitions and Mattes are explicit references between objects, not ambiguous child nesting;
5. every Process belongs to one Present and carries exact local Control time; every Adjust has its own Programme range;
6. Picture and Audio of one Media Present share placement and source time. A timed Media Picture may select its reconstruction;
7. component and Operator parameters are closed package-owned JSON objects whose internal fields remain outside the
   central syntax;
8. controls are local to an item, Composition or relation and are pulled through nested mappings by lowering;
9. output clock, renderer canvas, frame rate and process lifetime belong to the selected Executor;
10. the persistent NLE document is the editable authority after materialization.

The [Jensen Composition Source](../examples/ranking-jensen/README.md#import-this-cut-from-tsx) exercises the full cut:
named speech cues, B-roll group placement, loops, cross-dissolves, timed graphics, gain envelopes and captions.
The imported SVML can be opened and delivered without running its source again.
