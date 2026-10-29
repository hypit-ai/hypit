# @hypit/html-video

The package-owned `video` declaration consumes a completed Composition and Timeline, then authors an
explicit delivery requirement and optional frame range. Markup supplies only the `Video` spelling.
Renderer and Endpoint selection remain downstream Build concerns, and the package has no runtime
dependency on Temporal or its Markup helpers.

`@hypit/html-video` is the author-facing video assembly that selects Hypit's HTML
visual path:

```xml
<html:Video id="video" composition={main.composition}/>
```

Omitting delivery publishes a private standard BT.709 H.264/AAC MP4 requirement in the
author graph. `quality="draft|standard|high"` changes that explicit standard requirement;
advanced author packages can instead pass a `MediaDeliverySpec` through `delivery`.

HDR10 is an ordinary explicit delivery value, not a renderer switch:

```svml
<media:HdrStaticMetadata id="hdr-metadata"
  red-x="0.708" red-y="0.292" green-x="0.170" green-y="0.797"
  blue-x="0.131" blue-y="0.046" white-x="0.3127" white-y="0.3290"
  min-luminance-nits="0.005" max-luminance-nits="1000"
  max-content-light-nits="1000" max-frame-average-light-nits="400"/>
<media:Delivery id="hdr-delivery" profile="hdr10-hevc" quality="high"
  hdr-static-metadata={hdr-metadata}/>
<html:Video id="video" composition={main.composition}
  delivery={hdr-delivery}/>
```

The source profile `bt2100-pq10`, the Composition's linear working picture and this HDR10 delivery
remain three independent declarations. The Delivery metadata is author-owned; no Provider scans
the work to guess it.

The package contributes only the `html` author declaration and its orchestration
Fragment. It:

1. compiles the selected Composition and Timeline with `@hypit/html-program`;
2. projects the one media delivery requirement into the visual requirement and requests a
   matching `TimelineVisual` through `rasterize-visual`;
3. prepares Timeline audio through the media path;
4. verifies and muxes the two frame-exact products under the same delivery requirement into
   the Film artifact.

It does not own the `HtmlProgram` ABI, browser execution, frame capture, source
decoding, or the rasterization Capabilities. Consequently a local Provider,
Studio snapshot, or another executor never depends on this author package.

The name describes the selected representation and product assembly, not an
implementation command. There is intentionally no `<render:Video>` compatibility
alias: `render` confuses the desired video with one possible execution method.
