# `@narratage/estimate`

Provider-free deterministic speech-duration planning.

`<estimate:Speech>` consumes an ordinary `Text` value and produces the public `SpeechDuration`
contract. It uses a language-aware pronunciation-unit delivery density, then applies explicit
bounds and rounding. English dictionary words use CMUdict;
unknown words use a deterministic spelling fallback. The consumed Text remains authoritative:
the estimator never invents how numbers, names or acronyms should be pronounced.

```xml
<estimate:Speech
  id="opening-duration"
  source={story.segment.opening.speech}
  language="en"
  pace="normal"
  min="4"
  max="15"
  rounding="round"
/>
```

The English pace presets are `slow = 4.2`, `normal = 4.6` and `fast = 5.0`
syllables per second. A policy may use a positive numeric `rate` instead of `pace`:

```xml
<estimate:Speech id="opening-duration" source={story.segment.opening.speech} rate="4.75"/>
```

Every policy field is explicit. `round` selects the nearest provider-compatible integer second. `ceil` remains available
when a project explicitly prefers a conservative, never-shorter duration.

The output is `opening-duration.duration`. Estimate is only one possible producer of this shared
value; model packages consume the contract rather than depending on this package.
