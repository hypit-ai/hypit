# `@hypit/text`

External components use `@hypit/hypit/text` for graph Text types, template helpers and Producer references,
with `@hypit/hypit` as a development dependency. Source imports retain `@hypit/text@1`.

Domain-neutral text values and deterministic text programs.

This package does not own the `.svml` grammar, call models, or know what a prompt
is. A `TextTemplate` plus explicit `TextBindings` renders one ordinary `Text`
graph output. Dynamic text enters through normal graph edges, so the output can
be a Target or feed another declaration like every other value.

Template call cycles are rejected structurally. A finite diamond call graph can still multiply its
output, so the Text Producer applies the Executor's inline Value byte limit while appending content;
it does not maintain a Text-specific recursion or character limit. Direct `renderText` callers may
provide the same `maxInlineValueBytes` option when they need the Host execution boundary.

Its optional Markup vocabulary exposes literal and assembled values without
hiding the graph:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="ugc" source="./ugc-template.svs"/>

<text:Value id="extra">Keep the product readable.</text:Value>
<text:Render id="prompt" template={ugc.product-shot} recipe={recipes.product-shot}>
  <text:Param name="camera" value="handheld"/>
  <text:Param name="strict" value="true" type="boolean"/>
  <text:Set name="dialogue" text={story.segment.hook.dialogue}/>
  <text:Append name="constraints" text={extra}/>
</text:Render>
```

`Value` authors `Text`; `Render` authors text, number or boolean Params and connects each
`Set`/`Append` Text reference as an explicit graph edge. The output `{prompt}`
can feed any model's declared text port.

`recipe` is optional. When present, `Render` projects the Recipe's scalar properties that the
template actually declares into its bindings. Template defaults, Recipe values and explicit
`Param` children form the generic style → recipe → parameter precedence; unrelated Recipe fields
such as model or resolution are ignored by the text program. No prompt-specific package code is
needed.

`@hypit/markup` is the XML-like authoring Frontend and
`@hypit/text-fine` renders text into video. They are deliberately
separate packages.

## Graph consumers

`Text` is a small domain-neutral graph value, not a prompt-only type. Current consumers include:

- exact model prompt ports;
- `@hypit/text-fine` Point, Flow and Path occurrence content;
- Ranking Column/TopThree labels;
- Comment Sticker comment, author, header and metadata copy;
- Deck Card labels.

Each consumer declares an ordinary `Text` input in its own Fragment. No consumer registry, prompt
registry or video-specific branch exists in Core. A static literal may still be written inline for
convenience; a value produced elsewhere stays an explicit graph edge all the way to the consumer.

`Value` and `Render` now have package-owned syntax-neutral Author Declarations. They own their fields,
children, Type constraints, scalar decoding and Fragment lowering; Markup owns only the `Value` and
`Render` spellings. Direct callers and Markup therefore produce the same Records and Components, and
a Render may refer to a Text declaration written later in the Source. The TextTemplate SVS Frontend
remains in this package because it projects generic Recipes into the same Text-owned template meaning;
it is not a second authoring implementation or an independent package boundary.

Consumer-owned structure does not move into this package. Rich typography, Ranking layout, Sticker
fields and Deck label appearance remain in their respective packages. Caption's ordered display
Atoms/Words also remain Caption author truth rather than being flattened into generic `Text`.
