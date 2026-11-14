# Terminal mix

This production demonstrates one real Media + HTML + Manim + Blender NLE composition with an external Picture
Operator and an independently selected composition root.

- `media/backdrop/backdrop.media.json` is an ordinary accepted Media Asset.
- `packages/terminal-mix/` owns three project Components: one HTML label, one live Manim orbit and one live Blender
  object.
- `terminal-mix.nle.json` owns placement, duration and draw order.
- `exports/` receives viewing deliverables and is not an authored input.

The Manim and Blender components each publish a normal finite AVIR `ProgramSource`, an explicit external Picture
Terminal projection and a matching `hypit.nle-local-picture-terminal` execution facet. Manim owns sequential
evaluation; Blender owns frame-independent range evaluation. The NLE application never switches on either opaque
programme format.

From this project directory:

```text
node --import tsx -e "import('../../packages/audiovisual-manim-local/src/index.ts').then(m => m.prepareManimRuntime())"
pnpm --filter @example/terminal-mix build
node ../../bin/hypit.mjs nle export terminal-mix.nle.json --to exports/terminal-mix.mp4 \
  --picture-target gpu-composition \
  --chrome-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --ffmpeg-path /opt/homebrew/bin/ffmpeg --ffprobe-path /opt/homebrew/bin/ffprobe --workers 1
```

The final Picture Filter remains owned by its HTML Operator Terminal, publishes one transient Picture Product and is
then consumed by GPU Composition. The NLE document does not change with this invocation choice; omit
`--picture-target gpu-composition` to close the same authored programme through the HTML root.

Prepare the locked Manim environment and install Blender explicitly before the first export. Ordinary export never
installs either runtime. The checked proof used Blender 5.3, Manim 0.22.1, Chromium and FFmpeg to produce one 60-frame
H.264/AAC MP4; the Manim and Blender WebM products remained request-private intermediates rather than project Media.
