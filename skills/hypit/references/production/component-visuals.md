# Rendering Component Visuals (`component-visuals.md`)

Read this while implementing an NLE component's rendered output. [Track & Component Authoring](track-authoring.md) owns the package registration, authoring, and Inspector contract; [Rendering](rendering.md) owns how `HtmlProgram` executes in Electron.

## How NLE Components Render (`hypit.nle-render`)

An NLE component renders through a `hypit.nle-render` contribution (`NleRenderContribution` from `@hypit/nle-delivery`). Its `render` function receives the Present's validated parameters, resolved `<media-input>` / `<value>` slots, layout box, and frame timing, and returns an `HtmlVisual` (from `@hypit/html-program`).

The NLE delivery compiler lowers all active Picture Presents—media clips, HTML components, effects, and nested compositions—into one self-contained `HtmlProgram` document that executes frame-accurately in Electron (for both NLE Studio preview and `hypit nle export`).

## Authoring a Frame-Addressed `HtmlVisual`

An `HtmlVisual` owns its local HTML structure, scoped CSS, optional usage-scoped artifacts (fonts, images, SVGs), and an optional client script with `setup` and frame-addressed `applyFrame` / `render` logic:

1. **Prepare stable structure once in setup**: locate DOM nodes, build SVG/Canvas geometry, and cache reusable objects.
2. **Compute complete state synchronously per frame**: given the requested local frame (or time), set the full DOM/CSS/Canvas state directly. Never assume frames arrive sequentially—NLE Studio scrubbing and range renders seek directly to arbitrary frames.
3. **Wait for async resources cleanly**: if an image, font, or canvas texture needs asynchronous readiness on a frame, register it via `hypit-frame.detail.waitUntil(promise)` so the capture backend waits until paint is ready.
4. **Scope SVG/HTML IDs**: multiple instances of the same component share one document ID space even when CSS is scoped. Derive SVG mask, gradient, and filter IDs from the instance's root ID in setup and update all `url(#...)` references accordingly.

## Media Inputs, Fonts, and Assets

- **Video and image inputs**: declare media dependencies through `<media-input name="..." path="./media/....media.json"/>` on the `<present>` in SVML. Timed video inputs enter through compiler-owned Picture inputs with exact frame-addressed sampling, avoiding fragile browser `<video>` seeking.
- **Fonts**: reference exact font files (`.woff2`, `.ttf`, `.otf`) or CSS font stacks declared in your component parameters ([Fonts and Text](fonts-and-text.md)).
- **Extra static artifacts**: declare images, fonts, or shaders in the visual's artifacts list so the compiler bundles them into the `HtmlProgram` and serves them cleanly during both Studio preview and headless export.

## Choosing CSS, SVG, Canvas, or WebGL

- Use **HTML + CSS** for typography, cards, editorial layouts, rounded frames, shadows, and backdrop filters.
- Use **SVG** for crisp vector diagrams, animated strokes, charts, and geometric masks.
- Use **2D Canvas / WebGL** for particle systems, custom shaders, or deforming textured meshes—still driven deterministically by the requested frame number.
- Keep visual implementation details inside the component package; expose only meaningful creative choices in `<parameters>`.
