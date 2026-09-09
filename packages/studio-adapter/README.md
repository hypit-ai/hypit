# `hypit/studio-adapter`

The stable companion-package ABI understood by Hypit Studio. It carries only
presentation, lineage, inspector and interaction DTOs plus helpers that do not
encode the official video UI policy. Domain computation and manifests do not depend on it;
package activation can combine domain facets with a separate Companion implementation.

External packages use the public imports below with `hypit` as a development dependency, then ship
compiled JavaScript. The active Distribution supplies these APIs when Studio loads the component.

## A minimal project Track Companion

Suppose `@studio/score-strip@1` already owns a `track` Surface that emits a public VisualTrack and
accepts a literal string `label` attribute. The Companion can reuse generic terminal entities while
adding package-specific presentation and one Inspector field:

```ts
import { compositionTypes } from "hypit/composition";
import type { StudioTrackCompanion } from "hypit/studio-adapter";

export const companions: readonly StudioTrackCompanion[] = [{
  id: "score-strip",
  role: "track",
  output: {
    type: compositionTypes.visualTrack,
    surface: "track",
    modules: [{ name: "@studio/score-strip", version: "1" }],
  },
  family: "score-strip",
  label: "Score strip",
  icon: "ranking",
  tone: "orange",
  lane: { heightPx: 64 },
  poster: { source: "surface-preview" },
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

The names and lane height are this example's choices. Use the real Module ABI, Surface name,
nominal output Type and authored input names of the component. A Companion does not create a new
author attribute. Omitting `project` uses generic terminal entities; `poster` adds the declared
Surface preview when one exists, without changing the component's rendered video.

Merge the facet into the package's existing activation. In this example `authorContribution`
exports its existing modules, deterministic component and Markup facets:

```ts
import { createStudioTrackCompanionHostFacet } from "hypit/studio-adapter";
import authorContribution from "./author-activation.js";
import { companions } from "./studio.js";

export default {
  ...authorContribution,
  hostFacets: [
    ...(authorContribution.hostFacets ?? []),
    createStudioTrackCompanionHostFacet(companions),
  ],
};
```

Point the package's existing `hypit.activation` at that combined export and include the compiled
Companion file in the package. Keep the real modules, Producers and Surface facets; a Companion-only
replacement would remove the component itself. Use the active Distribution's adapter ABI, as
described in the [Studio README](../studio/README.md), rather than a `workspace:*` dependency in an
external project.

Studio loads facets from packages selected by the Source closure alongside the Distribution's
explicit official Companion selection. It qualifies this local id as
`@studio/score-strip#score-strip`. There is no extra Studio Profile, plugin scan or Core registration.
Restart the Studio process after changing activation or package code.

## Project domain entities and material

A terminal VisualTrack is enough for generic display. When it loses meaningful domain structure,
publish a deterministic schedule/program output from the same Surface and name its port in
`requiredValues`. Inside `project(context)`, retrieve it with `requiredSurfaceValue(context, "schedule")`.
The port must exist in the Surface's public output mappings; inventing a port name in a Companion
does not make an internal Producer value observable. `requiredReferencedValue(context, input, type)`
instead follows one exact typed author reference, such as a CaptionDocument.

`project` returns `StudioEntityDraft[]`. Each entity has an id, authored identity, display title and
ordered layers, `startFrame`, `endFrameExclusive` and `stackOrder`. Useful optional fields include:

| Field/helper | Purpose |
| --- | --- |
| `presentation` | Name the entity's role and choose `standard`, `group` or `point` chrome |
| `textLayer(text)` | Put explicit domain text in the timeline body |
| `previewLayer(artifactPreview(kind, resource), layout)` | Show a declared image/video/audio Resource with a finite layout; Studio resolves transport |
| `renderIds` | Relate an entity to its actual rendered elements |
| `parameterReferences` | Select exact per-entity authored references, such as the Style really used by this Cue |
| `temporal` | Carry the executed Instant/Window lineage and its edit authority |
| `lane` and Companion `attachments` | Put child entities on a declared additional lane, with its own bindings and Inspector |
| `childEntities` / `authoredChildFor` | Resolve children from public identity and exact Spec Types rather than source order guesses |

Use the program's frame space and half-open intervals. Persistent visibility and its activation are
different facts: a board item can remain visible until the board ends while its reveal occupies only
a short child interval. Expose that distinction rather than making a long rectangle imply a long
entrance animation. Qualify child ids across Track instances; never use an array index as authored
identity merely because it currently lines up.

