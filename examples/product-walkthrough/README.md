# Product walkthrough

Records a product interface from a step plan and presents it as a demonstration with a following
camera, cursor and click ripples. `demo/app.html` is a small fictional product so the example needs
no network, account or credentials.

```
demo/app.html, demo/plan.json      the product and the walkthrough to record
captures/board/                    the recorded take: recording.mp4, steps.json, steps.svs, screenshots/
packages/screen-walkthrough        project component drawing the take
walkthrough.svml / .svrun          the composition and its Run
```

## Record the take

```bash
hypit capture plan demo/plan.json --to captures/board-take2 --viewport 1280x800
```

The take in `captures/board` is committed so the composition builds without a browser. A new take
goes to a new directory; read its `steps.json` and screenshots, then point the Source at it.
Relative paths in the plan resolve from the plan file. The recording is re-timed to a constant
30 fps, which media normalization requires.

## Build the video

From the repository after installing its dependencies:

```bash
pnpm --filter @example/screen-walkthrough build
node bin/hypit.mjs check examples/product-walkthrough/walkthrough.svml --project examples/product-walkthrough
node bin/hypit.mjs build examples/product-walkthrough/walkthrough.svrun --project examples/product-walkthrough \
  --runtime examples/product-walkthrough/hypit.runtime.json --follow
```

The Profile uses local FFmpeg and HTML rasterization. Narration, Caption and music are ordinary peer
contributions; to make a camera move answer a spoken phrase, place the recording's `source-window`
so the recorded action lands on that word. Cutting the file would invalidate the recorded step
times; record a shorter plan instead.
