# NLE Project

> Status: current owner design for direct audiovisual composition. Durable editing arrangement and guards are owned
> by the separate [NLE View design](nle-view.md).

## Purpose

An NLE Project is the durable author document that says what one edit is now. It owns named Composition definitions,
one Root Composition entry, direct Programme time, Picture and Audio Track order, Present occurrences, Media,
component and local Composition references, source-time relations and NLE-owned spatial placement. It does not
persist AVIR, renderer programmes, editor UI state or execution plans.

The Project is one owner object inside the wider Hypit Project Boundary. “Project” here means one editable NLE
document, not the directory-wide collection of Media, Generation, Scene and other owners.

An ordinary TypeScript/TSX author program may create the initial Project through an explicit materialization action.
That program is reusable source/module input to materialization. Once materialized, NLE commands edit the Project
directly; the Project serializes the current edit and lowers to AVIR without re-running the author program. SVML is
the NLE Project's current document representation.

The authoring boundary is described in [Component authoring](authoring.md). It deliberately keeps AIGC recipes,
semantic evidence, Scene state and renderer execution outside this document. Their selected results enter NLE through
ordinary References, Publications, Media adoption or explicit materialization.

## SVML document and initial NLE surface

The durable NLE Project is serialized as **SVML**, an XML-like markup representation owned by NLE. The NLE Reader and
serializer enforce the current Project schema, and AVIR lowering consumes the resulting NLE Project snapshot.

The initial SVML surface is deliberately small:

- `Composition` is a reusable local time and Picture-canvas definition;
- a `Present` is a temporal Item for a Media, Component or another Composition;
- a Composition Present is the parent timeline's one Item for the nested Composition;
- a `Track` is an ordered Picture or Audio editing row;
- a Picture Track with the subtitle role contains subtitle Component Presents;
  a subtitle Component Present belongs to a Track with that role;
- Item-local source-time mappings and Processes are stored on the Present;
- an `Adjust` is a timed Process over the signal accumulated below its Track position;
- a Transition is an explicit relation around an adjacent Picture cut.

The current SVML shape includes:

```xml
<svml id="edit" name="Edit" root="root">
  <shared-value id="look" name="Main look" owner="operator">
    <operator package="@hypit/picture-filter" symbol="filter" />
    <value>{"contrast":1.1}</value>
  </shared-value>
  <composition id="root" name="Main" width="1920" height="1080">
    <track id="picture" name="Picture" kind="picture" enabled="true">
      <present id="take" source="media" start="0/1" duration="10/1" enabled="true">
        <media path="media/take.media.json" />
        <source-time>
          <linear target-start="0/1" target-end="10/1" source-start="0/1" rate="1/1" />
        </source-time>
        <picture>
          <layout x="0" y="0" width="1920" height="1080" fit="cover" />
          <process id="grade" package="@hypit/picture-filter" symbol="filter"
                   enabled="true" parameters-ref="look">
            <control-time>
              <linear target-start="0/1" target-end="10/1" source-start="0/1" rate="1/1" />
            </control-time>
          </process>
        </picture>
      </present>
    </track>
  </composition>
</svml>
```

The Reader owns the exact complete schema. A Component Present may remain opaque or point at a materialized local
Composition; either way its parent occurrence is one Item and its internal ordering is local to that Composition.

SVML does not persist a second Display tree. The Host derives a frame-local display from the active Composition,
Track order, active Items, Item-local Processes and explicit relations. Picture Track order is the local paint order;
there is no global `z` field. A nested Composition starts a new local ordering and appears in its parent as one
Present. The minimal syntax therefore does not need a generic stack or scope language. Lowering may build private
evaluation structures, but those are not NLE author facts.

For the first CapCut-style editing surface, ordinary Picture Present intervals on one Track are disjoint. If a
gesture would overlap an existing Item, the editing surface plans another compatible Track or creates one. That
planning is a projection concern, but the NLE Service is authoritative: it revalidates the complete command against
the current Project revision and rejects invalid Picture-track overlap atomically. The one explicit exception is the
canonical overlap named by a Transition. Audio Track intervals may overlap and mix.

