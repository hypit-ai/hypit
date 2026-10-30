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
`@example/chat-scene` component accepts Script Moments when used beside ordinary speaking Clips.

From the repository after installing its dependencies:

```bash
pnpm build:public-types
pnpm --filter @example/chat-scene build
node bin/hypit.mjs check examples/semantic-composition/chat.svml --project examples/semantic-composition
node bin/hypit.mjs build examples/semantic-composition/chat.svml --target final.video --project examples/semantic-composition --runtime examples/semantic-composition/hypit.runtime.json --follow
```

The Profile selects local HTML rasterization and FFmpeg. Its execution data lives in `.hypit/runtimes/local`;
`.hypit/runtime` is reserved for the project's Profile-selection file. Use the machine's prepared browser/media tools;
there is no hosted generation account in this example. The final Output is `final.video`. The same
The Source and selected Target can be opened in Studio, where its component lane and physical clock work without a Script lane.
For an independent project, install `@hypit/hypit`, `@hypit/fontsource` and
`@fontsource-variable/inter` in the project's ordinary `package.json`, copy the component into
`packages/`, replace its workspace dependency with the installed Hypit version, and build the
package normally. The project lockfile, rather than Hypit, fixes the exact font package version.
