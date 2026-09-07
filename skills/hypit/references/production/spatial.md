# Spatial layout

Read this when positioning or fitting media, text or a project component. Timing is explained in
[Script and time](../creation/script-and-time.md); it is independent of these coordinates. Read
[Compositing](../playbooks/craft/compositing.md#keep-physical-camera-and-editorial-space-distinct)
when deciding the relationship among the generated scene, camera framing and later visual layers;
this page owns their exact authoring geometry.

## Canvas, extent and destination

The Canvas gives the final image's pixel dimensions. An IntrinsicExtent gives a source image's
dimensions. A Frame gives the destination rectangle a consumer should occupy. A landscape image
can therefore retain its real extent while appearing in a portrait composition.

```svml
<import as="space" from="@hypit/spatial@1"/>

<space:Canvas id="canvas" width="1080" height="1920"/>
<space:Extent id="photo-size" width="1600" height="1200"/>
<space:Frame id="full" within={canvas}
  left="0%" top="0%" right="100%" bottom="100%"/>
<space:Frame id="content" within={full}
  left="6%" top="8%" right="94%" bottom="90%"/>
```

Coordinates start at the top left; x increases rightward and y downward. Frame edges are positions
from the parent's left/top, so `right="94%"` is the right edge at 94% of parent width. It leaves a
6% margin. A percentage on the x axis uses the parent width; on y it uses parent height. Nesting
changes that reference rectangle. Pixel lengths use `px`.

## Anchor an object or preserve its aspect

```svml
<space:AnchoredFrame id="label" within={content}
  x="50%" y="85%" width="80%" height="12%" anchor="center"/>
<space:AspectFrame id="photo-frame" within={content}
  x="100%" y="0%" width="45%" aspect={photo-size} anchor="top-right"/>
```

AnchoredFrame pins the named point of a sized rectangle to x/y in the parent. AspectFrame derives
one dimension from the other: specify width or height, plus an Extent or a ratio such as `4/3`.
An `offset-x` or `offset-y` is an additional pixel nudge. An anchored frame can extend beyond its
parent when that is the intended composition.

For text, `space:Point` supplies a pixel position and `space:Path` supplies authored Move/Line/curve
commands. [Fonts and text](fonts-and-text.md) shows which Typography placement consumes each.

## Fit the source into the Frame

Media Track and Speech Track consume fit choices through their appearance Recipes:

- **contain** keeps the complete image visible and may leave space around it;
- **cover** fills the destination and may crop the image;
- **stretch** changes the source proportions to occupy the destination.

Choose fitting with the subject and its surrounding composition in view. A Frame only places the
rectangle; it does not identify the face or choose an editorial crop. Query the selected component's
appearance vocabulary for its crop and alignment controls.

## Carry measured regions through the same geometry

RegionTimeline contains already measured boxes indexed by program frame. Its recipe uses normalized
`[x, y, width, height]` boxes and `null` for absent measurements, converted against the chosen Canvas.
Take-local measurements need their actual program offsets. Reframed or cropped footage needs the
corresponding spatial transform before its boxes can position text correctly.

[Caption tracking](../playbooks/craft/caption-tracking.md) explains producing and applying head
regions. In a new component's visual element tree, child positions are relative to their parent;
[component visuals](component-visuals.md) shows that final layout boundary.