A Present-local Process uses exact Item-local Control time. Splitting a Present slices and rebases that Control time
with the Source relation. Processing that covers several Presents uses a timed Adjust Item on a real Track; wrapping
the Presents in a nested Composition and applying an outer Process remains another explicit authoring choice.

## Project, View, Session and Projection

The four layers are independent:

| Layer | Question | Persistence |
| --- | --- | --- |
| NLE Project | what is the audiovisual work? | durable author document |
| NLE View | how should one editor arrange and guard editing? | optional durable editor document |
| Host Session | what is happening in this open Surface now? | Product Session lifetime |
| Projection | what finite Timeline, Canvas or Inspector read model is shown? | rebuildable |

Selection, playhead, zoom, scroll, hover, current tool, pointer drafts, thumbnails and waveform resources are
not Project facts. Track locks, durable edit Groups, editor grid and Track row height belong to NLE
View. Track enablement, Track order, Item placement and Picture layout belong to the Project because they describe the
work or its author structure.

AVIR lowering accepts only an NLE Project and explicit Host resolvers. For every two Views over the same Project:

```text
lower(project, host) == lower(project, host)
```

There is deliberately no View argument whose value could change the Programme.

## First Project document

The first document format is the SVML representation of the NLE Project. npm and the project lockfile select its
implementation. The Reader and serializer operate on the current owner shape.

One Project contains a non-empty registry of named Composition definitions and selects one by id as its Root. Every
Composition is an equal definition owned by the same document; Root is only the default preview, lowering and delivery
entry. A Composition owns:

- a finite logical Picture canvas extent;
- ordered Picture and Audio Tracks;
- Track name and enablement;
- ordered Media and component Present Items plus optional explicitly timed Adjust Items;
- occurrences referencing other Composition definitions in the same Project;
- exact Programme-local start and visible duration;
- an Item-local piecewise source-time relation;
- optional Picture and Audio participation;
- one NLE-owned Picture frame, fit mode and focal alignment;
- ordered occurrence-local Picture and Audio Processes;
- exact Item-local Control time for Processes and Adjusts;
- explicit Picture Transition and Matte relations between Present Items;
- portable Media Asset document references;
- installed component package symbols, occurrence-local closed parameters, reusable Shared Value bindings and
  package-defined Media input references;
- optional package-owned Picture and Audio reconstruction selections for exact mapped reads.

Picture Tracks are ordered back-to-front. Their Item order is the direct paint order within a Track. Audio
contributions mix additively. An enabled Picture-track Present may contribute coordinated Audio. An Audio-track
Present contributes Audio only.

The canvas is a unit-neutral logical Picture domain. It does not choose output pixels, frame rate or a background
colour. A visible background is an explicit Picture contribution; delivery policy may separately composite
transparency.

## Present and source time

A Present is an NLE authoring role, not an AVIR node. It owns one Media, component or local Composition occurrence:

```text
NLE Present
  -> resolved ProgramSource
  -> AVIR Occurrence + exact TemporalMap
  -> Picture use / remap / restrict / over
  -> Audio use / restrict / mix
```

`sourceTime.pieces` are stored in the Item-local target domain `[0, duration]`. The Project can validate that
target relation while the Source is offline. Lowering attaches the resolved finite Source domain and rejects a
relation that reads outside it. Move changes Programme placement; trim slices and rebases source time; slip shifts
source coordinates; retime replaces the explicit relation.

Media Present Items reference portable Media Asset documents. Opening and saving the Project performs no Media
inspection. The Host resolves a used reference only while lowering and supplies invocation-local `ResolvedMedia`.

A component Present stores an unversioned npm package symbol, closed parameters and optional package-defined names
mapped to portable Media Asset references. During lowering the Host resolves those references to invocation-local
Media resources before resolving the component Source; runtime addresses and bytes never enter the Project. The Host
selects installed package code and resolves one AVIR ProgramSource with explicit Picture and Audio output names.
Missing packages, Media inputs and outputs fail with the exact Item and requested material.

## Shared Values

