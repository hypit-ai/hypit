# Pinned yt-dlp

This project holds the locked Python downloader used by `hypit media fetch`. `uv` installs the
selected version and its dependencies when invoked. Site support follows that version's extractors;
the downloaded file preserves the source used by the production.

It is invoked one command at a time rather than run as a service:

```bash
uv run --project "/path/to/hypit/services/yt-dlp" --frozen yt-dlp --version
uv run --project "/path/to/hypit/services/yt-dlp" --frozen yt-dlp --help
```

Replace the project path with this directory in the installed Hypit Distribution. Direct invocation
accepts yt-dlp's own options, including source-specific format or authentication settings. Choose
those for the actual download. `ffmpeg` on PATH merges separate video and audio streams.

`packages/yt-dlp` is the Node wrapper used by Video CLI. It stages a download and saves the requested
project file; later commands read that file.
