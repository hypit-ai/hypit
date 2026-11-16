# Fetching video with yt-dlp

`@hypit/yt-dlp` owns video download and its CLI contribution for the Hypit Distribution:

```bash
hypit download prepare
hypit download "https://example.com/watch?v=VIDEO_ID" --to references/source.mp4
```

The CLI creates destination directories, refuses existing output paths and probes the completed
file. Add `--json` for the source URL, saved path and media properties. This operation opens no
Runtime Profile and creates no Build.

## Package boundary

- `isVideoUrl(value)` recognizes HTTP and HTTPS links. Local paths, including Windows drive paths,
  remain file inputs.
- `downloadVideo(url, target)` downloads one video to the given path. Its caller owns destination
  preparation and overwrite policy. The target extension must be `.mp4`, `.mkv`, `.webm` or `.mov`.

The downloader reads the locked `runtime/pyproject.toml` and `runtime/uv.lock` shipped by this same
package. `prepareVideoDownload()` (`download prepare`) explicitly runs
`uv sync --frozen` into `<hostState>/programs/yt-dlp/<version>/.venv`. `downloadVideo()` only invokes
that prepared executable and refuses a missing environment. The caller's location and a repository
`services/` ancestor are irrelevant. `uv` is needed for preparation;
`ffmpeg` must be on PATH for fetching, and the CLI uses `ffprobe` to report the saved media.
The default upstream extras include the EJS solver in that locked environment. Fetch explicitly
selects the calling Node executable, ignores user yt-dlp configuration/plugins, and disables updates
and remote component acquisition. Fetching source media remains a network operation.

The request selects `bv*+ba/b`, with `res:1080,vcodec:h264` format preferences and `--no-playlist`.
Available source streams determine the result. Merged streams and a single muxed file are both
written in the target's container. It stages the download in the OS temporary directory,
then moves the completed file to the target, copying on a cross-volume `EXDEV` error. Temporary
files are removed when the operation ends. Download errors retain the tool's diagnostic output.

The package supplies download behavior, locked material, command arguments and reporting. It uses
`media-local` to inspect the finished ordinary file and owns network acquisition itself.
Production use is described in the Hypit Skill's **Downloading a video
from a link** page. [`runtime/README.md`](runtime/README.md) covers direct invocation when a source
needs additional yt-dlp options.
