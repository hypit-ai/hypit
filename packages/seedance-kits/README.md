# `@hypit/seedance-kits`

Seedance-specific Prompt Templates authored as ordinary `.svml` Sources. A Kit owns directing
wording, finite choices and named Text slots; it does not own media edges, model parameters,
Provider behavior or execution.

There is no separate SVS language or Text-template frontend. The package exports normal Source
modules which declare `prompt.Template` values:

| Export | Meaning | Slots |
| --- | --- | --- |
| `./speaker` | One visible speaker; image 1 is the character and scene, audio 1 is the voice reference. | required `dialogue`, optional `action` |
| `./broll` | A silent visual micro-story whose reference roles are described in the story. | required `story` |
| `./podcast` | Two fixed speaker views and their corresponding voices. | required `dialogue`, optional `action` |
| `./call` | Two live call views with main and inset roles. | required `dialogue`, optional `action` |
| `./street-interview` | Interviewer, guest, shared street setup and microphone responsibility. | required `dialogue`, optional `action` |
| `./motion-reference` | Image 1 supplies subject appearance; video 1 supplies body motion. | optional `direction` |
| `./camera-reference` | Image 1 supplies subject appearance; video 1 supplies camera behavior. | optional `direction` |

The Source binding exported by each file is the file's `*-v1` label. A caller may select reusable
finite choices with `prompt.Preset`, then bind exact authored Text when it renders the Prompt:

```svml
module prompt from "@hypit/prompt@1"
module seedance from "@hypit/seedance@1"
source kit from "@hypit/seedance-kits/speaker"

prompt.Preset "speaker-style" {
  template: @kit.speaker-v1
  values: {
    composition-stability: soft-locked
    camera-motion: subtle-punch-in-return
    performance: natural-explainer
    gesture: natural
  }
}

prompt.Render "direction" {
  template: @kit.speaker-v1
  preset: @speaker-style
  bind "dialogue" { value: "Today we are going to test this product." }
  bind "action" { value: "Raise the package on the final phrase." }
}

seedance.reference-video {
  id: take
  model: mini
  prompt: @direction
  duration: 8
  aspect-ratio: 9:16
  Reference "speaker" { image: @speaker-image person-reference: true }
  Reference "voice" { audio: @speaker-voice }
}
```

The template and preset are ordinary typed authored values. `prompt.Render` is the only assembly
step: its result has the nominal `Prompt` type required by Seedance. A plain `Text` cannot be wired
to the model merely because it also contains a string.

Project-specific wording belongs in a project Prompt Template. Changing a Kit means changing its
directing vocabulary; changing how Templates are parsed, compiled or executed is framework work.
Prompt slots explain semantics, but never create or reorder media references.
