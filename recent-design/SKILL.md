---
name: recent-design
description: Search recent.design (a daily-curated design inspiration gallery covering motion, interface, web, branding, 3D, websites, OG images, app icons, app screenshots, tools, and skills) by meaning and by look, using a local vector index. Includes a live viewer that shows the agent's searches, activity log, and a mirror of the browser. Use whenever a task needs real, current design references — landing page or hero direction, moodboards, "find examples of X", "what does good Y look like", "show me something like this", styling a UI or video, or picking a visual direction before building. Also use when the user mentions recent.design.
---

# recent-design

Local copy of recent.design with hybrid vector search: bge-small text vectors plus CLIP image vectors from each item's poster. Includes a live viewer the user can watch.

CLI: `recent-design` (symlink to `scripts/recent-design`, which runs `uv run --script scripts/rd.py`). Data lives in `~/.cache/recent-design` (override with `RD_HOME`).

## Why a local index

A plain HTTP call returns all the data; no browser is needed to read it. The site is a TanStack SPA backed by oRPC: `POST https://api.recent.design/rpc/items/list` with body `{"json":{"feed","limit<=100","sort":"recent","cursor"}}`, and `items/byId` with `{"json":{"id"}}`. The feeds are `all x websites og-images app-store-screenshots app-icons tools skills`. Each item has a title, description, category, tags (style, color, interaction, framework…), creator, source URL, media, and stats. The site has no semantic search, so this skill adds one.

## Workflow

```bash
recent-design stats                      # corpus size, index age, category/tag vocab
recent-design sync --quick               # pull new items (full sync ≈40s; --quick stops at known pages)
recent-design index                      # incremental: posters + embeddings for new/changed only
recent-design search "dark landing page with glowing 3D shader" -k 8
recent-design search --mode visual "pink and orange gradient"   # CLIP only: judges the look
recent-design search --like c6deg41 -k 8                        # similar items (text + image)
recent-design search --feed websites --tag dark "fintech dashboard"
recent-design search ... --json          # structured: id,title,url,source,media,poster,tags,description,score
recent-design show <id> [--raw]
```

- If `stats` shows the index is more than about a day old, run `sync --quick && index` before searching. The site updates daily.
- Modes: `hybrid` (default; z-scored text and CLIP scores, weighted by `--visual 0..1`, default 0.5), `text` (topic, words, and tags), `visual` (colour, composition, and mood).
- Filters: `--feed`, `--category` (a slug like `motion`, `interface`, `web`, `branding`, `print`, `3d`, `saas`, or a scope like `design` or `web`), `--format`, and `--tag` (repeatable, AND). Get the vocabulary from `stats`.
- Scores are relative within a single query. Don't compare them across queries.
- In an answer, cite each reference by its `url` (the recent.design page) and its `source` (the original tweet or site). `media` is the direct mp4 or image.

## Viewing what is happening

```bash
recent-design chrome [--headed]          # isolated Chrome, CDP :9333, profile in RD_HOME
recent-design serve --port 8765 --warm   # run in background; open http://127.0.0.1:8765
recent-design open <id|query> [--source] # navigate the CDP browser; the viewer mirrors it
```

The viewer shows:
- **Grid**: search results, with posters and videos that play on hover. Each card has "similar", "open in browser", "site", and "source" buttons, plus the search box, mode, visual weight, feed, and tag controls.
- **Follow agent** (on by default): every CLI search is written to `last.json`, and the grid switches to it within about 1s. The user watches your queries arrive as you run them.
- **Browser · live**: a screenshot of the CDP browser's current work tab every ~1.2s. The viewer's own tab is excluded.
- **Activity**: a tail of `events.jsonl` covering sync pages, index progress (with a progress bar), searches, opens, and warnings.

When the user asks to *see* or *watch*, start `chrome` and `serve` in the background, give them the URL, and then run searches and opens from the CLI.

For deeper browsing, use browser-harness against the same Chrome with `BU_CDP_URL=http://127.0.0.1:9333 BU_NAME=recent browser-harness <<'PY' ... PY`. The mirror shows it too. Item pages render fully in headless mode. For a recording or video, follow browser-harness `start_recording` / `stop_recording`.

## Gotchas

- `cdn.recent.design` returns 403 without a browser user-agent. `rd.py` sends one.
- Some videos have no poster rendition. For those, `index` grabs a frame with `ffmpeg`, and items still missing an image vector are retried on the next `index`. Items with no media (some tools and skills) are text-only.
- In headless Chrome, `scroll()` from browser-harness (a mouse-wheel event) can time out. Use `js("window.scrollBy(0, N)")` instead.
- The user's everyday Chrome has no remote debugging, so this skill uses its own Chrome on :9333 and never asks for the inspect checkbox.
- `rd` is a zsh alias for `rmdir`, which is why the CLI is named `recent-design`.
- To stop the viewer, run `fuser -k 8765/tcp`. `pkill -f` matches its own shell.
- The first run downloads models (~250MB) into the fastembed cache. A full index takes about 3.5 min on CPU; incremental runs take seconds.
