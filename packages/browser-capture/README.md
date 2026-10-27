# `@hypit/browser-capture`

Browser material capture for websites and authored HTML. The package owns browser lifecycle and file
capture; the task owns navigation, page state and the material worth showing. It imports Puppeteer Core,
the upstream browser installer and Sharp directly. Its library does not create a Source Graph, Build,
Result or Runtime; completed recordings reuse `@hypit/media-local`'s explicit file probe instead of
forking a second ffprobe parser. The package's CLI contribution uses the installed Hypit CLI host.

This package also owns the `@hypit/browser-capture/cli` contribution used by the Distribution for
`hypit capture screenshot`, `hypit capture run`, `hypit capture plan` and `hypit capture login`. See `hypit capture --help`
for command options. Puppeteer Core is a pinned Distribution dependency, so a plain video project
needs no browser-library installation or private `node_modules` import path.
`hypit capture install-browser` explicitly prepares the package's tested Chrome for Testing revision
in the browser cache (`PUPPETEER_CACHE_DIR`, or `~/.cache/puppeteer`).
`captureBrowserExecutablePath()` reports that path.
The recommended version is declared in this package's `package.json` under `hypit.captureBrowser`.
`installCaptureBrowser()` uses the upstream installer. Both it and `captureBrowserExecutablePath()`
accept `{ version, cacheDirectory, downloadBaseUrl }`; capture accepts the same selection as
`options.browser`. CLI equivalents are `--browser-version`, `--browser-cache` and
`--browser-download-base-url`. A custom download base must serve the upstream archive layout;
there is no retry against an unselected source. Use the same version and cache when preparing and
capturing. Capture never installs a browser, and a missing selected executable is an error. Existing compatible browsers remain selectable through launch options.

## Library

`withCapture(options, task, onOutput?)` opens a browser, calls the async task, finishes open recordings
and closes the browser. It returns every completed `CaptureOutput`; `onOutput` receives each saved
file as it finishes. A task failure closes the browser while preserving earlier completed files.

`CaptureOptions` accepts:

- `launch`: ordinary Puppeteer `LaunchOptions`. The default viewport is 1280 × 720 at device scale 1;
  `defaultViewport` replaces it. `channel` selects an installed Chrome channel, `executablePath`
  selects a specific executable, and the default uses this package's tested Chrome for Testing.
  `PUPPETEER_CACHE_DIR` selects the cache directory.
- `browser`: managed browser version/cache selection. It cannot be combined with an explicit
  `launch.channel` or `launch.executablePath`.
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
the `media-local` file probe invokes the selected `ffprobe` to read the completed file's actual
dimensions, duration, frame rate and audio presence. Browser Capture does not keep a second media
probe parser. `stop()` is idempotent and waits for the file to finish.

Both functions accept an optional second `Page` argument for scripts using several pages. Returning
finishes recordings started through `record`. Ordinary Puppeteer methods remain available; files
written directly by a script are outside the helper's output list and overwrite behavior.

Outputs include absolute `path`, `kind`, `url`, `width`, `height`, `format`, plus `duration`, `frameRate`
and `hasAudio` for video when available. Helpers refuse overwrites; a failed capture removes only its
own incomplete output. The CLI prints completed paths as work progresses; `--json` returns the
complete output list as `hypit.capture@1`.

## Plan replay

`runCapturePlan(session, plan, options)` replays a JSON step plan in the session's page while
recording it, and `hypit capture plan <plan.json> --to <directory>` is the CLI form.
`parseCapturePlan` validates a plan before a browser opens. The start page (and optional
`startUntil` selector, with `startRetries`) loads before the recording starts. Steps are `goto`,
`wait`, `assert`, `dismiss`, `hover`, `click`, `dblclick`, `fill`, `type`, `press`, `scroll`, `pause`,
`screenshot`, `drag` and `upload`. Targets are Puppeteer selectors, and `planSelector` translates
`text=` and `role=…[name='…']` shorthands. A target must resolve to exactly one visible element
unless the step chooses an `index`; `asset: { attribute, value }` additionally checks an exact
identity. `optional: true` skips a step whose target never appears.

The output directory must be new or empty. It receives `recording.mp4`, `screenshots/` and
`steps.json` (`hypit.capture-plan@1`): per step `start`/`end` seconds measured from the recording's
start, the target `box` and `pointer` in CSS pixels, any checkpoint screenshot and `skipped` reason,
plus the viewport and scale, the recording's probed metadata, an optional login check and `failed`.
The take stops at the first failed step, keeps the partial recording and saves
`screenshots/failed.png`; the CLI exits non-zero. `cursor: "none"` (default) leaves footage clean for
a composition-drawn cursor; `cursor: "page"` draws one into the page.

Clicks whose selector or element text names a paid or destructive operation are refused unless the
step has `authorized: true`. `loginCheck` fetches the product's own session endpoint from inside the
page and records only an account label.

## Login state

`CaptureOptions.storageState` imports a `{ cookies, origins }` file (Playwright's storageState
shape): cookies are set on launch and each origin's localStorage is restored before page scripts
run. `captureProfileDirectory(name)` names a persistent profile outside projects
(`~/.cache/hypit/capture-profiles/<name>`, or `HYPIT_CAPTURE_PROFILES`); the CLI's `--profile` uses it
as `userDataDir`. `openCaptureLogin(options, url)` and `hypit capture login <url> --profile <name>`
open a visible browser on that profile for a person to log in, resolving when the window closes.

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

Library consumers import `@hypit/browser-capture` directly. The root Distribution selects it as an
ordinary npm dependency; it does not republish the library through an `@hypit/hypit/*` facade.
