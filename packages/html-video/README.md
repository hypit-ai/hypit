# @hypit/html-video

The package-owned `video` and `frame` declarations consume a completed Composition and Timeline.
`Video` authors a delivery requirement and optional frame range; `Frame` selects one frame for PNG output.
Renderer and Endpoint selection remain downstream Build concerns.

`@hypit/html-video` is the author-facing video assembly that selects Hypit's HTML
visual path:

```xml
<html:Video id="video" composition={main.composition}/>
```

Omitting delivery publishes a private standard BT.709 H.264/AAC MP4 requirement in the
author graph. `quality="draft|standard|high"` changes that explicit standard requirement;
advanced author packages can instead pass a `MediaDeliverySpec` through `delivery`.

The author contract exposes one finished-video family: BT.709 H.264/AAC MP4.

The video assembly Fragment:

1. compiles the selected Composition and Timeline with `@hypit/html-program`;
2. projects the one media delivery requirement into the visual requirement and requests a
   matching `TimelineVisual` through `rasterize-visual`;
3. prepares Timeline audio through the media path;
4. verifies and muxes the two frame-exact products under the same delivery requirement into
   the Film artifact.

`@hypit/html-program` owns the HTML Program ABI and rasterization Capabilities. Providers execute
frame capture and source decoding. This package assembles the author-facing render graph.

## Single-frame output

```xml
<html:Frame id="still" composition={scene.composition} at-frame="45"/>
```

`still.image` is a retained PNG Blob at the Composition's canvas size. `at-frame` is a
zero-based integer on that Composition's clock and must fall within its duration. The output
uses full-range sRGB, 8-bit RGB with an opaque black matte. The graph compiles the composed
picture, requests one frame through `rasterize-frames`, and projects its image Artifact.

Build `still.image` and export its Result to save a stable picture for subsequent editing.
