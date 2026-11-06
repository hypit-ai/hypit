# `@hypit/speech-estimate`

Provider-free speech-duration estimation, used at creation time. The `hypit estimate` command performs
this deterministic calculation; it does not observe generated audio.

A duration is the author's decision, written as a literal on the declaration that needs it:
`seedance.text-video { … duration: 8 }`. This package is how the
author arrives at that number before writing it. It counts pronunciation units of a Text with a
language-aware delivery density (English dictionary words use CMUdict; unknown words use a
deterministic spelling fallback), then applies optional padding and the selected rounding. The Text remains
authoritative: the estimator never invents how numbers, names or acronyms are pronounced.

```bash
hypit estimate main.svml --segment opening --language en --pace normal
hypit estimate --text "Video editing begins with meaning." --language en --pace normal --rounding ceil
```

## Units and delivery

English counts pronunciation syllables, not words or letters. Mandarin Chinese counts each Han
character as one approximate syllable, with English syllables for embedded English words.
Traditional and simplified Han use the same counting rule; punctuation separates words without
adding units. This remains an approximation: connected English speech can reduce syllables,
and Mandarin erhua can combine written characters into one syllable. An explicit `--language zh`
keeps a Chinese passage with many English names under its intended delivery policy.

Estimate from the spoken wording. `--segment` reads the Script's pronunciation side of Dual Text;
`--text` reads literal speech, so spell numbers and letter names as they will be said. A count
cannot resolve an unspecified pronunciation.

| Language | slow | normal | fast | Unit |
| --- | ---: | ---: | ---: | --- |
| English (`en`) | 4.2 | 4.6 | 5.6 | syllables/s |
| Mandarin Chinese (`zh`) | 4.2 | 5.25 | 6.5625 | approximate syllables/s |
| Japanese (`ja`) | 6 | 7.5 | 9.375 | approximate written mora-like units/s |
| Spanish (`es`) | 4.72 | 5.9 | 7.375 | approximate syllables/s |

These are authoring starting points for whole-passage delivery, including ordinary speech pauses.
`normal` suits conversational explanation; `fast` gives brisk, tightly delivered copy less time.
The English fast preset is deliberately separated from normal so that choosing brisk delivery
meaningfully changes the estimate. The Chinese normal preset is retained: available research
does not establish that it is systematically too slow for whole passages. Neither table is a
calibration of a particular video or voice model. For a specific delivery, a positive numeric
`--rate` replaces the preset, including rates outside this table.

Japanese currently counts each Han or kana code point as one approximate unit and applies the English
fallback to embedded Latin words. This is intentionally a writing-based estimate, not a morphological
or pronunciation analysis: small kana, long-vowel marks and context-dependent readings can make the
count differ from spoken morae. Spanish uses a deterministic vowel-nucleus approximation; hiatus,
diphthongs and dialectal delivery can differ. Unlike the English and Mandarin discussion below, the
Japanese and Spanish presets are inherited authoring heuristics rather than values validated by the
cited studies. Use an explicit numeric `--rate` when the production has better delivery evidence.

```bash
hypit estimate main.svml --segment opening --language zh --pace fast --rounding round
hypit estimate main.svml --segment opening --language zh --rate 6 --rounding none
```

`seconds = pronunciation units / rate + padding`, followed by rounding. Add `--padding` for extra
time deliberately reserved for a reaction, demonstration or held pause. Ordinary phrasing is
already part of the chosen density; adding a generic pause allowance on top lengthens the passage
again. `round` selects the nearest whole second, `ceil` rounds upward, and `none` keeps the fraction.
The CLI shows the resolved rate and padding; JSON retains full numeric precision.

For 60 Mandarin units, normal gives 11.43 seconds and fast gives 9.14 seconds before rounding.
For 60 English syllables, normal gives 13.04 seconds and fast gives 10.71 seconds. Equal unit counts
do not imply equal information, and 60 English words need not contain 60 syllables.

The estimate reports the time the wording needs at that delivery. Use it to decide whether a passage
needs merging, fuller wording, tightening, or splitting, then choose the request duration with the
selected model's supported values in mind.

`SpeechEstimatePolicy` holds the language, pace or rate, rounding and optional padding used by the
local estimation API. CLI strings may be decoded with `speechEstimatePolicyFromAttributes`.
The policy and estimate never become AuthorGraph Records, Producers or dependencies: the author
uses the answer before writing the literal request duration. Actual word positions come from the
performed media when downstream relationships need those positions.

```ts
import { estimateSpeechDuration, sealSpeechEstimatePolicy } from "@hypit/speech-estimate";
```

## Research basis and limits

[Burchfield and Bradlow (2014)](https://doi.org/10.1121/1.4874357) measured Mandarin and English
across clear reading, plain reading and spontaneous speech. Plain-reading means were 5.97 and
5.39 canonical syllables/s respectively. Their articulation measure excludes errors, silence
and non-speech, so those means cannot directly size an entire performance containing pauses.
[Coupé et al. (2019)](https://doi.org/10.1126/sciadv.aaw2594) likewise counted canonical syllables
and excluded pauses longer than 150 ms in their cross-language reading study. These studies
support distinguishing language, pronunciation units and timing denominator; they do not
establish one ideal pace for social video or validate these preset values.

When an already understood reference passage provides useful timing, its spoken-unit count
divided by its first-to-last-word span offers a starting density, including internal pauses.
Choose how much of that rhythm belongs in the new performance. Requested clip length alone
is not measured speaking time, and delivery density does not describe emphasis or expression.
