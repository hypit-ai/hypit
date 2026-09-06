# Caption above a moving head

Use this when following a person's head adds character or keeps Caption clear of the image. The
street-interview example uses external face measurements, authored head regions and Fine's existing
placement input. The detector measures evidence; the author decides the Caption design.

## Produce the footage that will actually be measured

Build the speaking media and an ordinary composition first, using fixed Caption if useful. Keep the
Run's exact media and SemanticTake outputs available for reuse. A final-video Target can produce
those dependencies.

Measure footage whose timing and framing match the next composition. An existing rendered result
can work when its graphics do not obstruct detection. A clean picture pass is useful when they do;
it can reuse the same normalized Takes and layout. If measuring individual Takes instead, use their
actual edited lengths and project their local frame positions into the final program. Do not measure
an original raw file and silently assume its timestamps survive later trim, speed or crop changes.

## Obtain useful boxes outside Build

The worked method used Google Video Intelligence. Its face feature can return bounding boxes when
`FACE_DETECTION` is requested with `includeBoundingBoxes` enabled; facial attributes are unnecessary
for this placement task. Use the installed tool or the provider's
[face-detection example](https://docs.cloud.google.com/video-intelligence/docs/samples/video-detect-faces)
for actual invocation and existing authorization for any paid request. Another suitable detector or
manual measurement can supply the same authored data.

GVI's timestamped boxes are observations, not Script Roles or ready-to-use Hypit head tracks. Its
[response schema](https://docs.cloud.google.com/video-intelligence/docs/reference/rest/v1/AnnotateVideoResponse#TimestampedObject)
expresses `timeOffset` relative to the input video and the rectangle as `normalizedBoundingBox`.
Use all relevant observations, not just the first box printed by a sample program.

Associate each visible person with the intended Role by inspecting the footage. A detection id is
not a global person identity, and a cut can create another track for the same guest. In a shared
shot, selecting the largest face alone can attach the guest's Caption to the interviewer.

## Author one head region per final program frame

Transform the useful observations into ordinary project data, with these decisions explicit:

- **Clock:** resample onto the actual ProgramSpace frame rate. For concatenated normalized Takes,
  the local-to-global offset is the sum of preceding Takes' actual frame counts, not their requested
  generation durations. Final-video measurements are already on the global timeline.
- **Geometry:** convert detector edges to `[x, y, width, height]` using width `right - left` and height
  `bottom - top`. If measurement used another resolution, crop, inset or split-screen panel, map the
  box through that actual placement before normalizing it to the final Canvas.
- **Head extent:** expand the face region to include the relevant hair, hat and desired clearance.
  For face `(x,y,w,h)`, authored padding fractions can produce
  `(x - pL*w, y - pT*h, w*(1+pL+pR), h*(1+pT+pB))`. Choose those fractions from the visible head;
  there is no universal face-to-head multiplier. Keep the resulting region valid inside the Canvas.
- **Missing observations:** make any interpolation or smoothing an explicit external preparation
  choice within a continuous shot and the same person. Inspect it, stop at cuts and occlusion, and
  write `null` when no usable region exists. Fine does not invent a missing box.

The final array has exactly one box or `null` per program frame, including frames where the Role is
absent. Caption already follows the Role's spoken Cues; the region track supplies position, not a
second speech detector. Additional visibility choices, such as hiding that Role's Caption under
B-roll, can be authored with null regions or the appropriate Caption selection behavior.

For example, this is a three-frame data-shape illustration, not a ready timeline for a real video:

```svs
heads.default {
  frame-count: 3;
  tracks: [
    {"id":"GUEST","regions":[[0.12,0.09,0.20,0.26],null,[0.13,0.10,0.20,0.26]]}
  ];
}
```

Keep the actual array in a project Recipe such as `tracking.svs`. A small project script can make
these transformations reproducible when needed, taking explicit media, clock and geometry inputs.

## Connect the measured placement and render again

```svml
<space:RegionTimeline id="heads" within={vertical} recipe={tracking.heads.default}/>
<caption-fine:Track id="captions" document={story.caption}
  semantic={speech.semantic} program={caption-program} regions={heads}/>
```

The RegionTimeline's ids match Script Roles. Fine places a single-Role Cue at that region's top
center; `anchor-x: center` and `anchor-y: bottom` put the Cue above it. The Style still owns its width,
font and motion. A named Role track with `null` hides its Cue on that frame; a Role with no region
track uses its ordinary Style position. This allows tracked guest Caption and fixed interviewer
Caption together. The `@hypit/spatial` and `@hypit/caption-fine` READMEs own the exact data behavior.

Select the existing media and alignment outputs in the Run as described in
[production authoring](../../production/authoring.md#reuse-produced-work-explicitly), then inspect
`hypit plan` before rebuilding. A Caption placement change should reuse the paid Takes. Review
representative frames, camera cuts and the moving result for jitter, wrong-person jumps, hair/hat
clearance, top-edge clipping and collisions with icons. Local frame-range rendering makes these
iterations cheap. If media timing or placement changes, update the affected measurements rather
than reusing stale coordinates.
