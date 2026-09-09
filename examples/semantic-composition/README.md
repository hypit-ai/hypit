# Semantic composition

`packages/responsive-explainer` is an ordinary project component. Its video viewport moves from
full screen into a side portrait while a diagram appears in the space it releases. The same prepared
video continues playing. A projected Moment triggers the layout change; an independently projected
Window defines the scene's lifetime. Captions and other independent contributions can remain peers.

The package demonstrates HTML, CSS, SVG and frame-driven JavaScript inside one VisualTrack Present,
with typed child video sampling and exact-font text. It uses public `@hypit/hypit/*` imports. No component
name is registered in Core or in the renderer.

Copy the package into a video's `packages/`, select the installed Hypit version for its development
dependency, build it and declare it in the project's ordinary package configuration. The package
README shows its Source use and explains the timing and material boundaries.

## Authored chat animation

`chat.svml` is an eight-second composition drawn entirely in a project component. It needs no Script,
WhisperX, image generation or source video. Four messages arrive on authored times; the same
`@example/chat-scene` component accepts Script Moments when used beside a speaking performance.

From the repository after installing its dependencies:

```bash
pnpm build:public-types
pnpm --filter @example/chat-scene build
node bin/hypit.mjs check examples/semantic-composition/chat.svml --workspace examples/semantic-composition
node bin/hypit.mjs build examples/semantic-composition/chat.svrun --workspace examples/semantic-composition --runtime examples/semantic-composition/hypit.runtime.json --follow
```

The Profile selects local HyperFrames and FFmpeg. Use the machine's prepared browser/media tools;
there is no hosted generation account in this example. The final Output is `final.video`. The same
Run can be opened in Studio, where its component lane and physical clock work without a Script lane.
For an independent project, install `@hypit/hypit`, copy the component into `packages/`, replace its workspace
dependency with the installed Hypit version, and build the package normally.
