# Opening system

Project components for an explanation-led video. They share the film's Timeline and Canvas but own independent visual behavior. Connect each visual output to Film explicitly. They produce no audio.

- **Title**: opening clock and a two-level headline in a pink window card. Existing presenter footage continues beneath it at its original brightness. Its outer Window ends on the authored “开始” Moment in this production. `seconds` is the promise printed on the title, not the estimated duration of the film.
- **Timer**: a persistent topic plaque, pennant and dot-matrix timer. Its Window's first frame starts the countdown; zero is followed by coral overtime counting upward. `title`, `subtitle`, `seconds`, `flag-color`, `x`, `y`, `width`, `flag-amplitude`, `flag-speed` and `entrance-frames` are author choices. It does not infer pauses from speech or stop when performance media is absent.
- **Flag**: an independent low-angle pixel flag. It uses the same deterministic pixel texture treatment as Timer, with its own Window, placement, dimensions and color. No relationship to the opposition boards is inferred. The current Source places it below captions during the first-road explanation. `flag-amplitude` and `flag-speed` keep the folds slow and the logo readable.
- **Stage**: independent images or prepared videos in a clear foreground viewport, with the same material enlarged, blurred and dimmed behind it. Each Item has its own projected Window. Foreground and background share exact video sampling. An image is held during its Window. Later declared Items paint above earlier ones if they overlap. Empty intervals stay empty. `fit="contain"` preserves the supplied screenshot; `cover` fills and crops. `x`, `y`, `width`, `height` are fractions of Canvas dimensions. `blur` is specified at a reference width of 1080 and scales with Canvas width; `brightness`, `zoom` and `radius` finish the treatment. Film places the completed Track.

The visual components and Stage Items accept already declared absolute Windows through `during`.
Domain projection and direct clock declarations happen upstream; drawing code consumes only resolved
Windows. Direct time is useful for a rapid montage, while a projected Window can follow a Segment.

```svml
<import as="gfx" from="@explainer/opening-system@1"/>
<gfx:Title id="opening-title" timeline={program.timeline} within={canvas.bounds} font={display-font}
  during={opening-title-window}
  title="Hypit" subtitle="一分钟了解" seconds="60"/>
<gfx:Timer id="series-timer" timeline={program.timeline} within={canvas.bounds} font={display-font} logo={flag-logo}
  during={series-timer-window} title="Hypit"/>
<gfx:Stage id="coverage" timeline={program.timeline} within={canvas.bounds} during={example}>
  <gfx:Item id="demo" video={prepared-demo.media} during={example}/>
</gfx:Stage>
```

`video` accepts `PreparedMedia`, not a raw video Blob. The component passes the selected source and exact sampling relation to the terminal visual program. `source-start-frame` optionally selects its starting source frame; native playback preserves the source cadence. A requested Window longer than the remaining video produces an actionable error rather than hidden looping. A Stage only contributes picture: include wanted audio separately.

The current 1.5-second four-image montage uses 5 / 4 / 5 / 31 frames at 30fps, boundaries 0 / 5 / 9 / 14 / 45. The supplied images live in the production's assets, not in this package. The exact font is also supplied by Source.

`src/activation.js` owns Manifest, Surface and finite graph wiring. `src/render.js` owns visuals and frame-seekable HTML visuals. The package uses Hypit's public authoring and domain APIs; it changes no framework, Studio or Core code. `src/studio.js` contributes the public Studio Companion facet. Defaults live once in `src/definition.js`, shared by Surface decoding and the Inspector. Title, Timer and Veil expose their own text, position and appearance choices. Stage has a parent for shared framing and slow-push settings, with independently timed component-local Items in its attached lane. Presenter owns its Source/Use vocabulary because it is the one continuing creative role that needs it; Visual Track itself contains only Clips. The Inspector uses Studio’s standard controls and writes existing author attributes; no Studio or Core component dispatch is added.

The actual montage and semantic title/timer bindings live in `authors/main.svml`. Earlier component studies are archived privately.

The pennant and floor flag use a small Canvas raster with stepped diagonal folds and discrete shaded bands. `src/flag-cloth.js` retains its filename, but the current renderer uses no 3D engine or cloth simulation. Frame time determines the low-cadence movement, and nearest-neighbor scaling preserves the pixels. The supplied logo remains readable; amplitude and speed are author choices. The pennant paints in front of its backplate. Brand artwork is supplied by Source.

The Title uses the shared pink window treatment described below.

Stage `push-rate` is the foreground scale increase per second, default zero. For example, `push-rate="0.025"` increases scale by 2.5% per second while the viewport stays fixed. Each Item starts at native scale; its own original Window determines animation age even when the Stage clips that Window. The production enables this on the four-image montage; short flashes therefore move slightly, while a longer hold develops a visible slow push.


## Texture Veil

`gfx:Veil` contributes an independent patterned overlay. Film places its completed Track above the background picture and below the text, diagram, presenter window and chrome it wants to keep clear. It neither reads sibling tracks nor edits their media. Use the shared temporal attributes, `timeline` and `canvas`; it needs no font or asset.

`pattern` selects `mesh`, `dots`, or `hatch`; `cell` sets motif size at 1080px Canvas width; `amount` sets motif opacity. `tint` and `shade` describe the translucent color wash independently. `fade-frames` shapes its short entrance/exit; zero gives an immediate boundary. The pattern remains stationary during the hold. The defaults are a starting treatment, not a requirement to apply the overlay to every picture.

The active Source shows the selected texture treatment.

### Opening pullback as a Presenter Use

`<gfx:Pullback id="opening-pullback" scale="1.5"/>` defines one project-owned Presenter treatment. Declare its absolute Window once, then apply it with `<gfx:Use during={opening-pullback-window} style={opening-pullback}/>` inside `<gfx:Presenter>`, after the broad full-frame Use. That named Window drives a quartic ease-out from 1.5× to 1×, centered at 50%/35%; footage keeps its source clock. At the end it meets ordinary full-frame geometry. Titles and other contributions stay independent. This changes framing, not playback speed or generated material.

## Portrait inset
`<gfx:PortraitInset id="host-small" frame={host-inset}/>` is a project Presenter treatment for a circular viewport with a closer inner crop. It receives the Presenter component's explicit Sources, clips each interval, and preserves playback from each Source Window. The external Frame controls position and size; this work uses 330px. An inner 1.23× magnification, anchored at 50%/28%, increases face presence independently from viewport size. Its vivid-pink rim, dark outline and solid offset shadow match the supplied pink interface reference. This is independent from full-frame and Reframe Uses.

The spoken opening Title is currently a pale-pink window card with a dark outline, a vivid-pink headline and a solid lower-right shadow. Timer plaque/readout follow the same palette while preserving the animated pixel flag and existing time behavior.

`presenter.js` owns explicit Source collection, Use precedence and Presenter lowering. A Presenter exposes `base` and `overlay` Visual Tracks so Film can place full-frame performance below project scenes and inset or upper-frame treatments above them. `PresenterFrame` defaults to `plane="base"`; declare `plane="overlay"` for an authored foreground frame. Use precedence remains global across both outputs, so a later hidden or transitional Use still replaces the earlier treatment once. Pullback belongs to the base plane; Reframe, PortraitTransition and PortraitInset belong to the overlay plane. Their child video intervals come solely from each source's sampling Map rather than a second component-local visibility schedule. These treatments are project behavior, not generic Visual Track modes. The private `@explainer/visual-language` dependency owns the current pink palette; each treatment owns its framing behavior.
