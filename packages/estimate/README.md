# `@hypit/estimate`

Provider-free speech-duration measurement, used at creation time.

A duration is the author's decision, written as a literal on the element that needs it:
`<seedance:TextVideo … duration="8"/>`, `<media:StillVideo … duration="6"/>`. This package is how the
author arrives at that number before writing it. It counts pronunciation units of a Text with a
language-aware delivery density (English dictionary words use CMUdict; unknown words use a
deterministic spelling fallback), then applies optional padding and the selected rounding. The Text remains
authoritative: the estimator never invents how numbers, names or acronyms are pronounced.

```bash
hypit measure main.svml --segment opening --language en --pace normal
hypit measure --text "Video editing begins with meaning." --language en --pace normal --rounding ceil
```

The English pace presets are `slow = 4.2`, `normal = 4.6` and `fast = 5.0` syllables per second; a
positive numeric `rate` replaces `pace`. `round` selects the nearest whole second, `ceil` a
never-shorter one, `none` keeps the fraction.

The estimate reports the time the wording needs at that delivery. Use it to decide whether a passage
needs merging, fuller wording, tightening, or splitting, then choose the request duration with the
selected model's supported values in mind.

The one graph value this package declares is `SpeechEstimatePolicy`: the same language, pace or rate,
rounding and optional padding, written as attributes or an SVS Recipe on `<estimated:SemanticTake>`, which
weights a Segment's Tokens across preview media by pronunciation units. Nothing here runs inside a
Build; a Build plan is complete before it starts because every duration is already a literal.

```ts
import { estimateSpeechDuration, sealSpeechEstimatePolicy, speechEstimatePolicyFromRecipe } from "@hypit/estimate";
```
