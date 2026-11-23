# Authoring a Custom Caption Component (`caption-authoring.md`)

Read this when a video needs a bespoke caption layout, kinetic word choreography, or speaker-reactive subtitle system beyond standard `@hypit/text-fine` cues. [Caption Craft](../playbooks/craft/captions.md) owns readability and directing judgment; [Caption Presentation](caption-presentation.md) owns styling and placement; [Track & Component Authoring](track-authoring.md) owns the NLE component package contract.

## Decide What Is Actually New

Before building a custom caption package, decide whether TSX authoring + `@hypit/text-fine` is already enough:

- **Uniform styled cues** (one or two lines, clean typography, speaker color swaps, occasional emphasis highlights) can be generated directly in TSX from a timed transcript (`hypit transcript align`) as `<present source="component">` items using `@hypit/text-fine` on a `<track kind="picture" role="subtitle">`.
- **Custom caption families** are justified when words play distinct structural roles—such as a large focal keyword anchored above a supporting phrase, animated word-by-word karaoke pills, speech-bubble layouts tied to speaker positions, or integrated graphic callouts that share layout with spoken text.

## Consume the Timed Transcript Cleanly

A custom caption component receives aligned word timing (`{ language, words: [{ text, start, end }] }`) via `<parameters>` (or pre-grouped cue data computed in TSX from `hypit transcript align`):

```json
{
  "language": "en",
  "cues": [
    {
      "id": "cue-1",
      "speaker": "HOST",
      "start": 0.12,
      "end": 1.85,
      "words": [
        { "text": "Every", "start": 0.12, "end": 0.41 },
        { "text": "frame", "start": 0.42, "end": 0.78, "emphasis": true },
        { "text": "counts.", "start": 0.80, "end": 1.24 }
      ]
    }
  ]
}
```

- **Keep display text faithful**: preserve exact authored punctuation, capitalization, and CJK spacing from the aligned transcript. Never invent spaces inside Chinese or Japanese text, and never drop words to force a narrow box.
- **Separate speech time from visual state**: use each word's exact `start`/`end` for active highlights or kinetic entrances, while deriving the cue's overall visibility from its Present's `start` and `duration` (or cue bounds).
- **Render deterministically per frame**: implement `hypit.nle-render` returning an `HtmlVisual` whose `render(frame)` computes active word state, progress, and layout directly from the requested frame. Direct seeks in NLE Studio must display the exact active word without replaying from frame 0.

## Register on a Subtitle Track Role

In your `NleComponentDefinitionContribution`, set `role: "subtitle"` and `sourceTime: () => ({ kind: "timed" })`, and implement `readText` so NLE Studio's timeline displays readable cue labels. Expose useful Inspector controls (`createNleInspectorPresentationContribution`) for font family, font size, colors, and vertical offset so an editor can fine-tune readability without touching code.

## Verify Real Edge Cases

Test your caption component with a short passage containing:

- uneven word durations and a natural breath pause;
- long words or mixed Latin/CJK phrases;
- speaker switches and cue handoffs;
- direct random seeking in NLE Studio (`hypit nle open`) into the middle of an active cue.