Read [Ranking's Companion](../ranking-studio/src/index.ts) for board/reveal lanes,
[Caption Fine's](../caption-fine-studio/src/index.ts) for Cue text and Style selection, and
[Media Track's](../media-track-studio/src/index.ts) for material and occupancy.

## Preserve executed temporal lineage

`StudioTrackCompanionContext.temporalBindings` exposes the executed Instant/Window records in the selected
Track closure, including projection expressions, source identity and direct consumer inputs.
`temporalLineageFor()` joins a domain entity to those edges through the identity of a value consumed
beside the projection; it does not inspect author attribute names. No match is read-only, one match
is used, and several matches are an error rather than a first-result guess. The generic terminal
fallback tries only the terminal object's exact `subjectId`/`authoredId`; renderer ids and marker ids
are not alternate guesses.

Track Companions match terminal outputs by complete `TypeRef` and their authoring origin by complete
`ModuleRef + Surface`; Film and Script companions use the same versioned origin match. Short Type
and module names remain available for UI text and diagnostics but never decide which Companion is
allowed to interpret a value.

Trace references retain the exact author input name and resolved TypeRef. A Companion that needs a
CaptionDocument or another referenced domain value selects that declared edge; it never scans all
values for a familiar object shape. Child entities follow the same rule: when an optional Source id
was omitted, a Companion may name the exact domain Spec Type whose public `id` owns that child.
Studio then recovers the Source range from the typed observed Record, without ordinal matching.

A project companion contributes package-local Track Companion ids through
`createStudioTrackCompanionHostFacet()`. The Host qualifies them with the selected
physical package identity, so executable package code cannot impersonate an
official Companion. The Source closure selects project packages; Studio does not
scan `node_modules` for plugins or use Runtime Profiles to select Companions.

The same host facet can contribute Film and Script boundary companions. A Film companion declares
the accepted `timeSources` (author attribute and Type) and its terminal Tracks. Film accepts either
a SemanticTrack or a declared ProgramSpace. Track Companion context includes `semantic` when the
time source supplies a semantic timeline; pure animation leaves it undefined. A Script companion owns
raw source observation and marker adjustment. Studio core only matches and invokes these declarations;
it does not import either domain package.

For a domain item whose Spec is consumed beside a Window or Instant, call
`temporalLineageFor(context, item.id, "window")` using the actual projection input name. Attach the
returned lineage to that entity; the input may instead be `activation`, `outer` or another declared
port. Studio derives common timeline gestures from endpoint authority. No matching lineage means
no inferred semantic edit; several matching edges require resolving the ambiguity in the component
projection. Visible frame coincidence is not a source relationship.

## Expose authored parameters deliberately

Inspector editing deliberately has two declarations:

- `bindings` names exact author endpoints, including explicit reference paths
  into authored elements or SVS Recipes. A binding is not visible by itself;
- `inspector` selects writable bindings and gives them a `where`, `how` or
  `when` domain, an optional package-owned page, a section and one of Studio's
  finite controls (`text`, `number`, `boolean`, `select`, `color`, `list` or
  `record`). A domain Recipe may declare a shared canonical-value schema; the
  companion chooses its presentation while Studio derives and validates the
  finite structured control without learning domain syntax.

This keeps source traversal, timeline inverses and editor presentation from
silently becoming one policy. Studio resolves the declarations against the
current Source closure, publishes only real writable fields, renders all DOM
and CSS itself, and commits changes through `parameter.adjust`.

Structured controls keep a local draft and commit one complete canonical value.
Their codec is the author language (`@hypit/svs` for Recipe values), not a
Companion callback. Companions cannot inject DOM, CSS, parsing code or filesystem
mutations. Official companions also use explicit field tables: an undeclared
new domain property fails Companion loading instead of inheriting UI from its name.

`referenced` follows declared authored-element references; `recipe` names an explicit path through
authored references to one SVS Recipe and its admitted properties. These paths are independent of
the `inspector` field table. Keep shared values shared: editing a Recipe affects its consumers, while
an entity-specific `parameterReferences` override must identify the actual authored value it uses.

Verify the integration in an ordinary Run: the intended Module/Surface matches, the expected entity
is selected, its field reaches the correct Source or Recipe, and changing it recomputes the preview.
For semantic handles, verify the exact marker and its other consumers too. Read-only derived timing
is preferable to an invented inverse. The Companion explains the component; its Producers remain
responsible for identical video behavior in Studio, seeking and encoded rendering.
