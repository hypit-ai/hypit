# `@hypit/prompt`

Finite, typed prompt authoring without a second Source language. `Prompt`, `Template`, `Preset` and
`Render` are ordinary package-owned declarations in the canonical SVML Block Frontend.

The algebra intentionally contains only ordered fixed paragraphs, finite choices and exact Text slots.
Concrete wording and model conventions belong to packages such as `@hypit/seedance-kits`; this package
does not know Seedance, GPT Image, media reference order or Provider request fields.

A Preset carries one reusable set of named choices. Both its own declaration and every Render validate
those choices against the selected Template. There is no cascade, inheritance, merge or generic Recipe.
