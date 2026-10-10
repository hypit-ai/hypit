# `@project/manim-showcase`

A project-local Author Package for a presenter-led portrait composition with three independent
Manim video cards. The package is an ordinary deterministic component: it adds no Provider,
Runtime Endpoint, generation request or Python execution to a Hypit Build.

The Surface accepts three `SynchronizedMedia` values from Normalize, one Timeline and Canvas,
plus four resolved `TemporalInstant` references. The
presenter is supplied separately by the production's standard visual and audio clips over that Timeline:

```svml
<manim:Scene id="showcase" timeline={speech.timeline} canvas={assets.canvas.canvas}
  math={math-media.media} ml={ml-media.media} physics={physics-media.media}
  first={first-cue} next={next-cue}
  finally={finally-cue} these={these-cue}
  during={speech.window}/>
```

`first`, `next`, `finally` and `these` are Instants projected upstream from the Script Moments to the production Timeline.
The renderer consumes their resolved `TemporalInstant` values and never parses Script text or
manufactures fixed cue times.

The [project README](../../README.md) owns the production-wide Manim boundary and handoff. This package only documents
its Surface, semantic inputs and the resulting VisualTrack; normalization, media inspection and
source provenance remain in the Author Graph and production README.

Build the package from this production directory:

```sh
npm run build --prefix packages/manim-showcase
```

The component follows the public `@hypit/hypit/*` Author Package interfaces and lowers to one
ordinary `VisualTrack` for the Film.

## Runtime and Studio

Follow the [project startup instructions](../../README.md#start-here) to prepare packages and
configure the production Runtime.

The package activation also registers a Studio Track Companion for the real `scene` Surface. It
identifies the coordinated Manim card overlay as one editable VisualTrack while leaving the presenter
clips, three MP4 inputs and Python scene sources in their existing authoring boundaries.
Studio may adjust the owning Source after the package is rebuilt and the Studio process is restarted.
