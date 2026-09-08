# `@hypit/gpt-image-kits`

`phone-ugc-v1` is a data-only Text Template for assembling image prompts. Its
[source](kits/phone-ugc-v1.svs) emits a fixed iPhone-video capture paragraph, followed by the supplied
Text slots, with paragraph separators. Import it as `@hypit/gpt-image-kits/phone-ugc-v1`.

For creative direction, see the Image direction page in the Hypit Skill.

## Blocks and inputs

The capture block is fixed by this template version. Selecting a different capture language means
selecting or authoring another Text Template. The caller supplies the variable direction:

| Text slot | Required | Content |
| --- | --- | --- |
| `shot` | Yes | Camera view, framing, posture, gaze and interaction. |
| `direction` | Yes | Subject, styling, setting and intended appearance. |
| `references` | No | What each connected reference supplies or changes. |

Each slot accepts an ordinary Text Output and may contain several paragraphs. The template produces
Text; the image Surface consumes it. Actual reference Resources and model parameters are connected
on that Surface.

## Assemble the prompt

Given authored Text Outputs `portrait-shot` and `portrait-direction`, this fragment assembles the
prompt and passes it to `gpt:Image`:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="gpt" from="@hypit/gpt-image@1"/>
<import as="ugc" source="@hypit/gpt-image-kits/phone-ugc-v1"/>

<text:Render id="portrait-prompt" template={ugc.phone-ugc-v1}>
  <text:Set name="shot" text={portrait-shot}/>
  <text:Set name="direction" text={portrait-direction}/>
</text:Render>

<gpt:Image id="portrait" prompt={portrait-prompt} aspect-ratio="9:16" resolution="2K"/>
```

To explain reference inputs, add a `text:Set` named `references` to the Render. Connect those same
images through `gpt:Reference` children on `gpt:Image`. Omit the optional Set when no reference
direction is needed. The Text does not create Resource bindings.
