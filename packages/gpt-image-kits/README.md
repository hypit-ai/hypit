# `@hypit/gpt-image-kits`

`phone-ugc-v1` is a GPT Image-specific Prompt Template authored as an ordinary `.svml` Source.
Its [source](kits/phone-ugc-v1.svml) emits fixed phone-capture direction, followed by the optional
`person`, required `shot`, and optional `setting` Text slots in that order.

There is no separate SVS or generic Text-template frontend. Import the Source, render its typed
Template through `@hypit/prompt`, and pass the resulting `Prompt` to GPT Image:

```svml
module prompt from "@hypit/prompt@1"
module gpt from "@hypit/gpt-image@1"
source ugc from "@hypit/gpt-image-kits/phone-ugc-v1"

prompt.Render "portrait-prompt" {
  template: @ugc.phone-ugc-v1
  bind "person" { value: "The person from reference image 1, preserving identity and styling." }
  bind "shot" { value: "A waist-up view while holding the product from reference image 2." }
  bind "setting" { value: "A bright lived-in kitchen in the morning." }
}

gpt.image {
  id: portrait
  prompt: @portrait-prompt
  aspect-ratio: 9:16
  resolution: 2K
  Reference "person" { image: @person-image }
  Reference "product" { image: @product-image }
}
```

Slots describe the responsibilities of those references; they do not create resource bindings.
Selecting different capture language means selecting or authoring another Prompt Template.
