# `@hypit/stand-in`

A stand-in is what a generated output looks like before it is generated: a designed card, drawn
instead of bought, that the author selects as a Candidate for that output in an ordinary Run. The
card is derived from the model's own request — kind, frame, model, duration, prompt — so it follows
the Source when the Source changes, and it goes through the same inspect and normalize steps as the
real output would.

This module owns the vocabulary only: the `StandInCardRequest` type and the `draw-card` capability.
Every exact-model package built with `@hypit/model-kit` exports one Run Fragment per model that
turns its draft into that request; a local media Provider draws the card (`@hypit/media-execution`).
Nothing here is a mock: the Provider that serves `draw-card` really draws a card, prices it as
local work, and never pretends to be the model.

```xml
<import from="@hypit/seedance@1" as="seedance"/>
<fragment id="kitchen-card" using="seedance:mini-stand-in">
  <input name="draft" from="kitchen.draft"/>
  <input name="prompt" from="kitchen-direction"/>
  <input name="clock" from="clock"/>
</fragment>
<satisfy output="kitchen.video" candidate="kitchen-card.video"/>
```

Remove the `satisfy` line and build again to buy the real output. The card carries a diagonal
STAND-IN watermark, its kind in large type, the model, the frame and duration, an excerpt of the
prompt, and — for video — a running timecode and progress bar, so a cut that lands on the wrong
frame is visible in the preview. Text on the card is drawn with a built-in bitmap font: Latin
letters, digits and common punctuation; other characters appear as boxes.
