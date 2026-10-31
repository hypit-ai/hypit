# Inspect exact pictures and motion

Use `hypit snapshot` when an already materialized HTML Programme is the evidence for the current
production. Use media frames or grids for a source video or encoded Result. Single full-size frames
establish typography, edges and geometry; dense grids establish movement and handoffs. Use a focused
render when the question also requires sound or the composition has not produced inspectable HTML.

## Capture an existing HTML Programme

An HTML renderer document can be inspected directly:

```bash
hypit snapshot ./picture/index.html \
  --at-frame 240 --to evidence/comparison-detail

hypit snapshot ./picture/index.html \
  --at-frame 240,255,269 --grid 3x1 --cell 480 \
  --to evidence/comparison-states

hypit snapshot ./picture/index.html \
  --start-frame 240 --end-frame-exclusive 270 --step-frames 1 \
  --grid 4x3 --cell 480 --to evidence/comparison-motion
```

The HTML carries its compiled frame clock and frame-sampling declarations. Its directly referenced
media and fonts travel with the request; scripts and styles are inline. An HTML URL is accepted too.
Snapshot sends one immediate frame-rasterization request. It does not create a Build, generate
material or encode video.

Use `--runtime <profile>` and `--project <project>` when the command needs an explicit selection.
If several Endpoints offer frame capture, bind `@hypit/html-program@1#rasterize-frames` in the Profile.
Browser preparation remains with that Provider: see
[local tools](../environment/local-tools.md#prepare-the-local-rendering-browser).

## Read frames at the scale the question needs

- `--at-frame` chooses one frame or a strictly increasing list of frames.
- A range includes `--start-frame` and excludes `--end-frame-exclusive`. `--step-frames 1` retains
  every frame. Frame indices start at zero on that HTML Programme clock.
- Every selected frame is saved as a full-size PNG. Open one for typography, edges and geometry.
- `--grid columnsxrows` adds paginated contact sheets. `--cell` chooses the width of each picture;
  labels give the original frame index and time. The full-size PNGs remain available.
- `--json` reports output paths and frame positions for subsequent inspection.

Locate meaningful events through Script, Timeline or authored clock values. Widen the interval to
understand a handoff, inspect every frame to understand a movement, and enlarge the image to judge
small detail. Frame selection observes the authored timing relationship; it does not change it.

## Inspect existing source or delivered media

For an existing source video or encoded Result, use the media commands. Native-frame extraction
decodes each chosen interval once and retains the source's actual timestamps, including variable
frame rates:

```bash
hypit media grid reference.mp4 --pages --start 8 --end 9 --every-frame \
  --columns 4 --rows 3 --cell 480 --to evidence/reference-motion
```

`media frames --every-frame` saves individual images. `media grid --pages --ranges ranges.json
--every-frame` follows several selected intervals. `--transcript` adds the words around each actual
frame. [Reference understanding](../creation/reference-video.md) connects these views to coarse and
fine observation.

## After a composition change

Keep consumers referencing the intended project material. If inspectable HTML already exists for the
changed composition, capture the affected states and handoffs. Otherwise use a
[range render](rendering.md#choose-a-render-interval-in-frames) for the smallest interval that can
answer the question, especially when motion and sound matter together. Carry discoveries back to
the owning Source, component or Treatment, then render and inspect the full file for final delivery.
