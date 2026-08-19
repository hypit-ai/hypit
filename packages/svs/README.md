# `@hypit/svs`

Minimal official parameter-recipe Frontend normally used by `.svs` SourceUnits. The source must
select it explicitly with `<?svml using="@hypit/svs@1"?>`; the suffix is only a human convention.

The SVS Frontend reads a `<sheet version="1">` containing named rule blocks and emits one immutable generic
`Recipe` Record per rule. It does not know Caption, Film, Track or Provider parameters and it does
not implement CSS selectors, cascade or inheritance. A consuming package validates a Recipe's
properties and lowers it into its own typed Program Record.

Source import aliases are owned by Source Closure compilation. A rule `caption.alice` remains that
relative public export; importing it as `studio` exposes `studio.caption.alice` without changing the
Recipe Record identity.
