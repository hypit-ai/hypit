# Pinned yt-dlp

A reconstruction starts from a video, and most of the videos worth reconstructing are at a link
rather than in a folder. This project holds the one dependency that turns one into a file.

The version is pinned and locked. `yt-dlp` releases constantly, because it is chasing sites that keep
changing, and an unpinned copy means two machines fetch the same link differently — which makes a
reconstruction unreproducible for a reason that has nothing to do with the video.

It is invoked one command at a time rather than run as a service:

```bash
uv run --project services/yt-dlp --frozen yt-dlp --version
```

`packages/yt-dlp` is the Node side that calls it, decides whether a reference is a link at all, and
caches what it fetched.
