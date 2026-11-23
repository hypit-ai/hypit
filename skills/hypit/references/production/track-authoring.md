# Authoring Custom NLE Components (`track-authoring.md`)

Read this when a production needs a new visual component, stateful graphic, or custom effect package beyond built-in media Presents and `@hypit/text-fine`. [Component Design](component-design.md) owns creative boundaries and parameterization; [Component Visuals](component-visuals.md) owns `HtmlVisual` rendering.

## The Component Package Contract

An NLE component lives in a package (local under `packages/<name>/` or installed from npm/pnpm) that exports `hypitPackage` from its `./hypit` entry point and is listed in `hypit.project.json`.

Using `@hypit/text-fine` (`packages/text-fine/src/hypit.ts`) as the canonical pattern, a component package registers up to four contributions:

| Contribution | API / Kind | Responsibility |
| --- | --- | --- |
| Definition | `nleComponentDefinitionKind` (`NleComponentDefinitionContribution`) | Declares `{ package, symbol }`, target track `role` (`picture`, `text`, `subtitle`, `filter`, `effect`), `sourceTime` mode (`constant` or `timed`), and optional `readText`. |
| Render | `{ kind: "hypit.nle-render", value: NleRenderContribution }` | Maps each `symbol` to a pure `render(...)` function returning an `HtmlVisual`. |
| Authoring | `createNleAuthoringContribution` | Implements `editParameters` for structured mutations from NLE Studio. |
| Inspector | `createNleInspectorPresentationContribution` | Projects editable sections, fields, and collections into NLE Studio's Inspector panel. |

Optional `catalog` entries (`kind: "hypit.nle-component"`) supply starter parameters and default durations so the component can be inserted directly in NLE Studio.

## Calling the Component from SVML

Once registered in `hypit.project.json`, place the component on any matching `<track>` using `<present source="component">`:

```xml
<track id="graphics" name="Graphics" kind="picture" role="picture" enabled="true">
  <present id="score-board" name="Score Board" source="component" start="3/1" duration="6/1" enabled="true">
    <component package="@studio/score-strip" symbol="scoreStrip"/>
    <parameters>{"title":"Final Score","revealAtSec":[0.8,2.1,3.5]}</parameters>
    <media-input name="badge" path="./media/badge.media.json"/>
    <picture>
      <layout x="120/1" y="1400/1" width="840/1" height="220/1" fit="fill"/>
    </picture>
  </present>
</track>
```

- `<parameters>` holds validated JSON data owned by the component.
- `<value slot="..." ref="..."/>` binds a component slot to a `<shared-value>` in the SVML document.
- `<media-input name="..." path="..."/>` supplies explicit Project Media assets (images or timed video) to the component.

## Designing Clean Temporal & Spatial Behavior

1. **Validate parameters explicitly.** Throw a clear error if required fields are missing or out of range so `hypit nle inspect` catches authoring mistakes before rendering.
2. **Distinguish `constant` vs `timed` components.** Return `{ kind: "constant" }` from `sourceTime` when a component renders a static graphic (allowing frame reuse), and `{ kind: "timed" }` when its appearance varies over time.
3. **Keep rendering pure and side-effect free.** A `render` function must not open arbitrary host files, call external network APIs, or spawn `ffmpeg`. All external assets enter through `<media-input>` or package-bundled artifacts; all AI generation happens upstream on Canvas or ExecutionHost.
4. **Separate outer lifetime from internal events.** Use the Present's `start`/`duration` for on-screen visibility and pass speech-aligned event timestamps (from `hypit transcript align`) in `<parameters>` so internal reveals stay locked to spoken words.

## Verifying a New Component

1. Build the package (`pnpm run build` or workspace build) and confirm it is listed in `hypit.project.json`.
2. Run `hypit nle inspect <file.svml>` to verify parameter validation and timeline resolution.
3. Open NLE Studio (`hypit nle open <file.svml>`) and scrub across activation, mid-motion, settled state, and exit—testing direct random seeks as well as playback.
4. Export a short test clip (`hypit nle export <file.svml> --to out/test.mp4`) and inspect representative frames ([Review](review.md)).