A Project owns one top-level registry of typed reusable Shared Values. Each value has one local id, author-facing
name, declaration and closed value. A declaration is an exact package Component slot, one exact package Operator's
parameter value, or an NLE-owned semantic slot such as `picture.layout`. The registry supplies common identity, add/replace/remove,
reverse-user indexing, deletion protection, Inspector ownership and View guarding without erasing the declaration
owner's meaning.

The registry belongs to the Project rather than a Composition or View. Items in any Composition may share one value,
all bindings participate in the same Project revision and save lifetime, and current reverse users are derived by one
disposable Project index. Shared Values do not reference other Shared Values, contain expressions or identify arbitrary
document paths. Only an explicit owner-defined parameter position may reference one, and its declaration must match
that position. A referenced value can be removed only after its users are explicitly rebound, unbound or removed,
including atomically in the same Project transaction.

For a Component declaration, a Component Present explicitly binds the exact slot by id. Occurrence-local `parameters`
and reusable slot bindings remain separate facts; NLE never merges their JSON objects or interprets package fields.
Duplicate slots, missing references, non-Component values and cross-Component bindings are invalid. The Component
package owns the slot's meaning, editing operation and lowering interpretation. An installed authoring contribution
may project and edit it through its exact `(Component, slot)` pair.

`picture.layout` is the first NLE declaration because frame, fit and focal alignment are NLE meanings. A Picture
appearance stores either one inline layout or one reference to a compatible Shared Value. Spatial authoring can
promote an inline layout, link another Picture Item, edit the shared owner, or unlink an Item by copying the resolved
layout back inline. Canvas, Inspector and AVIR lowering resolve the reference before using its geometry.

An Inspector identifies one Shared Value owner, its declaration and all current users. Editing the owner through a
View requires every user's Track to be writable. Link and unlink remain occurrence-local edits. The View stores
neither Shared Values nor bindings. A package preset or copied value is materialization and creates no reference;
it is deliberately distinct from persistent sharing.

For an Operator declaration, any Present-local Process or Adjust using that exact package symbol may bind its whole
closed parameter value by id. Inline and shared parameters use the same package authoring contribution. Editing a
shared Process parameter replaces the one Project value and guards every current user's Track. This covers future
package Operators without adding NLE-specific parameter classes.

Picture and Audio appearances may select a package-owned Signal Reconstruction. Reconstruction belongs to one exact
Occurrence output selection after source-time mapping; it does not redefine the ProgramSource or introduce a second
evaluation language. Constant Picture outputs cannot select reconstruction because they have no mapped signal read.

## Nested Composition

A Composition Present references another Project-owned Composition by local id; it never embeds another Project or a
recursive JSON subtree. The referenced Composition retains its own local Timeline and Picture canvas. The occurrence
owns parent placement, Picture layout, optional Audio participation and occurrence-local Processes. One definition may
be used repeatedly by any number of Compositions. Unreferenced definitions remain valid author material, while direct
or indirect reference cycles are rejected with their path.

Composition definitions do not accept package parameters or Media inputs. Reusable parameterized visual concepts are
Components; nested Composition is direct NLE author structure. All definitions remain inside one NLE Project Service,
revision, undo history and savepoint.

Lowering recursively projects the referenced definition, namespaces its AVIR Sources, Occurrences, graph nodes,
Controls and spatial domains by occurrence path, pulls its exact temporal regions back into the parent time domain
and then applies the outer Item layout and Processes. No Composition Source, nested programme or foreign evaluator
survives in the closed AVIR Programme.

The Composition Item's `sourceTime` is the exact relation from Item-local time to referenced-Composition time.
Lowering uses the shared temporal preimage algebra to pull back child Occurrences, restrictions and Control mappings.
Piecewise affine rate, reverse, hold and wrap therefore remain exact, including the relations produced by trim, slip,
split, roll and ripple edits when the resulting Project is valid. One child region may have multiple parent preimages;
lowering emits their finite union rather than selecting one or sampling. Non-constant cubic preimage remains an
explicit refusal because its roots cannot in general be represented by the rational temporal value model.

## Process and Adjust

SVML serializes occurrence-local processing as `process` and independently timed stack processing as `adjust`.
Neither is reconstructed from a hidden Display tree.

