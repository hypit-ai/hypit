# Hypit Studio

The single official Web Studio for SVML. It opens an explicit Run Source,
traces its Film or Render target back to the semantic and visual projections
Studio can edit, runs deterministic Producers only, and composites the
resulting Tracks with HyperFrames.

```bash
cd /path/to/external-video-project
hypit-studio --run build.svrun
```

When `--runtime` is omitted, Studio uses the nearest Runtime selection made by
`hypit runtime use`. That selection's directory is the default environment
boundary. The upper-left library is intentionally not a filesystem browser:

- Source is the exact Run + Author closure and writes back only the selected file;
- Tasks combine finished project Results with read-only active `BuildView` and Operation information;
- Artifacts are public files exposed by project Build Results.

No project manifest, Studio database, output-directory scan or inferred campaign
folder structure is involved. With no selected Runtime, Source, Preview, finished
Result tasks and Artifacts still work; only active execution status is unavailable.

Studio is an application boundary. Core and domain packages do not import it or
register UI metadata. The installed Distribution explicitly selects one independent
Studio Companion per supported official domain. Packages actually selected by the
current Source closure may contribute their own Companion facet. The application
assembles both sets into one immutable registry for that session; there is no second
Studio profile, package scan or replacement map.

Project packages live at `<project>/packages/<package-basename>/`. Neither the
project nor its packages are added to the Hypit Distribution or contributor workspace.
The Host resolves selected project packages from the project first and official
`@hypit/*` imports from the read-only tool Distribution. The `@hypit/*`
namespace is Distribution-owned and cannot be shadowed by a project install.
Companion manifests may declare `@hypit/studio-adapter` as a peer dependency for
editor/package-manager clarity; the active tool Distribution supplies that ABI at
runtime, so the project does not install or lock another copy.

The companion owns what its Track means: matching, required same-Surface values,
entities, lane range, finite chrome, title and ordered text/material layers,
source bindings, Inspector fields and exact timeline inverses. Inspector fields
select real writable bindings and organize them under the Studio-owned
`Where / How / When` domains, optional companion-owned pages and sections. A
source binding is never shown merely because Studio can reach it. Material layers carry an
Resource id or Surface identity, never a Studio HTTP URL. Studio always owns
time formatting and transport resolution, so chrome and material cannot hide a
title or its time.
Studio owns session-wide behavior and chrome: Companion assembly, collision rules,
fallback defaults, selection treatment, playback, zoom,
scrolling, the finite Inspector control set and source mutation transport. A
companion cannot ship arbitrary DOM or CSS into the application.

The finite control set includes scalar controls plus generic `list` and flat
`record` composition. Structured values are validated against the domain-owned
canonical schema, edited as a local draft, and written atomically through the
same revisioned `parameter.adjust` operation. Studio contains no Ranking,
Caption or Media list codec.

Inspector controls are Studio behavior, not browser defaults supplied by a
companion. Focused controls suspend transport shortcuts; numeric values use
non-spinning text entry so wheel scrolling cannot mutate Source; selects use
the Studio menu and keyboard navigation. Values still commit only on an
explicit change through the normal revisioned mutation path.

Temporal lineage comes from the exact executed graph selected by the Run. Studio indexes the
`TemporalInstant` and `TemporalWindow` records in each Track's dependency closure, including each
endpoint's author authority and direct consumer edge. Common timeline inverses come from that
authority rather than Companion declarations. Track Companions never infer semantic sources from SVML
attribute names, runtime id prefixes or coincident frame spans.

Opening Studio never spends and never creates a Build. Its display closure contains
the Candidates selected by the Run, deterministic Producers and exact Needs that
their Provider explicitly allows in transient authoring execution. The Runtime owns
Endpoint activation, Profile bindings, request-level `supports`, credentials and
invocation; Studio receives no Endpoint Registry and makes no decision from pricing,
process location, model name or package name. A Need without transient support stops
with its exact capability named. A stand-in is an ordinary generic image, video or
silence Candidate from `@hypit/stand-in`; the Run supplies its visible dimensions and
duration and selects it with `satisfy`. Model packages do not manufacture stand-ins.

Studio and an encoded review use the same ordinary Run. Studio evaluates its
transient display closure in the browser; building that Run evaluates the
full target closure and sends the resulting HyperFrames document to the chosen
render Endpoint. A separate review Run is useful only when the author wants a
different Candidate selection. Its path and filename carry no execution
semantics.
