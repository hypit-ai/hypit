# `@hypit/studio-companion`

The stable companion-package ABI understood by Hypit Studio. It carries only
presentation, lineage, inspector and interaction DTOs plus helpers that do not
encode the official video UI policy. Domain computation and manifests do not depend on it;
package activation can combine domain facets with a separate Companion implementation.

External packages peer-depend on both `@hypit/hypit` and `@hypit/studio-companion`, use the public imports
below, then ship compiled JavaScript. The active Distribution supplies both packages when Studio loads the
component.

## A minimal project Track Companion

Suppose `@studio/score-strip@1` already owns a `track` declaration that emits a public VisualTrack and
accepts a literal string `label` attribute. The Companion can reuse generic terminal Items while
adding package-specific presentation and one Inspector field:

```ts
import { compositionTypes } from "@hypit/composition";
import type { StudioTrackCompanion } from "@hypit/studio-companion";

export const companions: readonly StudioTrackCompanion[] = [{
  id: "score-strip",
  output: {
    type: compositionTypes.visualTrack,
    declaration: "track",
    modules: [{ name: "@studio/score-strip", version: "1" }],
  },
  family: "score-strip",
  label: "Score strip",
  icon: "chart",
  tone: "orange",
  lane: { heightPx: 64 },
  poster: { source: "declaration-preview" },
  bindings: [{ name: "label", writable: true }],
  inspector: [{
    binding: "label",
    label: "Label",
    domain: "how",
    section: { id: "content", label: "Content" },
    control: "text",
  }],
}];
```

The names and lane height are this example's choices. Use the real Module ABI, declaration name,
nominal output Type and authored input names of the component. A Companion does not create a new
author attribute. Omitting `project` uses generic terminal Items; `poster` adds the declared
declaration preview when one exists, without changing the component's rendered video.

Each lane occupies one timeline row. Items overlap in ascending `stackOrder`,
with later projected Items above earlier ones when orders tie. Studio keeps
overlapping Items mounted and raises the selected Item within its lane;
selection does not change the rendered composition or write stacking back to Source.
Expose `terminalLinks` so Studio can resolve each author Item to the terminal spans that realize it.
The Companion names component-owned span identity, not Film occurrence paths or renderer addresses.
Attached lanes represent distinct
Companion projections, not extra rows allocated to avoid temporal overlap.

An Item's timeline interval describes the operation being edited; its rendered
parts may remain visible afterward. Associate every relevant phase through
`terminalLinks` (for example, an entrance and the settled object), using `elementId`
when the Present root is broader than the intended selection boundary. Studio picks the
currently visible part by its renderer-declared paint path and selects the same Item,
without extending its editable interval. Give the parent the board or background
parts and its children their own parts when they should be independently selectable.
The component decides this granularity. A composite can remain one selectable Item.

`StudioItemDraft.id` is local to one projected Track lane. Keep it meaningful inside the component;
do not prefix it with an output ref or encode a global tuple. Studio combines the Track's structured
address with that local id for selection and writeback. `requiredValues` names same-declaration values
needed while projecting the Track; those values do not become Tracks or browser-facing view roles.

Merge the facet into the package's existing activation. In this example `authorContribution`
exports its existing modules, deterministic component and Markup facets:

```ts
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";
import authorContribution from "./author-activation.js";
import { companions } from "./studio.js";

export default {
  ...authorContribution,
  facets: [
    ...(authorContribution.facets ?? []),
    createStudioTrackCompanionFacet(companions),
  ],
};
```

Point the package's existing `hypit.activation` at that combined export and include the compiled
Companion file in the package. Keep the real modules, Producers and declaration facets; a Companion-only
replacement would remove the component itself. Use the active Distribution's adapter ABI, as
described in the [Studio README](../studio/README.md), rather than a `workspace:*` dependency in an
external project.

Studio loads facets from packages selected by the Source closure alongside the Distribution's
explicit official Companion selection. It qualifies this local id as
`@studio/score-strip#score-strip`. There is no extra Studio Profile, plugin scan or Core registration.
Restart the Studio process after changing activation or package code.

## Project domain Items and material

A terminal VisualTrack is enough for generic display. When it loses meaningful domain structure,
publish a deterministic schedule/program output from the same declaration and name its port in
`requiredValues`. Inside `project(context)`, retrieve it with `requiredDeclarationValue(context, "schedule")`.
The port must exist in the declaration's public output mappings; inventing a port name in a Companion
does not make an internal Producer value observable. `requiredReferencedValue(context, input, type)`
instead follows one exact typed author reference, such as a CaptionDocument.

`project` returns `StudioItemDraft[]`. Each Item composes Timeline's half-open `FrameSpan` with an id,
authored identity, display title, ordered layers and `stackOrder`. Useful optional fields include:

| Field/helper | Purpose |
| --- | --- |
| `presentation` | Name the Item kind and choose `standard`, `group`, `point` or `compact` chrome (a single-line primary label) |
| `marker` | Relate the Item to one exact `{ companion, domainId, itemId }` temporal object |
| `elementLocation` | Locate the author object with both its Source path and range |
| `textLayer(text)` | Put explicit domain text in the timeline body |
| `previewLayer(artifactPreview(kind, resource), layout)` | Show a declared image/video/audio Resource with a finite layout; Studio resolves transport |
| `terminalLinks` | Relate an author Item to one or more component-owned terminal span ids; `elementId` can narrow visual selection without exposing renderer occurrence identity |
| `parameterReferences` | Select exact per-Item authored references, such as the Style really used by this Cue |
| `temporal` | Carry the executed Instant/Window lineage and its edit authority |
| `lane` and Companion `attachments` | Put child Items on a declared additional lane, with its own bindings and Inspector |
| `childItems` / `authoredChildFor` | Resolve children from public identity and exact Spec Types rather than source order guesses |
| `authoredItemTitle` | Prefer an explicit author id, then a source reference from the attributes chosen by the Companion; presentation leaves editing identity unchanged |

Use the program's frame space and half-open intervals. Persistent visibility and its activation are
different facts: a board item can remain visible until the board ends while its reveal occupies only
a short child interval. Expose that distinction rather than making a long rectangle imply a long
entrance animation. Qualify child ids across Track instances; never use an array index as authored
identity merely because it currently lines up.

