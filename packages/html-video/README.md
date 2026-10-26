# @hypit/html-video

`@hypit/html-video` is the author-facing video assembly that selects Hypit's HTML
visual path:

```xml
<html:Video id="video" composition="main" />
```

Omitting delivery publishes a private standard BT.709 H.264/AAC MP4 requirement in the
author graph. `quality="draft|standard|high"` changes that explicit standard requirement;
advanced author packages can instead pass a `MediaDeliverySpec` through `delivery`.

The package contributes only the `html` author Surface and its orchestration
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
