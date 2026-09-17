# Surreel

A Flutter video studio for web, Android, iOS, macOS, Windows, and Linux, built around Hypit and the real CodeGraff SDK.

The app includes a creative brief composer, aspect ratio/duration/style controls, reference URLs, six editable brief templates, persistent projects, project search, live activity, cancellation, revision requests, an output library, and video review. Photographs are bundled template illustrations; project results always come from actual exported files.

## Run locally

From the Hypit repository root:

| Command | Purpose |
| --- | --- |
| pnpm install | Install the Node workspace and CodeGraff SDK |
| pnpm surreel | Start the API on 8787 and Flutter development server on 8080 |
| pnpm surreel:build | Build the release web application |
| pnpm surreel:serve | Serve the built app and API together on 8787 |
| pnpm surreel:check | Run Flutter analysis and all Flutter tests |
| pnpm surreel:server | Start only the API |
| pnpm --filter @surreel/server test | Run the service and SDK protocol tests |

Open http://127.0.0.1:8787 after building and serving, or http://127.0.0.1:8080 during development.

The launcher chooses an available port when either preferred port is occupied and prints the actual URL. SURREEL_PORT and SURREEL_DEV_PORT pin the API and development frontend ports when needed. Built web resources, photographs, and fonts are served locally.

The launcher uses Flutter from SURREEL_FLUTTER, then the project-local .surreel-tools/flutter installation, then PATH. This checkout was validated with Flutter 3.47.4 / Dart 3.13.3 and Node 24.18.1. Flutter and the SDK cache are ignored by Git. A fresh machine needs a stable Flutter SDK with Dart 3.13.3 or later and the repository's Node/pnpm prerequisites.

## Connect the agent

CodeGraff uses its normal provider authentication and configured model. Authenticate your chosen provider with Graff before starting a production session. SURREEL_AGENT_MODEL selects a configured model, and SURREEL_GRAFF_BINARY can select an explicit Graff installation.

Point SURREEL_HYPIT_RUNTIME at an existing Hypit runtime profile if you want to reuse configured video providers. Rendering needs the underlying Hypit toolchain, including FFmpeg/FFprobe and Chromium. The app reports actual provider/tool failures through the project.

For unattended agent execution on a trusted local machine, start the service with SURREEL_TRUST_LOCAL_AGENT=1. This explicitly enables CodeGraff's unattended permission mode. The default keeps its permission checks enabled; a question or permission request ends the run with that question visible, allowing the brief or configuration to be updated before retrying. Working directories do not provide an OS sandbox.

The API runs locally by default. It stores projects in the OS user data directory, outside the Hypit tool checkout. SURREEL_PROJECTS_DIR selects another location. Server configuration, exact SDK behavior, local execution scope, media publication, and environment variables are documented in [the service README](../../packages/surreel-server/README.md).

## Web and native clients

The built web app uses its own origin for the API. Development passes SURREEL_API_URL=http://127.0.0.1:8787 as a Dart define. Native builds use that loopback address by default; use Studio connection to enter an address reachable from your device. The studio address is remembered, while access tokens remain in memory for the current session.

For example, from this directory, use Flutter on an Android device with a configured HTTPS studio:

    flutter run --dart-define=SURREEL_API_URL=https://studio.example.com

A service exposed beyond loopback requires SURREEL_SESSION_TOKEN and SURREEL_ALLOWED_ORIGINS. Configure an HTTPS reverse proxy for remote devices. Flutter web and native clients share the same service contract; this initial backend is for one user and one server process per data directory.

Native platform projects and networking permissions are present for all six targets. Their builds require the corresponding platform SDKs and host OS. The current Linux host supports the web build; Android SDK/Java, Linux development libraries, and the macOS/iOS/Windows toolchains are not installed. These native targets have not been compiled here.

Video playback is embedded on web, Android, iOS, and macOS. Windows/Linux offer the real output in the system player/browser because the selected video_player plugin does not provide those desktop implementations. Open file keeps signed URLs intact so the browser can save the original export.

## Workflow and behavior

1. Write a brief or choose a template. Set the aspect ratio, target duration, and visual style. Add a public reference URL if useful.
2. Create video saves a project and starts CodeGraff through the private Node service.
3. The service supplies the current Hypit skill, selected runtime, project directory, and an explicit output contract to the agent. Flutter polls active project state every 1.5 seconds.
4. The agent authors editable Hypit sources, builds and exports a video. The service verifies the actual video stream before publication; a successful text response alone does not complete a video.
5. Review the output, open an export, stop an active run, or request a new revision. Previous exports remain available when a revision fails or is cancelled.

Media URLs are scoped to specific published artifacts, support byte ranges, and are signed when API authentication is enabled. Credentials stay on the service. A server restart marks interrupted runs as failed rather than pretending to resume them.

## Structure

- lib/ui: workspace, brief templates, project review, playback, and shared design primitives.
- lib/data: typed API contract, immutable models, connection settings, and state/polling coordination.
- test: HTTP/state and responsive interaction tests.
- assets: bundled stock photos, open fonts, and Surreel branding.
- ../../packages/surreel-server: the real CodeGraff agent bridge, persistence, and output publication.

Design work used the requested recent-design skill: [Framer AI Sidebar](https://recent.design/i/4v43t3i-framer-ai-sidebar) ([original reference](https://x.com/benjaminnathan/status/2069724377629765813)) informed the spacious dark editor and adjacent activity; [AI Image Generation Reveal](https://recent.design/i/pf04jr1-ai-image-generation-reveal) ([original reference](https://x.com/dqnamo/status/2082481271671078928)) informed restrained loading and output transitions. Surreel has its own mark, lime palette, Space Grotesk headings, DM Sans body text, responsive navigation, and creative brief layout. See [asset credits and font licenses](assets/CREDITS.md).

Automated tests use injected HTTP clients/runners and a local CodeGraff protocol fixture. They verify behavior without billing a model or generation provider. A live provider-backed video generation is a separate environment validation.
