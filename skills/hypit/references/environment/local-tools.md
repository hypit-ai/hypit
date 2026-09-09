# Local tools and Managed Programs

Read this when the selected Profile uses local media, HyperFrames, WhisperX, OpenCV, or another local
Endpoint and its executable or Managed Program is unavailable.

## Diagnose the selected local capability

Begin with the current project and Profile:

```bash
hypit paths
hypit runtime status
hypit runtime logs
hypit programs status
hypit doctor
```

Read the failing Endpoint's message and package README before changing the machine. The Profile says
which local implementation was selected; another project's working service is not evidence that this
Profile selects it.

## Supply host executables at machine scope

The installed Hypit Distribution requires its supported Node.js version. Local media processing needs
both `ffmpeg` and `ffprobe` on `PATH`, or explicit compatible paths accepted by its Provider. Local
Python Programs use `uv` to create their locked environments in Hypit's machine Program Home.

Use the host's ordinary package manager, then verify the executables in a new shell:

```bash
# macOS
brew install ffmpeg uv
ffmpeg -version
ffprobe -version
uv --version
```

```powershell
# Windows
winget install --id Gyan.FFmpeg.Shared -e
winget install --id astral-sh.uv -e
ffmpeg -version
ffprobe -version
uv --version
```

On Linux, use the distribution package manager or the current official installation method for the
same executables. Keep these machine tools outside the video project. `hypit paths` reports the shared
Program and npm package homes used by selected Runtime adapters.

## Let the selected Endpoint own its Program

An Endpoint may contribute one Managed Program: for example, a warm WhisperX service or the browser
needed by local HyperFrames. Its Provider owns the prepare command, start command, probe, expected
identity, and configuration. The Runtime operates those declarations:

```bash
hypit runtime up
hypit programs status
```

`runtime up` prepares selected adapter dependencies, brings declared Programs to their expected local
state, and starts the Worker. The narrower commands operate only the Programs:

```bash
hypit programs up
hypit programs status
hypit programs down
```

`runtime down` stops the Worker while leaving separately managed Programs available. This lets a later
Build reuse an already warm local model. Use `programs down` when those helpers themselves should stop.

Ordinary projects use these declarations instead of running a service's internal `uv sync` or Python
entry point by hand. Contributor/operator commands in a service README are for diagnosing that
packaged service, not for creating a second project-local installation.

## Select local WhisperX explicitly

Local and hosted WhisperX implement the same alignment capability. Add the local Provider to the
Profile:

```json
{
  "endpoints": {
    "whisperx.local": {
      "use": "@hypit/provider-whisperx-local"
    }
  },
  "bindings": {
    "@hypit/whisperx@1#whisperx-alignment": "whisperx.local"
  }
}
```

The binding is needed when another selected Endpoint, such as HypiHub, also offers alignment. The
Provider README owns optional model, device, compute, batch-size, timeout, and concurrency settings.
Its loopback service accepts canonical speech evidence and returns measured alignment; it does not
interpret Script, Caption Cues, or Semantic Segments.

Run `hypit runtime up` after selecting it. The first preparation may install Python and download model
weights, while later projects reuse the machine Program. Success means the configured service identity
answers its health probe; `hypit doctor` then checks the selected Endpoint as part of the full Profile.

If local installation is incompatible with the machine, blocked by the network, or making no useful
progress within the user's available time, report the exact evidence and offer another Provider for
the same capability. Continue independent reference or production work while that choice is resolved.

## Repair from the narrowest evidence

- A missing executable belongs to host installation and `PATH`.
- A package dependency named by an adapter can be prepared by `runtime up`; a separately reported
  exact optional npm dependency uses `hypit packages install <package@version>`.
- A down or mismatched Managed Program belongs to its Provider configuration, Program status, and
  service log.
- A healthy local Program with a rejected request belongs to the Provider's support or request error,
  not to reinstallation.
- A remote authentication, account, quota, or model-catalogue error belongs to the remote Endpoint and
  `profile.md`, even when the Worker happens to run locally.

After changing the Distribution or an already loaded project package, read `../production/builds.md`
before restarting the Worker so active work is preserved.
