# Downloading a Video from a Link

Read this when a reference clip or source video lives on a web page. Use `yt-dlp` together with `ffmpeg` and `ffprobe` to save the video locally inside the project.

## Save the Source Video

```bash
mkdir -p references/ad
yt-dlp \
  -f "bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4]/b" \
  --merge-output-format mp4 \
  --no-playlist \
  -o "references/ad/source.%(ext)s" \
  "https://example.com/watch?v=VIDEO_ID"
```

- Quote the URL so shell metacharacters (`?`, `&`, `=`) are passed intact.
- `--no-playlist` downloads only the single referenced video even if the link is part of a playlist.
- Prefer H.264 (`avc1`) near 1080p in an MP4 container so both `ffprobe`/`ffmpeg` and NLE playback work cleanly without transcoding surprises.
- Keep reference downloads under `references/<name>/` and production footage under `media/` or `assets/`.

## Inspect the Saved File

Verify resolution, frame rate, duration, and audio streams immediately after downloading:

```bash
ffprobe -v error -show_format -show_streams -of json references/ad/source.mp4
```

If `yt-dlp` is not installed on the host machine, see [Local Tools](../environment/local-tools.md) for installation instructions (e.g., `brew install yt-dlp`, `winget install yt-dlp.yt-dlp`, or `uvx yt-dlp`). Supported sites and login/cookie requirements depend on `yt-dlp` and the source site; if a site blocks automated download, ask the user to download or export the file locally.

## Continue from the Saved File

- **Reference study**: record the source URL and local file path in your reference notes, then inspect keyframes and speech following [Reference Video Study](../creation/reference-video.md).
- **Production material**: if the downloaded clip is cleared for use in the finished video, trim or normalize it as needed and register it as Project Media ([Media Preparation](media.md)) before placing it in SVML.
