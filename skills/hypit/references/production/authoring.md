# Authoring and Materialization

Hypit supports two complementary ways to author NLE timelines:

1. **Direct SVML editing (`*.svml`)**: edit the XML markup directly (or via NLE Studio) and
   validate with `hypit nle inspect <file.svml> --json`.
2. **TSX Composition Source (`@hypit/nle/authoring`)**: write ordinary TypeScript/TSX when you want
   loops, data-driven layouts, transcript-driven cuts, or reusable templates, then **materialize**
   the result into an SVML document.

## TSX Composition Source (`@hypit/nle/authoring`)

`@hypit/nle/authoring` provides a lightweight JSX factory (no React runtime required) with
`Composition`, `Track`, `Media`, `Component`, `Item`, `Transition`, `Matte`, `SharedValue`,
`defineComposition`, `materializeComposition`, and `seconds`:

```tsx
import {
  Composition,
  Media,
  Track,
  defineComposition,
  jsx,
  seconds,
} from "@hypit/nle/authoring";

export default defineComposition((input: { opening: { path: string } }) => (
  <Composition id="main" width={1920} height={1080}>
    <Track id="picture" kind="picture" role="picture">
      <Media
        id="opening"
        asset={input.opening}
        at={seconds("0")}
        duration={seconds("10")}
        picture={{ layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "cover" } }}
      />
    </Track>
  </Composition>
));
```

Use `projectSourceInstant` and `projectSourceRange` from `@hypit/nle/authoring` to project exact
source-local timestamps (e.g. from an aligned transcript) through trimmed or retimed placements.

## Reuse produced work explicitly

- **Canvas Publications**: never regenerate unchanged takes. Inspect `hypit canvas history`, select
  the desired Publication output with `result.select`, and adopt it into `media/*.media.json` via
  `hypit canvas adopt`.
- **SVML & NLE Studio**: once materialized into SVML, the `.svml` file is authoritative for direct
  editing and `hypit nle export`. Always run `hypit nle inspect <file.svml>` after editing to verify
  schema validity and track/frame bounds.