A Process is an authored use of one installed package Operator. A Present appearance owns an ordered list of
Processes, evaluated inner-to-outer after Source fitting for Picture or after Source use for Audio. Each Process stores
its stable package symbol, enablement, an inline or shared closed parameter value and exact Item-local Control time.
Package display metadata and Inspector implementations are not Project facts.

An Adjust is an independently timed Timeline Item applying one Operator to the Picture or Audio accumulated below
its ordered Track position. The Track kind selects its medium. Outside the Adjust range, the accumulated signal
passes through unchanged. An Adjust is NLE author structure lowered to ordinary AVIR
`apply`, `restrict`, `over` and `mix` relations.

Operator resolution is explicit Host behavior. The resolved AVIR Operator must expose exactly one input for this
first direct-processing slice. Its package Controls receive mappings translated from persisted Item-local Control
time into Programme time. Trimming, splitting and rolling an Item exactly slice and rebase those relations together
with the Item.

## Transitions and Mattes

A Picture Transition is an explicit relationship between two enabled Present Items on one Picture Track. The
outgoing Item begins first, the incoming Item begins before the outgoing Item ends, and the incoming Item ends after
the outgoing Item. Their overlap is evaluated by one package Operator with exact `outgoing` and `incoming` inputs;
outside that overlap, each Item remains directly visible. Transition chains forbid ambiguous incoming/outgoing
branches and overlapping transition ranges.

A Matte is an explicit Picture dependency from one content Present to one matte-source Present. The matte source
must cover the complete content range, participates in evaluation, and is not independently painted. One content
has at most one direct Matte, dependencies must be acyclic, and a Transition cannot consume an Item reserved as a
matte source. The package Operator exposes exact `content` and `matte` inputs.

Both relations store stable package symbols and closed parameters. Their package Controls receive implicit linear
mappings over the overlap or content range. Lowering resolves Matte dependencies before Transition chains and emits
only native AVIR multi-input `apply`, `restrict` and `over` relations.

## Transactions and open lifetime

One opened NLE Project document has one NLE Project Service instance inside its Host. Views, Agents, CLIs and other
callers sharing that open document submit commands through the same Service. The Service owns its process-local
revision, serial command order, undo and redo history, dirty state, savepoint and observation. Reopening the document
creates a new Service and resets its revision; the number is never serialized in the Project.

One user or Agent gesture submits one revisioned Service transaction. Its commands are applied to a private Project
clone, the complete result is validated once, and either the Service publishes one new snapshot and revision or its
state remains untouched. A stale expected revision is rejected before mutation. The first command vocabulary covers
Project metadata, Composition add/update/remove, Track add/move/update/remove and Item
add/update/move/trim/slip/retime/split/roll/ripple-trim/
detach-audio/replace/remove. Ripple scope is always an explicit Item set supplied by the caller; Project editing does
not infer a hidden selection, Track suffix or magnetic Timeline policy. Processes have direct ordered
add/move/replace/retime/remove commands rather than generic graph mutation. Transitions and Mattes each have direct
add/replace/remove commands; edits that invalidate their referenced Items reject the complete transaction.
Shared Values have one direct add/replace/remove command family. Component Items retain explicit slot-binding
set/remove commands, while Item replacement owns the inline/reference choice produced by Picture share, link and
unlink planning. Complete-result validation permits one atomic rebind-and-remove gesture without exposing an invalid
state.

The same package exposes the pure Project transaction underneath the Service so explicit programs can
transform a value without inventing an open lifetime. That pure function has no revision: concurrency is meaningful
only among callers of one open Service.

Persistence stays explicit. A Host serializes the current Project, performs the file write, and then advances the
Service savepoint. External file changes are accepted only through explicit reload or reopen; the Service performs no
background hash comparison. File watching and platform file I/O remain Host or adapter concerns.

## Authoring planners and disposable indexes

Pure materialization planners translate explicit caller choices into ordinary Project transactions for Media Asset,
component and local Composition Presents, Adjust Items and Transitions. Transition materialization atomically turns
one direct Picture cut into its explicit overlap and relation; no invalid intermediate overlap becomes an accepted
Project snapshot. The planners perform no file access, package evaluation or Service mutation. A direct spatial
planner similarly translates frame, fit and focal-alignment plus explicit
share/link/unlink intentions into Item or Shared Value transactions; editor pointer drafts and snapping remain View
or Host Session behavior. A Process parameter planner likewise translates explicit share, link and unlink intentions
into ordinary Process and Shared Value commands.

