# `@project/manim-showcase`

A project-local Author Package for a presenter-led portrait composition with three independent
Manim video cards. The package is an ordinary deterministic component: it adds no Provider,
Runtime Endpoint, generation request or Python execution to a Hypit Build.

The Surface accepts one presenter video, three opaque Manim MP4s, one Timeline and Canvas, plus
four Script Moments:

```svml
<manim:Scene id="showcase" timeline={program.timeline} canvas={canvas}
  host={host-source} math={math-source} ml={ml-source} physics={physics-source}
  first={story.moment.first} next={story.moment.next}
  finally={story.moment.finally} these={story.moment.these}
  during="program"/>
```

`first`, `next`, `finally` and `these` are semantic inputs projected to the production Timeline.
The renderer consumes their resolved `TemporalInstant` values and never parses Script text or
manufactures fixed cue times.

The three Python Manim scenes own their internal animation. The Hypit component takes the shared
Timeline frame rate as its sampling timebase and owns only the ordinary media-track concerns around
them: source sampling, card position, scale, opacity,
brightness, stacking and canvas containment. The MP4s remain separate opaque H.264 `yuv420p`
inputs; they must be rendered and inspected before entering the Author Source.

The component cannot read video metadata from a `BlobRef`. Before authoring, `ffprobe` must confirm
that each Manim source has the expected frame rate for the shared Timeline; Normalize and media
inspection remain the authority for admitted file facts.

Build the package from this production directory:

```sh
npm run build --prefix packages/manim-showcase
```

The component follows the public `@hypit/hypit/*` Author Package interfaces and lowers to one
ordinary `VisualTrack` for the Film.

## Runtime and Studio

The production root supplies `hypit.runtime.json`, binding local media and HyperFrames providers
for the render Run. Install the project package from the production root with:

```sh
npm ci --ignore-scripts
npm run build --prefix packages/manim-showcase
```

The package activation also registers a Studio Track Companion for the real `scene` Surface. It
identifies the coordinated presenter-and-Manim scene as one editable VisualTrack while leaving
the three MP4 inputs and the Python scene sources in their existing authoring boundaries. Studio
may adjust the owning Source after the package is rebuilt and the Studio process is restarted.
