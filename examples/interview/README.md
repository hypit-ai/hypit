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
the corresponding interviewer/guest voice references. Three Seedance Mini Takes carry eleven, eight
and eight seconds of dialogue. The first starts with the guest occupied with her bag as the
interviewer approaches. Answers favor her close view; neutral questions can use the shared view,
and surprised questions can cut to him. The final answer ends with her beginning to turn away.
These cuts and actions are authored within the Takes, with no serial tail-frame chain.

Each reveal uses the same Script Moment for the answer strip, sound and colored flash. Prepared
question-mark, sparkles, building and Bitcoin PNGs remain local assets. Their palette works with
Caption and the flashes. The soundtrack and reveal sound are also supplied files. No generic
photographic image prompt stands in for this purpose-made graphic artwork.

## Build a fresh result

[reference.svs](reference.svs) owns this entry's Recipes. The copied Kits are under `kits/`.

```bash
hypit check reference.svrun
hypit measure reference.svml --segment manifest-rule --language en --pace fast --rounding ceil
hypit measure reference.svml --segment real-estate-rule --language en --pace fast --rounding ceil
hypit measure reference.svml --segment bitcoin-rule --language en --pace fast --rounding ceil
hypit plan reference.svrun --runtime ./hypit.runtime.json
```

Those estimates are eleven, eight and eight seconds. Review the selected Endpoints and pricing;
under spending authorization, `hypit build reference.svrun --runtime ./hypit.runtime.json --follow`
generates and composes the work. The initial result uses fixed Caption positions. Watch it to judge
performance, cuts, reading and reveal timing.

## Add head-following Caption to this footage

The published video used externally measured head positions. A fresh generation changes motion,
cuts and actual length, so this Source does not import the original 783-frame `tracking.svs`.
That file describes the old footage only. Supplying it to new Takes would attach plausible-looking
numbers to the wrong video.

After the first Build, export its `final.video` and measure that actual footage, using Google Video
Intelligence with face bounding boxes, another suitable detector, or manual observation. If graphics
obstruct the detector, render a clean picture pass from the same normalized Takes. Use the actual
program frame count and 30 fps clock; identify WIFE across camera cuts, expand face boxes to include
her hair, and write one normalized `[x,y,width,height]` or `null` per frame into a new
`reference-heads.svs`. Keep interpolation within a continuous shot and one identity.

Once that real Recipe exists, add its import to the Source's opening prologue:

```svml
<import as="heads" source="./reference-heads.svs"/>
```

After `vertical` is declared, add its measured timeline and connect it to the existing Caption Track:

```svml
<space:RegionTimeline id="wife-heads" within={vertical} recipe={heads.heads.wife}/>
<caption-fine:Track id="captions" document={story.caption}
  semantic={speech.semantic} program={caption-program} regions={wife-heads}/>
```

Replace the existing `captions` declaration with the connected one. The Recipe contains a WIFE Role
track; `caption.wife` already uses center/bottom anchoring so its text sits above that region.
The untracked BOY continues to use his fixed Style position. A null WIFE region hides her Caption
on that frame; it does not guess a new location.

In the Run, select the first Build's `manifest-rule-semantic.take`, `real-estate-rule-semantic.take`
and `bitcoin-rule-semantic.take` outputs as Candidates. For example, fill the actual Build id in:

```svml
<build-record id="reuse-manifest" build="ACTUAL_BUILD_ID" output="manifest-rule-semantic.take"/>
<satisfy output="manifest-rule-semantic.take" candidate="reuse-manifest"/>
```

Apply the same explicit selection to the other two SemanticTakes, which already contain their media
and alignment. Check `hypit plan` to confirm that the second render contains no new image, voice,
video or alignment requests. Inspect camera cuts and moving head placement in the result. Changing
only Caption or MG needs no repeat generation; changing the footage requires matching measurements.

## Prompt provenance

The author's `studio-prompts-incremental-2026-08-29` export contains the black-haired guest/Lamborghini
shared direction from August 28 at 09:54 and the focused guest/interviewer directions from 13:16–13:21.
The wording and reference counts match the supplied project images and the author's explanation.
This English adaptation keeps the casting, wardrobe and scene, removes an unnecessary phone prop
from the shared prompt, and uses compact gestures in Action. It does not import the earlier blonde
version or the later Porsche adaptation. The voice directions are newly authored; a fresh generation
will differ from the showcased footage.

`swap-host`, `swap-lang` and `swap-ride` are independent variants with their own authored measurements.
