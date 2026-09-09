# Fetching video with yt-dlp

`@hypit/yt-dlp` owns video download for the Hypit Distribution. Video CLI exposes it as:

```bash
hypit media fetch "https://example.com/watch?v=VIDEO_ID" --to references/source.mp4
```

The CLI creates destination directories, refuses existing output paths and probes the completed
file. Add `--json` for the source URL, saved path and media properties. This operation opens no
Runtime Profile and creates no Build.

## Package boundary

- `isVideoUrl(value)` recognizes HTTP and HTTPS links. Local paths, including Windows drive paths,
  remain file inputs.
- `downloadVideo(url, target)` downloads one video to the given path. Its caller owns destination
  preparation and overwrite policy. The target extension must be `.mp4`, `.mkv`, `.webm` or `.mov`.

The downloader invokes the locked Python project in `services/yt-dlp` through `uv`, located relative
to the installed Distribution. Ship its `pyproject.toml` and `uv.lock` with this package's source.
`uv` and `ffmpeg` must be available on PATH; the CLI also uses `ffprobe` to report the saved media.

The request selects `bv*+ba/b`, with `res:1080,vcodec:h264` format preferences and `--no-playlist`.
Available source streams determine the result. It stages the download in the OS temporary directory,
then moves the completed file to the target, copying on a cross-volume `EXDEV` error. Temporary
files are removed when the operation ends. Download errors retain the tool's diagnostic output.

The package supplies download behavior; the CLI owns command arguments and reporting. Production
use is described in the Hypit Skill's **Downloading a video from a link** page. The installed
`services/yt-dlp/README.md` covers direct invocation when a source needs additional yt-dlp options.
