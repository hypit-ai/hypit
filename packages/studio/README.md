# Hypit Studio

The single official Web Studio for SVML. It opens an explicit Run Source,
traces its Film or Render target back to the semantic and visual projections
Studio can edit, runs deterministic Producers only, and composites the
resulting Tracks with HyperFrames.

```bash
cd /path/to/external-video-project
hypit-studio --run build.svrun
```

Studio is an application boundary. Core and domain packages do not import it or
register UI metadata. The tool checkout supplies the official Studio Adapter
distribution. An external project may explicitly add companion Adapter packages
through `hypit.studio.json`; the application assembles one immutable registry for
that project session.

```json
{
  "format": "hypit.studio-profile@1",
  "adapterPackages": ["@my-project/local-example-studio"]
}
```

Project packages live at `<project>/packages/<package-basename>/`. Neither the
project nor its packages are added to the Hypit checkout or its pnpm workspace.
The Host resolves selected project packages from the project first and official
`@hypit/*` imports from the read-only tool Distribution. The `@hypit/*`
namespace is Distribution-owned and cannot be shadowed by a project install.
Companion manifests may declare `@hypit/studio-adapter` as a peer dependency for
editor/package-manager clarity; the active tool Distribution supplies that ABI at
runtime, so the project does not install or lock another copy.

The companion owns what its Track means: matching, entities, lane range,
material projection, inspector sections and declared interaction/writeback.
Studio owns session-wide behavior and chrome: adapter selection, collision and
replacement rules, fallback defaults, selection treatment, playback, zoom,
scrolling and source mutation transport. A companion cannot ship arbitrary DOM
or CSS into the application.

Opening Studio never invokes a Provider and never creates a Build. Every
projection needed for display must already be supplied by the Run or be
deterministically derivable from those supplied Candidates.
