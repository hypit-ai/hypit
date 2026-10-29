# Street interview

[reference.svml](reference.svml) generates the shared encounter and both close views for a black-haired
mob wife beside a sky-blue Lamborghini, interviewed by a young man in a purple shirt and backward
flag cap. [reference.svrun](reference.svrun) targets a finished video without earlier Results.

## From images to the encounter

The shared image establishes both identities, clothing, the car and street. Guest and interviewer
close views each reference that image. The interviewer view keeps a portion of the guest at its left
edge, preserving their spatial relationship. All three are generated; the old `host.png`, `wife.png`
and `guy.png` are not inputs to this entry. Two Fish Audio Voice Design requests supply recurring voices.

The street-interview Kit consumes interviewer, guest and shared images in that order, followed by
the corresponding interviewer/guest voice references. Three Seedance Mini clips carry eleven, eight
and eight seconds of dialogue. The first starts with the guest occupied with her bag as the
interviewer approaches. Answers favor her close view; neutral questions can use the shared view,
and surprised questions can cut to him. The final answer ends with her beginning to turn away.
These cuts and actions are authored within the generated clips, with no serial tail-frame chain.

Each reveal uses the same Script Moment for the answer strip, sound and colored flash. Prepared
question-mark, sparkles, building and Bitcoin PNGs remain local assets. Their palette works with
Caption and the flashes. The soundtrack and reveal sound are also supplied files. No generic
photographic image prompt stands in for this purpose-made graphic artwork.

The repeated flash is implemented by the project-local `packages/flash` Author Package. It is part
of this video's source, not an official Screen Overlay family or an ecosystem dependency.

## Build a fresh result

[reference.svs](reference.svs) owns this entry's Recipes. The Source imports
`@hypit/gpt-image-kits/phone-ugc-v1` and `@hypit/seedance-kits/street-interview`.
Run `npm install` once in this directory to install the selected Hypit 0.4 release, font,
[`@hypit/interview-emoji-reveal`](https://www.npmjs.com/package/@hypit/interview-emoji-reveal)
and project-local Flash dependencies. Review and commit the resulting lockfile; subsequent installs
use `npm ci`.

```bash
npm install
npx hypit check reference.svrun
npx hypit estimate reference.svml --segment manifest-rule --language en --pace fast --rounding ceil
npx hypit estimate reference.svml --segment real-estate-rule --language en --pace fast --rounding ceil
npx hypit estimate reference.svml --segment bitcoin-rule --language en --pace fast --rounding ceil
npx hypit plan reference.svrun --runtime ./hypit.runtime.json
```

Those estimates are eleven, eight and eight seconds. Review the selected Endpoints and pricing;
under spending authorization, `npx hypit build reference.svrun --runtime ./hypit.runtime.json --follow`
generates and composes the work. The initial result uses fixed Caption positions. Watch it to judge
performance, cuts, reading and reveal timing.

## Add head-following Caption to this footage

The published video used externally measured head positions. A fresh generation changes motion,
cuts and actual length, so its spatial sequence must describe that actual footage.

After the first Build, export its `final.video` and measure that actual footage, using Google Video
Intelligence with face bounding boxes, another suitable detector, or manual observation. If graphics
obstruct the detector, render a clean picture pass from the same prepared media. Use the actual
program frame count and 30 fps clock; identify WIFE across camera cuts, expand face boxes to include
her hair, and write one normalized `[x,y,width,height]` or `null` per frame into a standalone
`reference-heads.regions.svml`. Review and correct that author file before importing it.

Once that real Recipe exists, add its import to the Source's opening prologue:

```svml
<import as="heads" source="./reference-heads.regions.svml"/>
```

After `vertical` is declared, add its measured timeline and connect it to the existing Caption Track:

```svml
<import as="sequence" from="@hypit/spatial-sequence@1"/>
<sequence:TimelineRegions id="wife-heads" document={heads.heads}
  timeline={speech.timeline} canvas={vertical.canvas}/>
<caption-fine:Caption id="captions" document={story.caption} timing={caption-timing}
  timeline={speech.timeline} within={vertical.bounds} regions={wife-heads}>
  <caption-fine:Use style={caption-boy-style}/>
  <caption-fine:Use role="WIFE" style={caption-wife-style}/>
  <caption-fine:Follow role="WIFE" series="wife-head" missing="hide"/>
</caption-fine:Caption>
```

Replace the existing `captions` declaration with the connected one. The author file names the measured
series `wife-head`; `Follow` explicitly assigns that series to WIFE. `caption.wife` already uses
center/bottom anchoring so its text sits above that region. The unbound BOY continues to use fixed
Style placement. A null WIFE region hides her Caption on that frame.

Accept the three generated clips into the project before the second composition pass. Export each
public video Output, declare the exported file with `@hypit/media`, and use authored realization
selection for the corresponding generated role:

```bash
hypit get ACTUAL_BUILD_ID --output manifest-rule-take.video \
  --to assets/accepted/manifest-rule.mp4
```

```svml
<import as="media" from="@hypit/media@1"/>
<import as="realization" from="@hypit/realization@1"/>

<media:Video id="accepted-manifest-rule" src="./assets/accepted/manifest-rule.mp4"/>
<realization:Select output={manifest-rule-take.video} record={accepted-manifest-rule}/>
```

Apply the same explicit Author edit to the other two passages. Media preparation then derives the
current `PreparedMedia`, local domain and extent from those accepted clips. Check `hypit plan` to
confirm that the second render contains no new image, voice or video request. Inspect camera cuts and
moving head placement in the result. Changing only Caption or MG needs no repeat generation; changing
the footage requires matching measurements.

If reviewing the actual footage reveals a transcription timing error, use the explicit speech-evidence
path. Produce or export an editable `.transcript.svml`, correct its word evidence, import that Source,
and connect its published `SpeechTranscriptEvidence` to the existing Alignment declaration. The
Alignment continues to express the relationship between the Script Segment and the accepted media
domain; the correction belongs to the evidence rather than to an Invocation override.

## Prompt provenance

The author's `studio-prompts-incremental-2026-08-29` export contains the black-haired guest/Lamborghini
shared direction from August 28 at 09:54 and the focused guest/interviewer directions from 13:16–13:21.
The wording and reference counts match the supplied project images and the author's explanation.
This English adaptation keeps the casting, wardrobe and scene, removes an unnecessary phone prop
from the shared prompt, and uses compact gestures in Action. It does not import the earlier blonde
version or the later Porsche adaptation. The voice directions are newly authored; a fresh generation
will differ from the showcased footage.

`swap-host`, `swap-lang` and `swap-ride` are independent variants with their own authored measurements.
