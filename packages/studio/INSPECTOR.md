# Companion-owned Inspector fields

The Inspector asks three questions. **Where** describes spatial placement and organization;
**When** describes scheduling, playback and changes over time; **How** describes appearance,
content and sound. These are navigation domains, not restrictions on component behavior.

| Domain | Useful pages and sections |
| --- | --- |
| Where | Position, size, anchor, fitting/cropping, padding, clipping, stacking, layout |
| When | Placement in time, playback/cycling, source trim, entrance, sustained motion, exit, transitions, fades |
| How | Text/content, typography, fill/stroke, image adjustments, shadows, effect character, audio levels |

Each Companion supplies page and section IDs and labels in declaration order. These examples are
a shared vocabulary, not a registry of permitted pages. A new component can name a useful grouping
without a Studio change. Put a field where its authoring decision belongs: motion duration is When,
its color is How, and the object's frame is Where. One field has one owner and one location.

## Controls describe the editing task

`bindings` exposes actual author endpoints; `inspector` chooses which to show. A resolved field is
shown only when its binding is writable. The finite controls are independent of the three domains:

| Control | Use |
| --- | --- |
| `text` | Text, identifiers, or a meaningful expression. `multiline: true` provides a textarea. |
| `number` | A scalar with optional limits, stepping, display scaling, or an authored suffix. |
| `boolean` | A two-state switch. |
| `select` | A finite choice, including presets, font families or numeric weights. |
| `color` | Hex text and a native color picker; optional `swatches` offers package-chosen colors. |
| `list` | An ordered value described by an array schema, such as a palette or repeated settings. |
| `record` | Named values described by an object schema, such as one shadow's parameters. |

Lists and records retain Apply/Reset drafts. Their schema owns value shape. There is no separate
palette database, font control protocol, generic CSS editor, or component-supplied DOM renderer.
Use text for an expression whose parts cannot meaningfully be edited as one number.

## Separate author values from display values

The DTO retains the authored `value`. A numeric presentation describes the small, reversible
conversion into the editor. The server applies the inverse, validates the **authored** value against
its public schema, and uses the author language's serializer. Source ranges and existing transactions
still own the write. Failed validation or recompilation does not publish a partial edit.

```ts
// Authored as "78%" or "240px": edit only the magnitude, keep the existing unit.
{ binding: "frame.width", label: "Width", domain: "where",
  section: { id: "size", label: "Size" }, control: "number",
  number: { suffixes: ["%", "px"], step: 1 } }

// Authored as 0.78: display 78 %, write 0.42 when the author enters 42.
{ binding: "appearance.opacity", label: "Opacity", domain: "how",
  section: { id: "image", label: "Image" }, control: "number", unit: "%",
  number: { scale: 100, minimum: 0, maximum: 100, step: 1 } }
```

`unit` is a label, not an instruction to append text. `suffixes` explicitly declares a string-valued
number and retains whichever admitted suffix the current source uses. It does not convert `%` into
pixels or seconds into frames. `scale` is positive; displayed value = authored magnitude × scale.
Limits and step in `number` refer to displayed values. A number schema's limits and integer setting
also inform the input when no presentation override is provided. Empty input is not silently zero.

SVML strings escape attribute delimiters and entity characters. SVS values use `formatSvsValue`.
Neither the UI nor a Companion writes source text through an arbitrary callback. Timeline temporal
gestures are separate from Inspector field conversion; see the temporal author forms for their
semantic-anchor and local-offset editing behavior.

## Choices retain their actual value

Existing string options are shorthand for identical value and label. Rich options can supply a
different label, description and one small visual hint:

```ts
options: [
  { value: "brand-serif", label: "Brand Serif", description: "Project headline face",
    preview: { kind: "font", family: "Project Serif", sample: "Aa 字幕" } },
  { value: "brand-sans", label: "Brand Sans" },
]
```

A color hint uses `{ kind: "color", color: "#FF584A" }`. Values may be strings, numbers or booleans;
the selected value, not its display label, is validated and written. Preview hints contain data only.
Options remain named keyboard-operable choices. Font hints use a family available to the Studio
document; declaring a hint does not install or load a font or change the composition's font bytes.

The optional `@hypit/fonts-open/studio` helper owns its catalog labels and descriptions. Caption,
Typography and Ranking Companions use it to reach a Style's referenced font and edit its `family`
attribute. It appears for an actual writable family attribute; a `media:Font` file has no such
attribute. The family still has to supply the authored weight and style. A local font keeps its exact
file binding. Changing a shared font changes every consumer; this is visible Source reuse.

Nested `referenced` declarations follow explicit author references, such as Style → Font → family.
They neither scan for candidates nor replace whole-value references with strings. Project components
can declare their own option values and binding paths through the same ABI.

## Implementation owners

- `studio-adapter` owns the data-only declarations and snapshot types.
- Component Companions own grouping, choices, units and references to writable author facts.
- Studio resolves endpoints, renders controls, converts display values and commits source edits.
- SVML/SVS and the component's ordinary compilation remain the authority for valid authored work.

The UI follows native numeric input behavior and named listbox options; reference material:
[MDN numeric inputs](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number),
[WAI listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/).
