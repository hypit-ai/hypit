# `@narratage/estimate`

Provider-free deterministic speech-duration planning.

`<estimate:Speech>` consumes an ordinary `Text` value and produces the public `SpeechDuration`
contract. It uses a language-aware syllable/character/mora rate, then applies an
explicit tail padding, bounds and rounding policy. It performs no network or media work.

```xml
<estimate:Speech
  id="opening-duration"
  source={story.segment.opening.speech}
  language="en"
  pace="normal"
  padding="0.3"
  min="4"
  max="15"
  rounding="ceil"
/>
```

The output is `opening-duration.duration`. Estimate is only one possible producer of this shared
value; model packages consume the contract rather than depending on this package.
