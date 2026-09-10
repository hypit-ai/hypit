# `@hypit/gpt-image-kits`

`phone-ugc-v1` is a data-only Text Template for assembling image prompts. Its
[source](kits/phone-ugc-v1.svs) emits a fixed iPhone-video capture paragraph, followed by the supplied
Text slots in `person` → `shot` → `setting` order, with paragraph separators.
Import it as `@hypit/gpt-image-kits/phone-ugc-v1`.

For creative direction, see the Image direction page in the Hypit Skill.

## Blocks and inputs

The capture block is fixed by this template version. Selecting a different capture language means
selecting or authoring another Text Template. The caller supplies the variable direction:

| Text slot | Required | Content |
| --- | --- | --- |
| `person` | No | Person or cast, appearance and styling; identity references and what they preserve. |
| `shot` | Yes | Camera view, framing, posture, gaze, action and interaction with people or props. |
| `setting` | No | Surrounding place, palette, structures and objects; scene references and what they preserve. |

For a complete new character-and-scene image, supply all three as ordinary paragraphs. A derived
view may inherit its person or setting from connected references and omit those slots. Omitted
blocks add no empty paragraphs. State the necessary reference responsibilities in the slot they
affect. Each slot accepts an ordinary Text Output and can describe more than one person or relationship.
The template produces Text; the image Surface consumes it. Actual reference Resources and model
parameters are connected on that Surface.

## Assemble the prompt

Given authored Text Outputs `portrait-person`, `portrait-shot` and `portrait-setting`, this fragment assembles the
prompt and passes it to `gpt:Image`:

```svml
<import as="text" from="@hypit/text@1"/>
<import as="gpt" from="@hypit/gpt-image@1"/>
<import as="ugc" source="@hypit/gpt-image-kits/phone-ugc-v1"/>

<text:Render id="portrait-prompt" template={ugc.phone-ugc-v1}>
  <text:Set name="person" text={portrait-person}/>
  <text:Set name="shot" text={portrait-shot}/>
  <text:Set name="setting" text={portrait-setting}/>
</text:Render>

<gpt:Image id="portrait" prompt={portrait-prompt} aspect-ratio="9:16" resolution="2K"/>
```

Connect reference images through `gpt:Reference` children on `gpt:Image` in the order described by
the prompt. For example, a `person` paragraph can inherit identity from reference 1 while `shot`
describes holding the product from reference 2. The Text does not create Resource bindings.