Read [Ranking's Companion](https://github.com/hypit-ai/hypit/blob/main/packages/ranking/src/studio.ts) for board/reveal lanes,
Caption Fine's `@hypit/caption-fine/studio` facet for Cue text and Style selection, and
[Visual Track's](../visual-track/src/studio.ts) for material and occupancy.

## Preserve executed temporal lineage

`StudioTrackCompanionContext.temporalBindings` exposes the executed Instant/Window records in the selected
Track closure, including projection expressions, source identity and direct consumer inputs.
`temporalLineageFor()` joins a domain Item to those edges through the identity of a value consumed
beside the projection. No match is read-only, one match is used, and several matches are an error rather
than a first-result guess. Endpoint authority is already part of that executed lineage: an author syntax
may declare a parameter inverse on the Spec it creates, while a domain projector declares its own source
and boundary. Common Studio never maps attribute names such as `from`, `for`, `until` or `during`. The generic terminal
fallback tries only the terminal object's exact `subjectId`/`authoredId`; renderer ids and marker ids
are not alternate guesses.

Track Companions match terminal outputs by complete `TypeRef` and their authoring origin by complete
`ModuleRef + declaration`; Film and temporal-domain Companions use the same versioned origin match. Short Type
and module names remain available for UI text and diagnostics but never decide which Companion is
allowed to interpret a value.

Trace references retain the exact author input name and resolved TypeRef. A Companion that needs a
CaptionDocument or another referenced domain value selects that declared edge; it never scans all
values for a familiar object shape. Child Items follow the same rule: when an optional Source id
was omitted, a Companion may name the exact domain Spec Type whose public `id` owns that child.
Studio then recovers the Source range from the typed observed Record, without ordinal matching.

A project companion contributes package-local Track Companion ids through
`createStudioTrackCompanionFacet()`. The Host qualifies them with the selected
physical package identity, so executable package code cannot impersonate an
official Companion. The Source closure selects project packages; Studio does not
scan `node_modules` for plugins or use Runtime Profiles to select Companions.

The same Studio Companion facet can contribute Film, temporal-domain, temporal-declaration and parameter Companions. A Film Companion
identifies its Timeline and terminal Tracks. The Timeline supplies only the program range. A
temporal-domain Companion owns source observation, requests the domain values it needs, and returns
one view for every exact Projection instance. Each view projects package-owned lanes, anchors and
visible point/span Items onto the absolute Timeline. Domain objects needed only to invert a Track/Item
edit belong in `editItems`; Studio does not draw them as another lane.
Span appearance is a display choice: `block` for ordinary domain blocks and `compact` for dense
evidence; points use `marker`. It does not change an item's time boundaries.
Script Studio uses this protocol for Narrative, but common Studio neither imports Narrative nor
reserves segment, word, Selection or Moment slots. Another package can contribute beat, shot or
motion-event domains through the same protocol.

A temporal-declaration Companion instead matches one author declaration and names only the output ports
whose primary values are author-visible absolute Instants. It does not choose their color,
row or editing behavior. These exact outputs are display requests even when no Track consumes them.
Studio evaluates them under the existing display-execution permissions and displays resolved primary
Instants in one read-only `Instants` row. Unresolved requests are reported without blocking Film
preview. Windows remain author values used by Track Items and their editing
lineage, without an additional common-row block. This keeps declaration output knowledge in the owning package while
letting common Studio understand only the shared absolute temporal types. Do not export a Timeline's
root range, automatically derived Window boundaries or internal helper values as separate declarations.

```ts
createStudioCompanionFacet({
  temporalDeclarations: [{
    id: "window",
    match: { module: myModule, declaration: "window" },
    project: ({ placement }) => placement.id === undefined ? [] : [{
      id: placement.id,
      output: placement.outputPorts.find((port) => port.name === "window")!.ref,
      range: placement.range,
    }],
  }],
})
```

A temporal-relation Companion owns the inverse meaning of one package-private Producer output. It
receives only the executed input/output values and one desired Point, Extent or Span constraint. It
may return input constraints and exact author-Spec replacements. Common Studio recursively composes
those local plans, removes conflicting branches, merges candidates that reach the same exact author
writes, and commits the sole remaining plan in one transaction. Distinct surviving plans are a real
ambiguity. The package never receives mutable Studio state or file access through this API.

The same relation may expose `trace` to reconstruct the meaning of its output from exact input
records. Trace is how a private materialization, offset or domain projection preserves lineage and
edit authority without making Studio recognize the package's Producer names or input vocabulary.

This is how an author package keeps private construction values private. For example,
`@hypit/timeline-author` explains how its materialized Window leads to a construction Span, and how
that Span leads to its Point and Extent inputs. Studio does not import or enumerate those Producer
names. A relation with no unique inverse returns no plan; a relation with several genuine author
choices returns several plans. Studio evaluates them through the remaining graph and rejects the
gesture only if they still produce different valid author decisions.

```ts
createStudioCompanionFacet({
  temporalRelations: [{
    id: "span-between",
    match: { producer: mySpanProducer, output: "span" },
    invert: ({ target }) => target.kind !== "span" ? [] : [{ constraints: [
      { input: "start", target: { kind: "instant", frame: target.startFrame } },
      { input: "end", target: { kind: "instant", frame: target.endFrameExclusive } },
    ] }],
  }],
})
```

For a domain item whose Spec is consumed beside a Window or Instant, call
`temporalLineageFor(context, item.id, "window")` using the actual projection input name. Attach the
returned lineage to that Item; the input may instead be `activation`, `outer` or another declared
port. Studio derives common timeline gestures from endpoint authority. No matching lineage means
no inferred domain edit; several matching edges require resolving the ambiguity in the component
projection. Visible frame coincidence is not a source relationship.

## Expose authored parameters deliberately

Inspector editing deliberately has two declarations:

- `bindings` names exact author endpoints, including explicit reference paths
  into authored elements or SVS Recipes. A binding is not visible by itself;
- `inspector` selects bindings and gives them a `where`, `when` or
  `how` domain, an optional package-owned page, a section and one of Studio's
  finite controls (`text`, `number`, `boolean`, `select`, `color`, `list` or
  `record`). A domain Recipe may declare a shared canonical-value schema; the
  companion chooses its presentation while Studio derives and validates the
  finite structured control without learning domain syntax.

This keeps source traversal, timeline inverses and editor presentation from
silently becoming one policy. Studio resolves the declarations against the
current Source closure. Visible read-only bindings render as text alongside editable fields.
A projected Item can also supply `inspector` values with an `id`, `label`, `domain`, `section`
and `value`, such as its resolved interval. These facts need no Source endpoint.
Only resolved fields with an `edit` endpoint accept `parameter.adjust`. Studio renders all DOM
and CSS itself; grouping does not grant edit authority.

Fields can declare `number` display scaling, supported suffixes, limits and step; `unit` alone is
only a label. Select options can carry separate scalar values, labels, descriptions and color/font
preview hints. Text may be multiline; colors may offer package-chosen swatches. See
[Inspector presentation and conversion](../studio/INSPECTOR.md) for examples and ownership.

Structured controls keep a local draft and commit one complete canonical value.
Their codec is the author language (`@hypit/recipe` for Recipe values), not a
Companion callback. Companions cannot inject DOM, CSS, parsing code or filesystem
mutations. Official companions also use explicit field tables: an undeclared
new domain property fails Companion loading instead of inheriting UI from its name.

`referenced` follows declared authored-element references; `recipe` names an explicit path through
authored references to one SVS Recipe and its declared properties. These paths are independent of
the `inspector` field table. Keep shared values shared: editing a Recipe affects its consumers, while
an Item-specific `parameterReferences` override must identify the actual authored value it uses.

Verify the integration through an ordinary Invocation: the intended Module/declaration matches, the expected Item
is selected, its field reaches the correct Source or Recipe, and changing it recomputes the preview.
For domain handles, verify the exact point/span identity and its other consumers too. Read-only derived timing
is preferable to an invented inverse. The Companion explains the component; its Producers remain
responsible for identical video behavior in Studio, seeking and encoded rendering.

Compact chrome uses `display.title` as its complete single-line content: a Cue can put its subtitle
text there. It has no separate thumbnail/body region or
inline duration. Time remains in the tooltip and Companion-selected Inspector facts. Tone and lane
height are independent declarations; compact does not recognize Caption or Use names.

Choose lane tones explicitly. The `blue-muted`, `green-muted`, `magenta-muted`
and `orange-muted` palette entries provide quieter rows within the same color
family. Studio does not derive tone from attachment depth or the Item kind.

### Inspector objects and child Tracks

A Track can project authored rules or other non-occurrence objects through `inspectorObjects`.
They stay out of the Timeline and appear in that Track's Inspector. Keep `attachments` for
independently represented child content with its own time identity and label, such as a ranking
board's reveals. Neither form changes the compiled video model.

```ts
{
  lane: { heightPx: 60 },
  inspectorObjects: [{
    id: "rules",
    label: "Presentation Rules",
    bindings: [{ name: "style" }],
    inspector: [{
      binding: "style", label: "Style", domain: "how", control: "text",
      section: { id: "presentation", label: "Presentation" },
    }],
    project: (context) => context.placement?.children.flatMap((child) => child.id === undefined ? [] : [{
      id: `rule:${child.id}`,
      authoredId: child.id,
      title: child.id,
      elementLocation: { path: child.sourcePath, range: child.range },
    }]) ?? [],
  }],
}
```

The projected object has its own source identity and fields but no timeline rectangle. Studio shows
these objects when an Item on the owning Track is selected. Their fields use the same binding and
parameter-Companion machinery as Item fields. An independently timed child still uses a declared
`attachment` and selects that attachment's `lane` in its Item draft; attachments remain ordinary
Tracks with their own Items, selection and temporal writeback.

### Parameters owned by referenced objects

A consumer opts a reference into its owner's parameter Companion:

```ts
bindings: [{ name: "style", companion: true }]
```

The package that authors the referenced object contributes through
`createStudioCompanionFacet({ parameters: [...] })`:

```ts
{
  id: "slide",
  match: { module: myModule, declaration: "slide" },
  bindings: [{ name: "distance", writable: true, fallback: 0.25 }],
  inspector: [{
    binding: "distance", label: "Travel", domain: "where",
    section: { id: "path", label: "Path" }, control: "number",
    unit: "%", number: { scale: 100 },
  }],
}
```

Studio resolves the actual reference and matches its Module/declaration. It prefixes this object's
bindings and fields under the consumer reference; the example becomes `style.distance`.
Nested `referenced` and `recipe` bindings use the same composition. The Use retains its own
Window and time gestures. Several Uses referencing one Style edit the same source object.
A project Style can therefore publish controls without replacing the Visual, Audio or
Caption Track Companion. No parameter Companion means the reference remains visible with only
its consumer-declared fields.

A source or Recipe binding may declare a typed `fallback`, or a function of the authored
properties for a dependent default. For example, an Audio Style's end gain follows its start gain until
authored explicitly. The field displays the fallback; the first edit inserts the attribute/property
in its owning SVML/SVS file. Source recompilation remains the owner of current values.
Only expose omitted defaults whose insertion preserves valid author semantics; geometry inputs
whose legality depends on a different Frame form can remain tied to the authored form.

Fields without `page` remain visible alongside the selected named page within Where, When or How.
Read-only and editable fields can share a section. Each package chooses a small useful field set.

### Edit related attributes together

A source binding can expose several scalar attributes as one `record` field:

```ts
{ name: "layout", writable: true, attributes: ["mode", "columns"],
  fallback: { mode: "flow" },
  schema: { kind: "oneOf", variants: [
    { kind: "object", fields: { mode: { schema: { kind: "literal", value: "flow" } } } },
    { kind: "object", fields: {
      mode: { schema: { kind: "literal", value: "grid" } },
      columns: { schema: { kind: "number", integer: true, minimum: 1 } },
    } },
  ] } }
```

The synthetic binding name is editor vocabulary; it creates no `layout` Source attribute.
The field's `control: "record"` saves a complete, valid value when editing ends. Object alternatives with a shared, distinct
literal field provide a mode selector; selecting one prepares that alternative's fields.
Incomplete values stay in the editor with a completion hint until the required fields are filled.
Only the declared attributes are replaced together. Omitted members are removed, while unrelated
attributes, references and child content survive. Existing references within the group remain
read-only. Domain validation still owns valid author values; existing transactions reject an
invalid edit without leaving invalid Source behind. Source grouping is available on direct and
referenced element bindings and stays data-only across the editor boundary.
