# Component authoring and NLE materialization

> Status: current design for the authoring boundary. NLE owns the durable edit; AVIR owns the closed audiovisual
> execution projection.

## Purpose

Hypit has one authoring path for reusable audiovisual components and one durable authority for the edit:

```text
TSX author program
  -> materialization
NLE Project document
  -> deterministic lowering
AVIR Programme
  -> HtmlProgram + AudioProgram
  -> selected video delivery
```

The TSX program is ordinary TypeScript with a small Hypit authoring vocabulary. It supplies functions, module
imports, conditions, loops, component composition and author-time data selection with source/module lifetime.

The NLE Project is the durable author document that says what the edit is now. Its current markup representation is
SVML, an XML-like spelling interpreted by the NLE Reader and serializer. TSX evaluation materializes NLE facts.

AVIR is the invocation-local, renderer-independent semantic projection of an accepted NLE snapshot. Terminal linking
closes its Picture and Audio as execution-facing programs.

## Three layers and their lifetimes

| Layer | Question | Lifetime and authority |
| --- | --- | --- |
| TSX author program | What reusable program and initial author intent should be materialized? | Source/module lifetime; its package or project owns it |
| NLE Project | What is this edit now? | Durable owner document; NLE Service edits it |
| AVIR Programme | How does this accepted snapshot evaluate? | Invocation-local semantic projection |
| Terminal Programs | What exact HTML Picture and Audio graph will execute? | Invocation-local closed execution input |

The layers are connected by explicit actions:

```text
module import       loads a component implementation
materialize         turns an author program into NLE facts
edit                mutates NLE Project facts
lower               closes an NLE snapshot as AVIR
link                closes AVIR as HtmlProgram and AudioProgram
deliver             executes the closed terminal programs
```

This separation is deliberately asymmetric. Above NLE, ordinary TypeScript, packages and callers may evaluate
variables, expressions, conditions and loops, but materialization accepts only their closed result. Below NLE, AVIR
and terminal programs may express the complete execution graph, while the Project keeps only the productive direct
editing subset: occurrences, exact time, layout, ordered processing, relations and package-owned closed values. The
NLE document is neither a stored program assignment language nor a universal renderer IR.

After materialization, an installed package can make its own closed values editable without supplying product UI.
The exact `(package, symbol)` in the Project selects bounded Timeline, Inspector, authoring and temporal facets from
the package chosen by the project lockfile. A presentation facet produces a finite read model; a pure authoring
reducer accepts one semantic operation and returns a replacement closed value. The Host alone turns that value into
an NLE transaction and retains revision, View-guard and validation authority.

## Author programs

A component author imports ordinary modules and returns Hypit authoring elements. The exact TSX spelling remains to be
chosen, but the semantic kernel is small:

- `Timeline` or `Composition` establishes a local finite programme domain;
- `Track` establishes ordered Picture or Audio participation;
- `Media`, `Component` and `Use` create Present occurrences;
- `TimeMap` describes target-to-source time, including affine pieces, reverse, hold and wrap;
- `Control` describes a parameter over a local authoring domain;
- Present-local `Process` applies one Operator to one Present;
- `Transition` relates an outgoing and incoming Present;
- `Matte` relates content to a matte-source Present;
- `Composition` and Track order describe nested Picture composition and spatial use;
- named Picture and Audio elements preserve the two signal domains of one occurrence.

These elements are authoring declarations over local authoring time, occurrences, relations and package symbols.
Renderer and model execution settings stay with their selected Executors.

An author program may use ordinary program logic to choose declarations:

```tsx
import plan from "./generated/shot-plan.json";

export function Shot() {
  return (
    <Timeline duration="13s">
      <PictureTrack id="main">
        <Media id="A" asset={plan.first} start="0s" duration="10s" />
        <Media id="B" asset={plan.second} start="8s" duration="5s">
          <Process operator={colorGrade} parameters={{ lut: plan.lut }} />
        </Media>
        <Transition between={["A", "B"]} start="8s" duration="2s" type="dissolve" />
      </PictureTrack>
    </Timeline>
  );
}
```

The generated plan may originate from Generation, Script, Transcript, semantic evidence or an explicit project
program. The author program receives its selected result as a value or Reference during author-time materialization.

## Materialization into NLE

Materialization evaluates the author program at author time and produces ordinary NLE Project facts. It must create
stable local ids, explicit references and closed values for every fact that the NLE can edit.

The result of the example above is conceptually:

The materialized SVML uses the schema shown in [NLE Project](nle.md): `B` becomes one `present`, the grade becomes a
nested `process`, the cut becomes one `transition`, and every source and Control mapping is written as exact rational
time. The important facts are stable ids, exact ranges, explicit references and unversioned package symbols.

After materialization, the NLE Project is authoritative for direct editing. A trim, split, slip, retime, transition
change or parameter edit mutates the NLE Project, then lowers the new snapshot to AVIR. TSX source and NLE facts retain
their separate persistence lifetimes.

Re-materializing a changed TSX program is an explicit operation. The caller chooses the target Composition and the
NLE transaction that accepts the newly materialized facts.

## Component instances and expansion

A component may remain one opaque NLE Present or expose an editable materialization boundary.

An opaque instance stores:

- a stable package and symbol selection;
- closed occurrence parameters;
- explicit package-defined Media input references;
- optional package value slots with inline or Project-shared ownership;
- declared Picture and Audio outputs.

An expanded result materializes a local NLE Composition with stable child ids. Acceptance is explicit, after which
that Composition is ordinary NLE author material and does not retain a live dependency on the Component source or the
author program. A component can use ordinary functions, conditions and loops internally, but only a finite
materialized result with stable identity is independently editable.

An opaque Component source remains the implementation authority for its reusable behavior, while its NLE occurrence
owns this project's placement, trim, local parameters and direct edit relations. A caller that materializes editable
children chooses the target Composition and transaction; rerunning the author program later produces another explicit
candidate transaction rather than rewriting accepted NLE facts.

## Authoring relations

The authoring vocabulary deliberately mirrors author intent rather than AVIR node algebra:

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

The NLE lowerer turns these facts into AVIR `use`, `restrict`, `crop`, `remap`, `over`, `mix` and `apply` relations.
The authoring layer does not need to expose those relations as a general algebra, but it must retain the information
needed to lower them exactly.

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

## Syntax decision rules

The current persistent SVML syntax and the eventual TSX spelling must preserve these facts without exposing execution
internals:

1. every editable object has a stable id;
2. programme start and duration are separate from source-time mapping;
3. exact source mappings support affine pieces, reverse, hold and wrap;
4. transitions and Mattes are explicit references between objects, not ambiguous child nesting;
5. every Process belongs to one Present and carries exact local Control time; every Adjust has its own Programme range;
6. Picture and Audio may remain coordinated for one Present while receiving different reconstruction selections;
7. component and Operator parameters are closed package-owned JSON objects whose internal fields remain outside the
   central syntax;
8. controls are local to an item, Composition or relation and are pulled through nested mappings by lowering;
9. output clock, renderer canvas, frame rate and process lifetime belong to the selected Executor;
10. the persistent NLE document is the editable authority after materialization.

The first syntax experiment should cover one vertical slice containing a 13-second two-clip transition, an Item-local
Process, a piecewise retime, a Matte, a component instance and one semantic or generated input. The experiment is
successful only when the same NLE Project can be edited directly, serialized, reopened and lowered to the same AVIR
semantics without re-running the author program.
