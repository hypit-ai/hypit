# `@hypit/caption-fine`

The official field-free fine-grained Caption Style family. It turns one SVS Recipe into a complete
`CaptionStyle` and lowers timed whole Atoms into one ordinary peer `VisualTrack`.

Fine owns Cue geometry, exact-stack typography, base/active glyph Paint, Cue/Pill Paint and layered
local motion. Glyph, underline and Pill activation are independent `off | current | trail` channels;
Pills may be isolated or one joined prefix across real browser line fragments. Ordinary single-Word
Atoms get per-word timing while a Dual Text Atom remains one honest indivisible activation unit. It
declares no planning fields and has no `important`, random sizing or inferred Word timestamps.

```xml
<fonts:Stack id="caption-fonts" family="inter" weight="600" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-sc" weight="600" style="normal"/>
</fonts:Stack>
<fine:Style id="primary" recipe={studio.caption.primary} font={caption-fonts}/>

<caption:Program id="captions" display={story.caption} default={primary}/>

<fine:Track
  id="captions-track"
  display={story.caption}
  correspondence={story.caption.correspondence}
  map={timing.map}
  program={captions}
  plan={caption-plan.plan}
  space={speech.space}
/>
```

The complete Recipe surface is orthogonal rather than a list of visual presets. For example:

```svs
caption.primary {
  cue-min-words: 2; cue-max-words: 6;
  stack-order: 70; x: 0.5; y: 0.88; width: 0.84;
  anchor-x: center; anchor-y: bottom; align: center; direction: ltr;
  size: 58; line-height: 1.05;
  fill: #FFFFFF; gradient-from: #FFFFFF; gradient-to: #93C5FD; gradient-angle: 120;
  stroke-color: #09090B; stroke-width: 2;
  shadow-color: #000000; shadow-opacity: 0.7; shadow-x: 0; shadow-y: 3; shadow-blur: 8;
  background: #00000000; padding: 0; radius: 0;

  karaoke: trail; karaoke-transition: wipe; active-fill: #FFD54A;
  active-box: current; active-box-continuity: isolated;
  active-box-background: #FFD54ACC; active-box-padding: 4 8; active-box-radius: 8;
  active-underline: current; active-underline-color: #FFFFFF;
  active-underline-thickness: 3; active-underline-offset: 5;

  cue-enter: spring; cue-enter-frames: 6;
  cue-exit: fade; cue-exit-frames: 4;
  active-response: pop; active-response-frames: 5; active-scale: 1.10;
}
```

Changing `active-box` to `trail` and `active-box-continuity` to `joined` produces a continuous
already-read Pill rather than one capsule per Atom. Text may remain `trail` while the Pill remains
`current`; no field or renderer fork is required.

One Track handles the default and ordered Style replacements. `font=` accepts either one exact
`FontArtifactRef` plus ordered Style `Fallback` children, or a reusable Media `FontStackRef` such as
the compact `fonts:Stack` above. Family, weight and style exist only on those exact font values;
the Recipe owns size and appearance. Fallbacks keep their own honest face metadata. Omitting the stack is invalid rather than an environment-font
prototype path. Fine never clips author text and intentionally has no `max-lines`.
Common Caption, Composition and Core know none of Fine's Recipe fields or layout policy.