An author-program materializer is another explicit caller of these planners. It evaluates a finite TSX author program
at author time, assigns stable ids and emits ordinary Project transactions. It may leave a Component Present opaque or
materialize an editable local Composition when the component publishes that boundary. It never stores TSX source text,
arbitrary expressions or an AIGC graph in the Project.

A disposable Composition or Project index accelerates lookup of Items, Media Asset users, component users,
Shared Value users, Composition users and relation participants. It is rebuilt from one exact snapshot and is
never serialized or treated as another authority.

## AVIR lowering

Lowering is a read-only deterministic projection:

```text
NLE Project snapshot
  + resolved Media
  + installed component implementations
  -> closed AudiovisualProgram
```

The Root Programme domain ends at its latest enabled Item edge. Muted Tracks and disabled Items produce no signal.
Picture fitting first maps the Source domain into the Item-local frame; placement then maps the Project canvas into
that frame. AVIR retains the two maps as ordinary renderer-neutral relations. Audio uses the same Occurrence and
source-time selection when a Present exposes both signals. Nested definitions are expanded and namespaced into this
same Programme.
Before resolving a Component Source, lowering resolves its value bindings into a separate slot-indexed map. The Host
receives occurrence-local parameters on the Item and shared values in the lowering context; neither side is silently
copied into or merged with the other.

Output sampling, browser processes, decoding, caches, encoding and delivery remain audiovisual Executor concerns.

## Current implementation boundary

The following capabilities are outside the current implementation:

- Transition and Matte Inspector authoring beyond the current Component, Shared Value and Operator slice;
- local file/process implementations.

## Package shape and required behavior

`@hypit/nle` is the first release boundary. Project schema, the current document Reader and serializer, exact time
editing, Picture fitting, the per-document Project and View Services and AVIR lowering share one owner and release
lifecycle. A TSX authoring materializer may begin as a source module in this release; it becomes `@hypit/authoring`
only when an independent component or product consumer proves a separate release boundary. View modules begin at the
`@hypit/nle/view` subpath. The application composition over both Services begins at `@hypit/nle/surface`. Platform
file I/O and audiovisual execution remain outside it.

The implementation preserves these invariants:

- strict parse/serialize preserves the current Project facts;
- failed multi-command transactions do not mutate their input;
- Project serialization contains no session revision;
- stale Service revisions are rejected without mutation, while undo, redo and savepoints remain session-local;
- trim, slip and retime preserve exact piecewise source-time meaning;
- split and roll exactly subdivide or extend source-time relations while preserving their stated outer edges;
- ripple moves only its explicit scope, and detached Audio becomes an independent valid Present;
- ordered occurrence Processes and Programme Adjusts lower to native AVIR applications with exact Controls;
- Transition chains and acyclic Matte dependencies lower to native multi-input AVIR Operators without painting
  Matte sources independently;
- Media and component Presents lower headlessly into coordinated AVIR Picture and Audio relations;
- component Media inputs resolve at the Host seam and reconstruction remains attached to the selected mapped read;
- Project Shared Values use one typed registry and lifecycle while exact Component, Operator and NLE declarations validate every
  binding, derive cross-Composition users and retain their own lowering meaning;
- package Component values lower separately from local parameters, while `picture.layout` preserves NLE-owned
  geometry, explicit linking, View guards and resolved Canvas, Inspector and lowering behavior;
- materialization and direct spatial planners produce ordinary atomic Project transactions;
- disposable indexes derive reverse references from canonical Project facts;
- one Project owns a Root plus reusable acyclic Composition definitions, whose occurrences expand into one flat AVIR
  Programme with exact affine rate, reverse, hold, wrap and edit pullback, without foreign Sources or sampled time;
- Picture contain, cover, fill and focal placement lower to the expected spatial maps;
- disabled Tracks, Items and Processes and missing materials produce precise observable behavior;
- no View or Session fact participates in lowering.
