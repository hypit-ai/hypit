# `@hypit/browser-capture`

Browser material capture for websites and authored HTML. The package owns browser lifecycle and file
capture; the task owns navigation, page state and the material worth showing. It imports Puppeteer Core,
the upstream browser installer and Sharp directly and has no dependency on Hypit Core, Runtime,
Providers or graph types.

The Distribution supplies `hypit capture screenshot` and `hypit capture run`. See `hypit capture --help`
for command options. Puppeteer Core is a pinned Distribution dependency, so a plain video project
needs no browser-library installation or private `node_modules` import path.
`hypit capture install-browser` explicitly prepares the package's tested Chrome for Testing revision
in the browser cache (`PUPPETEER_CACHE_DIR`, or `~/.cache/puppeteer`).
`captureBrowserExecutablePath()` reports that path.
The package pins Chrome 153.0.8010.12 for the native recording API; `installCaptureBrowser()` uses
the upstream installer. Existing compatible browsers remain selectable through launch options.

## Library

`withCapture(options, task, onOutput?)` opens a browser, calls the async task, finishes open recordings
and closes the browser. It returns every completed `CaptureOutput`; `onOutput` receives each saved
file as it finishes. A task failure closes the browser while preserving earlier completed files.

`CaptureOptions` accepts:

- `launch`: ordinary Puppeteer `LaunchOptions`. The default viewport is 1280 × 720 at device scale 1;
  `defaultViewport` replaces it. `channel` selects an installed Chrome channel, `executablePath`
  selects a specific executable, and the default uses this package's tested Chrome for Testing.
  `PUPPETEER_CACHE_DIR` selects the cache directory.
- `timeoutMs`: operation and navigation timeout for the initial page. Omission keeps Puppeteer's
  default; `0` disables that timeout. Scripts can configure other pages themselves.
- `ffprobePath`: metadata reader for finished recordings; defaults to `ffprobe` on `PATH`.

The task receives the ordinary Puppeteer `browser` and `page`, plus:

```ts
await screenshot({ path: "assets/screen.png", fullPage: true });
await screenshot({ path: "assets/card.png", selector: "#card", omitBackground: true });
const recording = await record({ path: "assets/demo.mp4", fps: 30 });
// Perform this task's page interactions.
const video = await recording.stop();
```

`screenshot` accepts Puppeteer's `ScreenshotOptions` with required `path`, no `encoding`, and optional
`selector`. Selectors use Puppeteer syntax and wait for a visible element. Element, rectangular clip
and full-page capture are separate choices. Dimensions come from the saved bytes, including device
scale. PNG, JPEG and WebP follow Puppeteer's screenshot support.

`record` accepts Puppeteer's native `RecordOptions` with required `path`, excluding `overwrite`.
It uses `Page.record` on Chrome 153 or later. Chrome produces MP4; use an `.mp4` destination.
`audio: true` includes page audio; the default is picture only. `fps` / `frameRate` specify the maximum
capture rate, and `maxWidth` / `maxHeight` constrain output dimensions. These options pass through
to Puppeteer. The helper defaults those upper bounds to the viewport's device-pixel dimensions.
Chrome determines the recorded dimensions; device scale can enlarge a screenshot without enlarging
the recording. Use the returned `width` and `height` for placement. No FFmpeg encoder is involved;
`ffprobe` reads the completed file's actual dimensions,
duration, frame rate and audio presence. `stop()` is idempotent and waits for the file to finish.

Both functions accept an optional second `Page` argument for scripts using several pages. Returning
finishes recordings started through `record`. Ordinary Puppeteer methods remain available; files
written directly by a script are outside the helper's output list and overwrite behavior.

Outputs include absolute `path`, `kind`, `url`, `width`, `height`, `format`, plus `duration`, `frameRate`
and `hasAudio` for video when available. Helpers refuse overwrites; a failed capture removes only its
own incomplete output. The CLI prints completed paths as work progresses; `--json` returns the
complete output list as `hypit.capture@1`.

## Project scripts

A `.mjs` file exports a default async function receiving the session plus `args` and `log`.
`hypit capture run task.mjs -- <arguments>` forwards arguments after `--` unchanged. `log` writes
progress separately from JSON output. Optional `export const options` supplies `CaptureOptions`;
explicit CLI browser options override it. Relative output paths follow the working directory, while
`import.meta.url` can locate inputs beside the script. These are ordinary Node.js scripts with the
caller's permissions.

Waiting for lazy content, choosing a device profile, authentication and interacting with banners
belong in those scripts through normal Puppeteer APIs. A simple screenshot waits for page load;
`--wait-for` and `--wait-ms` add an authored readiness condition. The package does not interpret
websites or silently rewrite page content.

For a library import in an installed Distribution, use `hypit/browser-capture`. The workspace package
also exports the same API as `@hypit/browser-capture`.
