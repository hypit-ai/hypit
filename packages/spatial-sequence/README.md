# @hypit/spatial-sequence

`@hypit/spatial-sequence` imports author-inspected spatial sequences and attaches them exactly to one film Timeline.

The package deliberately does not detect, track, smooth or interpolate subjects. Detection tools remain outside the Build. Authors inspect and edit their output, then keep the accepted sequence as an ordinary SVML Source:

```xml
<?svml using="@hypit/markup@1"?>
<svml>
  <import as="sequence" from="@hypit/spatial-sequence@1"/>
  <sequence:Regions id="heads">
{
  "clock": { "frameRate": { "numerator": 30, "denominator": 1 } },
  "frameCount": 2,
  "series": [
    { "id": "speaker-head", "regions": [[0.1, 0.2, 0.3, 0.4], null] }
  ]
}
  </sequence:Regions>
</svml>
```

The main Source imports that value and attaches it explicitly:

```xml
<sequence:TimelineRegions id="heads-on-film"
  document={tracking.heads}
  timeline={film-time.timeline}
  canvas={vertical.canvas}/>
```

`TimelineRegions` requires exact Clock and frame-count equality. It only resolves normalized final-program coordinates into Canvas pixels. It never trims, retimes, resamples or guesses missing observations. Consumers decide what each named series means and what a `null` frame does.
