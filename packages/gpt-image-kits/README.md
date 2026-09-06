# `@hypit/gpt-image-kits`

Data-only Text Templates for image direction. `phone-ugc-v1` carries one fixed iPhone-video capture
language, with current-shot direction supplied as ordinary Text. It introduces no model wrapper,
Provider, media generation, or activation hook.

## When to use phone-ugc

Use this template for images that should feel like frames from phone-shot social video: a creator,
an interview view, a lifestyle or product-use shot, or even an imagined person or animal inhabiting
a photographed world. It favors natural-looking lighting, fine texture, and a readable background
without depth-of-field blur. These are the chosen capture assumptions of this Kit, rather than
requirements imposed by GPT Image. A different capture language can use a different template or
authored Text.

The capture paragraph is a versioned English text block and remains unchanged whenever this Kit is
selected. Its skin wording is part of that whole capture direction, including for an animal or
fantastical subject. When another subject or visual form genuinely needs a different capture language,
author another Text Template instead of conditionally rewriting this one. Portrait framing stays in
the `shot` input, while beauty, styling, material and scene-specific light stay in `direction`.

| Text slot | Meaning |
| --- | --- |
| `shot` (required) | Fluent direction for framing, comfortable camera distance, subject placement and its spatial reason, including space needed by later composition. Output aspect ratio and resolution belong to model parameters. |
| `direction` (required) | Fluent direction for the subject's presence, styling, physical state, setting, materials, intended feeling, and the palette and tonal relationship across the frame. |
| `references` (optional) | What each connected reference supplies and what this image should change. |

Character, beauty, color, mood, subject position, camera distance and lighting remain fluent authored
decisions in `shot` and `direction`. The optional `references` text explains actual reference edges;
it does not create them or set model attributes. Describe a useful scene around an offset person, and
compose around later MG without asking the image model to draw that MG.

Set aspect ratio and resolution through the model's parameters. For `@hypit/gpt-image`, the example
below uses `aspect-ratio="9:16"` and `resolution="2K"` on `gpt:Image`. Those parameters are the
authoritative output shape and size, so numeric values usually need no repetition in the prompt.
Keep directional camera or orientation language in `shot` when it materially clarifies the composition.

## Use it in a project

Import the package's public Source directly. The package manager or active Distribution owns its
installed version; the Source Closure reads the exported template without copying it into the video
project or executing package code.

```svml
<?svml using="@hypit/markup@1"?>
<svml>
  <import as="text" from="@hypit/text@1"/>
  <import as="gpt" from="@hypit/gpt-image@1"/>
  <import as="ugc" source="@hypit/gpt-image-kits/phone-ugc-v1"/>

  <text:Value id="shot">
    Generate a half-body view of a woman seated slightly to the right, comfortably near the camera,
    with her face, shoulders, and gesturing hand clearly visible and naturally proportioned.
  </text:Value>
  <text:Value id="direction">
    A Latina woman in her thirties has the striking beauty and commanding presence of a leading
    Italian film actress, with broad shoulders and excellent head-to-shoulder proportions.
    Her attitude says, "Stay out of my husband's business."
    She wears a leopard-print fur coat over a black low-cut top, layered gold chains, and gold hoop
    earrings. Her dark-brown hair falls in voluminous waves; her lipstick is classic red and her
    long nails are deep red. She holds a handheld microphone while speaking to the camera, her free hand
    gesturing naturally. She sits in a leather booth in an expensive Italian restaurant, with an
    oil painting behind her, a bar farther back, and candles on a windowsill. Red upholstery and gold
    accents establish the room, while the patterned coat and black top give her figure definition.
  </text:Value>
  <text:Render id="prompt" template={ugc.phone-ugc-v1}>
    <text:Set name="shot" text={shot}/>
    <text:Set name="direction" text={direction}/>
  </text:Render>

  <gpt:Image id="portrait" prompt={prompt} aspect-ratio="9:16" resolution="2K"/>
</svml>
```

When references are needed, add `gpt:Reference` children to `gpt:Image` and a `references` Text slot
describing those same inputs, for example “Use the first image for the person's identity; create
the new camera view described here.” A reference for identity alone does not lock its camera or pose.
Keep aspect ratio, resolution, model options, and Resource bindings on their owning Surfaces. The
ordinary Run selects Targets and Candidates; the Runtime Profile selects the execution Endpoint.
