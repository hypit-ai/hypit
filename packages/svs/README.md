# `@hypit/svs`

Minimal official parameter-recipe Frontend normally used by `.svs` SourceUnits. The source must
select it explicitly with `<?svml using="@hypit/svs@1"?>`; the suffix is only a human convention.

The SVS Frontend reads a `<sheet version="1">` containing named rule blocks and emits one immutable generic
`Recipe` Record per rule. It does not know Caption, Film, Track or Provider parameters and it does
not implement CSS selectors, cascade or inheritance. A consuming package validates a Recipe's
properties and lowers it into its own typed Program Record.

Recipe values use the shared canonical value model: `null`, booleans, finite
numbers and strings remain compact scalar values; lists and records use strict
JSON array/object syntax. SVS only parses and serializes those shapes. The
consuming domain package owns their schema and meaning.

```svs
<?svml using="@hypit/svs@1"?>
<sheet version="1">
ranking.column {
  rank-colors: ["#ff3f56", "#ffa72d", "#eadc2a"];
}
</sheet>
```

Source import aliases are owned by Source Closure compilation. A rule `caption.alice` remains that
relative public export; importing it as `studio` exposes `studio.caption.alice` without changing the
Recipe Record identity.

Each property ends with `;`. Duplicate properties in one rule and duplicate rule paths are errors.
Bare words such as `cover` remain strings; use quoted strings when punctuation could conflict with
the rule syntax. JSON arrays and objects require JSON quoting; they do not evaluate expressions or
graph references. Units such as `8f` or `50%` remain string values until a consuming package interprets
them. A consumer that needs graph media or font inputs takes explicit Source references separately.

The Recipe Source's rule paths do not imply parent/child inheritance: `caption.base` and
`caption.guest` are independent values. Any parameter defaults or overrides come from the declared
consumer, such as TextTemplate's defaults/Recipe/Param precedence, not from SVS itself.
