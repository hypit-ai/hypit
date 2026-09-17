# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["fastembed>=0.4", "numpy", "websockets>=12"]
# ///
"""recent.design: local mirror, hybrid vector search, live viewer.

Data: $RD_HOME (default ~/.cache/recent-design)
  items.json     full item records, keyed by id
  posters/       <id>.webp thumbnails (CLIP input + viewer)
  vectors.npz    ids, text (bge-small 384d), image (CLIP 512d), stamp
  events.jsonl   activity log the viewer tails
  last.json      last search (viewer follow mode)
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOME = Path(os.environ.get("RD_HOME", Path.home() / ".cache/recent-design"))
ITEMS = HOME / "items.json"
POSTERS = HOME / "posters"
VECTORS = HOME / "vectors.npz"
EVENTS = HOME / "events.jsonl"
LAST = HOME / "last.json"
API = "https://api.recent.design/rpc/"
SITE = "https://recent.design"
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/151 Safari/537.36",
      "origin": SITE, "referer": SITE + "/"}
FEEDS = ["all", "websites", "og-images", "app-store-screenshots", "app-icons", "tools", "skills"]
TEXT_MODEL = "BAAI/bge-small-en-v1.5"
CLIP_TEXT = "Qdrant/clip-ViT-B-32-text"
CLIP_IMAGE = "Qdrant/clip-ViT-B-32-vision"
CDP = os.environ.get("RD_CDP", "http://127.0.0.1:9333")
VIEWER_HTML = Path(__file__).with_name("viewer.html")


# ---------- plumbing ----------

def log(kind: str, msg: str, **extra):
    HOME.mkdir(parents=True, exist_ok=True)
    rec = {"ts": time.time(), "kind": kind, "msg": msg, **extra}
    with EVENTS.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    print(f"[{kind}] {msg}", file=sys.stderr)


def rpc(proc: str, inp: dict) -> dict:
    req = urllib.request.Request(API + proc, data=json.dumps({"json": inp}).encode(),
                                 headers={**UA, "content-type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)["json"]
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                raise SystemExit(f"rpc {proc} {e.code}: {e.read()[:300]!r}")
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(1.5 * (attempt + 1))
    raise SystemExit(f"rpc {proc} failed after retries")


def load_items() -> dict:
    return json.loads(ITEMS.read_text()) if ITEMS.exists() else {}


def item_url(it: dict) -> str:
    return f"{SITE}/i/{it['id']}-{it['slug']}"


def poster_url(it: dict, want: int = 400) -> str | None:
    cv = it.get("cover") or (it.get("media") or [None])[0]
    if not cv:
        return None
    src = cv.get("poster") or cv
    if src.get("mediaType") == "video":
        return None  # no poster rendition; fetch_poster grabs a frame instead
    rends = sorted(src.get("renditions") or [], key=lambda r: r["width"])
    for r in rends:
        if r["width"] >= want:
            return r["url"]
    return rends[-1]["url"] if rends else src.get("url")


def item_text(it: dict) -> str:
    tags = ", ".join(t["name"] for t in it.get("tags") or [])
    cat = (it.get("category") or {}).get("name", "")
    who = (it.get("credit") or {}).get("name") or (it.get("creator") or {}).get("name") or ""
    parts = [it.get("title") or "", it.get("tagline") or "", it.get("description") or "",
             f"Category: {cat}. Format: {it.get('format')}. Tags: {tags}. By {who}."]
    return " ".join(p for p in parts if p)


def summary(it: dict, score: float | None = None) -> dict:
    cv = it.get("cover") or {}
    return {
        "id": it["id"], "title": it.get("title"), "url": item_url(it),
        "source": (it.get("source") or {}).get("url"),
        "category": (it.get("category") or {}).get("slug"), "format": it.get("format"),
        "tags": [t["slug"] for t in it.get("tags") or []],
        "by": (it.get("credit") or {}).get("name"),
        "description": it.get("description"),
        "media": cv.get("url"), "mediaType": cv.get("mediaType"),
        "poster": poster_url(it), "published": it.get("publishedAt"),
        "opens": (it.get("stats") or {}).get("opens"),
        **({"score": round(score, 4)} if score is not None else {}),
    }


# ---------- sync ----------

def cmd_sync(a):
    items = load_items()
    before = len(items)
    feeds = a.feeds or FEEDS
    for feed in feeds:
        cur, n, pages = None, 0, 0
        while True:
            inp = {"feed": feed, "limit": 100, "sort": "recent"}
            if cur:
                inp["cursor"] = cur
            d = rpc("items/list", inp)
            fresh = 0
            for it in d["items"]:
                old = items.get(it["id"])
                if not old or old.get("updatedAt") != it.get("updatedAt"):
                    fresh += 1
                items[it["id"]] = it
            n += len(d["items"]); pages += 1
            log("sync", f"{feed}: page {pages}, {n} seen, {fresh} new/changed", feed=feed, seen=n)
            cur = d.get("nextCursor")
            if not cur or not d["items"] or (a.quick and fresh == 0):
                break
    HOME.mkdir(parents=True, exist_ok=True)
    tmp = ITEMS.with_suffix(".tmp")
    tmp.write_text(json.dumps(items))
    tmp.replace(ITEMS)
    log("sync", f"done: {len(items)} items ({len(items) - before:+d})", total=len(items))


# ---------- index ----------

def fetch_poster(it: dict) -> Path | None:
    p = POSTERS / f"{it['id']}.webp"
    if p.exists() and p.stat().st_size > 0:
        return p
    url = poster_url(it)
    cv = it.get("cover") or {}
    if not url and cv.get("mediaType") == "video" and cv.get("url"):
        r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-user_agent", UA["user-agent"],
                            "-ss", "0.5", "-i", cv["url"], "-frames:v", "1", "-vf", "scale=400:-2",
                            "-y", str(p)], capture_output=True, timeout=60)
        if r.returncode == 0 and p.exists():
            return p
        log("warn", f"frame {it['id']}: {r.stderr.decode()[:160]}")
        return None
    if not url:
        return None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            p.write_bytes(r.read())
        return p
    except Exception as e:  # noqa: BLE001 - one bad poster must not stop the index
        log("warn", f"poster {it['id']}: {e}")
        return None


def cmd_index(a):
    import numpy as np
    from fastembed import ImageEmbedding, TextEmbedding

    items = load_items()
    if not items:
        raise SystemExit("no items; run `recent-design sync` first")
    POSTERS.mkdir(parents=True, exist_ok=True)
    old = {}
    if VECTORS.exists() and not a.full:
        z = np.load(VECTORS)
        for i, pid in enumerate(z["ids"]):
            old[str(pid)] = (str(z["stamp"][i]), z["text"][i], z["image"][i])
    ids = sorted(items)
    todo = [i for i in ids if i not in old or old[i][0] != str(items[i].get("updatedAt"))
            or (not old[i][2].any() and (items[i].get("cover") or items[i].get("media")))]
    log("index", f"{len(ids)} items, {len(todo)} to embed")

    paths: dict[str, Path | None] = {}
    with cf.ThreadPoolExecutor(16) as ex:
        for k, (pid, p) in enumerate(zip(todo, ex.map(lambda i: fetch_poster(items[i]), todo)), 1):
            paths[pid] = p
            if k % 50 == 0 or k == len(todo):
                log("index", f"posters {k}/{len(todo)}", done=k, total=len(todo), stage="posters")

    text_vecs, img_vecs = {}, {}
    if todo:
        tm = TextEmbedding(TEXT_MODEL)
        for pid, v in zip(todo, tm.embed([item_text(items[i]) for i in todo], batch_size=64)):
            text_vecs[pid] = v
        log("index", f"text vectors {len(text_vecs)}", stage="text")
        im = ImageEmbedding(CLIP_IMAGE)
        have = [i for i in todo if paths.get(i)]
        for k in range(0, len(have), 64):
            chunk = have[k:k + 64]
            try:
                vecs = list(im.embed([str(paths[i]) for i in chunk], batch_size=32))
            except Exception:  # noqa: BLE001 - fall back to per-image to isolate bad files
                vecs = []
                for i in chunk:
                    try:
                        vecs.append(next(iter(im.embed([str(paths[i])]))))
                    except Exception as e:  # noqa: BLE001
                        log("warn", f"image embed {i}: {e}")
                        vecs.append(None)
            for i, v in zip(chunk, vecs):
                if v is not None:
                    img_vecs[i] = v
            log("index", f"image vectors {min(k + 64, len(have))}/{len(have)}",
                done=min(k + 64, len(have)), total=len(have), stage="images")

    T = np.zeros((len(ids), 384), np.float32)
    I = np.zeros((len(ids), 512), np.float32)
    stamp = []
    for r, pid in enumerate(ids):
        if pid in text_vecs:
            T[r] = text_vecs[pid]
            if pid in img_vecs:
                I[r] = img_vecs[pid]
        else:
            T[r], I[r] = old[pid][1], old[pid][2]
        stamp.append(str(items[pid].get("updatedAt")))
    for M in (T, I):
        n = np.linalg.norm(M, axis=1, keepdims=True)
        M /= np.where(n == 0, 1, n)
    np.savez(VECTORS, ids=np.array(ids), text=T, image=I, stamp=np.array(stamp))
    log("index", f"done: {len(ids)} vectors ({int((np.abs(I).sum(1) > 0).sum())} with image)")


# ---------- search ----------

class Index:
    _cache = None

    def __init__(self):
        import numpy as np
        if not VECTORS.exists():
            raise SystemExit("no index; run `recent-design sync && recent-design index` first")
        z = np.load(VECTORS)
        self.np = np
        self.ids = [str(x) for x in z["ids"]]
        self.row = {pid: r for r, pid in enumerate(self.ids)}
        self.T, self.I = z["text"], z["image"]
        self.items = load_items()
        self._tm = self._cm = None

    @classmethod
    def get(cls):
        mtime = VECTORS.stat().st_mtime if VECTORS.exists() else 0
        if cls._cache is None or cls._cache[0] != mtime:
            cls._cache = (mtime, cls())
        return cls._cache[1]

    def qtext(self, q):
        from fastembed import TextEmbedding
        self._tm = self._tm or TextEmbedding(TEXT_MODEL)
        return next(iter(self._tm.query_embed([q])))

    def qclip(self, q):
        from fastembed import TextEmbedding
        self._cm = self._cm or TextEmbedding(CLIP_TEXT)
        v = next(iter(self._cm.embed([q])))
        return v / (self.np.linalg.norm(v) or 1)

    def search(self, q=None, like=None, k=12, mode="hybrid", feed=None, category=None,
               tags=(), fmt=None, w_visual=0.5):
        np = self.np
        if like:
            if like not in self.row:
                raise SystemExit(f"unknown id {like}")
            r = self.row[like]
            s = 0.5 * (self.T @ self.T[r]) + 0.5 * (self.I @ self.I[r])
            s[r] = -9
        else:
            parts = []
            if mode in ("hybrid", "text"):
                parts.append(((1 - w_visual) if mode == "hybrid" else 1, self.T @ self.qtext(q)))
            if mode in ("hybrid", "visual"):
                parts.append((w_visual if mode == "hybrid" else 1, self.I @ self.qclip(q)))
            s = np.zeros(len(self.ids), np.float32)
            for w, v in parts:
                has = v != 0
                mu, sd = v[has].mean(), v[has].std() or 1
                s += w * np.where(has, (v - mu) / sd, -3)  # z-score so bge and CLIP scales mix
        mask = np.ones(len(self.ids), bool)
        for r, pid in enumerate(self.ids):
            it = self.items.get(pid)
            if it is None:
                mask[r] = False; continue
            cat = it.get("category") or {}
            if category and category not in (cat.get("slug"), cat.get("scope")):
                mask[r] = False
            if fmt and it.get("format") != fmt:
                mask[r] = False
            if feed and FEED_FORMAT.get(feed) and it.get("format") not in FEED_FORMAT[feed]:
                mask[r] = False
            if tags and not set(tags) <= {t["slug"] for t in it.get("tags") or []}:
                mask[r] = False
        s = np.where(mask, s, -np.inf)
        top = np.argsort(-s)[:k]
        return [summary(self.items[self.ids[r]], float(s[r])) for r in top if np.isfinite(s[r])]


FEED_FORMAT = {"x": {"tweet"}, "websites": {"site"}, "og-images": {"og"},
               "app-store-screenshots": {"app_screenshot"}, "app-icons": {"app_icon"},
               "tools": {"tool"}, "skills": {"skill"}}


def run_search(q=None, like=None, record=True, **kw):
    t = time.time()
    res = Index.get().search(q=q, like=like, **kw)
    if not record:
        return {"results": res}
    rec = {"query": q, "like": like, "opts": kw, "ts": time.time(), "results": res}
    LAST.write_text(json.dumps(rec))
    log("search", f"{'like:' + like if like else repr(q)} -> {len(res)} hits in {time.time() - t:.2f}s",
        query=q, like=like, top=[r["id"] for r in res[:5]])
    return rec


def cmd_search(a):
    rec = run_search(q=" ".join(a.query) or None, like=a.like, k=a.k, mode=a.mode, feed=a.feed,
                     category=a.category, tags=tuple(a.tag or ()), fmt=a.format, w_visual=a.visual)
    if a.json:
        print(json.dumps(rec["results"], indent=1)); return
    for r in rec["results"]:
        print(f"{r['score']:+.2f}  {r['id']}  {r['title']}  [{r['category']}/{r['format']}] "
              f"{','.join(r['tags'][:5])}\n       {r['url']}\n       media: {r['media']}\n"
              f"       {(r['description'] or '')[:160]}")


def cmd_show(a):
    it = load_items().get(a.id)
    if not it:
        raise SystemExit(f"unknown id {a.id}")
    print(json.dumps(it if a.raw else summary(it), indent=1))


def cmd_stats(a):
    import collections
    items = load_items()
    c = collections.Counter(f"{(i.get('category') or {}).get('scope')}/{i.get('format')}" for i in items.values())
    tags = collections.Counter(t["slug"] for i in items.values() for t in i.get("tags") or [])
    idx = "missing"
    if VECTORS.exists():
        import numpy as np
        idx = f"{len(np.load(VECTORS)['ids'])} vectors, {time.ctime(VECTORS.stat().st_mtime)}"
    print(json.dumps({"home": str(HOME), "items": len(items), "index": idx,
                      "by_scope_format": dict(c.most_common()), "top_tags": dict(tags.most_common(40))}, indent=1))


# ---------- browser (live view) ----------

def cdp_targets():
    """Work pages only: skips the viewer's own tab so the mirror never shows itself."""
    with urllib.request.urlopen(CDP + "/json/list", timeout=3) as r:
        pages = [t for t in json.load(r) if t.get("type") == "page"]
    host = lambda u: urllib.parse.urlparse(u).hostname or ""
    return [t for t in pages if host(t["url"]) not in ("127.0.0.1", "localhost")]


def cmd_chrome(a):
    try:
        urllib.request.urlopen(CDP + "/json/version", timeout=2)
        print(f"chrome already up at {CDP}"); return
    except Exception:  # noqa: BLE001
        pass
    port = urllib.parse.urlparse(CDP).port
    exe = next((p for p in ("chromium", "google-chrome", "google-chrome-stable") if
                subprocess.run(["which", p], capture_output=True).returncode == 0), None)
    if not exe:
        raise SystemExit("no chromium/google-chrome on PATH")
    args = [exe, f"--remote-debugging-port={port}", f"--user-data-dir={HOME / 'chrome-profile'}",
            "--no-first-run", "--no-default-browser-check", "--window-size=1440,900"]
    if not a.headed:
        args.append("--headless=new")
    subprocess.Popen(args + ["about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True)
    for _ in range(40):
        try:
            urllib.request.urlopen(CDP + "/json/version", timeout=1)
            log("browser", f"chrome up at {CDP} ({'headed' if a.headed else 'headless'})"); return
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    raise SystemExit("chrome did not come up")


def cdp_call(ws_url, method, **params):
    from websockets.sync.client import connect
    with connect(ws_url, max_size=50 * 2**20, open_timeout=5) as ws:
        ws.send(json.dumps({"id": 1, "method": method, "params": params}))
        while True:
            m = json.loads(ws.recv(timeout=15))
            if m.get("id") == 1:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m["result"]


def cmd_open(a):
    """Open an item (or top hit of a query) in the CDP browser the viewer mirrors."""
    items = load_items()
    target = a.target
    if target not in items:
        res = run_search(q=target, k=1)["results"]
        if not res:
            raise SystemExit("no match")
        target = res[0]["id"]
    it = items[target]
    url = (it.get("source") or {}).get("url") if a.source else item_url(it)
    pages = cdp_targets()
    if pages:
        cdp_call(pages[0]["webSocketDebuggerUrl"], "Page.navigate", url=url)
    else:
        urllib.request.urlopen(urllib.request.Request(CDP + "/json/new?" + urllib.parse.quote(url, safe=":/?=&"),
                                                      method="PUT"), timeout=5)
    log("browser", f"open {target} {url}", id=target, url=url)
    print(url)


# ---------- viewer ----------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, code, body: bytes, ctype="application/json", cache=False):
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "max-age=86400" if cache else "no-store")
        self.end_headers()
        self.wfile.write(body)

    def j(self, obj, code=200):
        self.send(code, json.dumps(obj).encode())

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[-1] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            if u.path == "/":
                return self.send(200, VIEWER_HTML.read_bytes(), "text/html; charset=utf-8")
            if u.path == "/api/search":
                rec = run_search(q=q.get("q") or None, like=q.get("like") or None, k=int(q.get("k", 30)),
                                 mode=q.get("mode", "hybrid"), feed=q.get("feed") or None,
                                 category=q.get("category") or None,
                                 tags=tuple(t for t in q.get("tags", "").split(",") if t),
                                 w_visual=float(q.get("visual", 0.5)))
                return self.j(rec)
            if u.path == "/api/last":
                return self.j(json.loads(LAST.read_text()) if LAST.exists() else {})
            if u.path == "/api/events":
                since = float(q.get("since", 0))
                out = []
                if EVENTS.exists():
                    with EVENTS.open() as f:
                        lines = f.readlines()[-400:]
                    out = [e for e in map(json.loads, lines) if e["ts"] > since]
                return self.j(out)
            if u.path == "/api/stats":
                items = load_items()
                return self.j({"items": len(items), "indexed": VECTORS.exists(),
                               "index_mtime": VECTORS.stat().st_mtime if VECTORS.exists() else None})
            if u.path.startswith("/poster/"):
                p = POSTERS / Path(u.path).name
                if p.exists():
                    return self.send(200, p.read_bytes(), "image/webp", cache=True)
                return self.send(404, b"{}")
            if u.path == "/api/screen":
                pages = cdp_targets()
                if not pages:
                    return self.send(404, b'{"error":"no page"}')
                pg = next((p for p in pages if not p["url"].startswith(("about:", "chrome"))), pages[0])
                shot = cdp_call(pg["webSocketDebuggerUrl"], "Page.captureScreenshot",
                                format="jpeg", quality=60)
                import base64
                self.send_response(200)
                body = base64.b64decode(shot["data"])
                self.send_header("content-type", "image/jpeg")
                self.send_header("x-page-url", urllib.parse.quote(pg["url"], safe=":/?=&"))
                self.send_header("x-page-title", urllib.parse.quote(pg.get("title", "")))
                self.send_header("content-length", str(len(body)))
                self.send_header("cache-control", "no-store")
                self.end_headers()
                return self.wfile.write(body)
            if u.path == "/api/open":
                ns = argparse.Namespace(target=q["id"], source=q.get("source") == "1")
                cmd_open(ns)
                return self.j({"ok": True})
            self.send(404, b'{"error":"not found"}')
        except SystemExit as e:
            self.j({"error": str(e)}, 400)
        except Exception as e:  # noqa: BLE001 - viewer must stay up
            self.j({"error": f"{type(e).__name__}: {e}"}, 500)


def cmd_serve(a):
    Index.get() if VECTORS.exists() else None
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    log("viewer", f"http://127.0.0.1:{a.port}")
    print(f"viewer: http://127.0.0.1:{a.port}", flush=True)
    if a.warm and VECTORS.exists():
        threading.Thread(target=lambda: run_search(q="warmup", k=1, record=False), daemon=True).start()
    srv.serve_forever()


def main():
    p = argparse.ArgumentParser(prog="recent-design", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sync", help="mirror item metadata from api.recent.design")
    s.add_argument("--feeds", nargs="*", choices=FEEDS)
    s.add_argument("--quick", action="store_true", help="stop a feed at the first page with nothing new")
    s.set_defaults(fn=cmd_sync)
    s = sub.add_parser("index", help="download posters, embed text + images")
    s.add_argument("--full", action="store_true", help="re-embed everything")
    s.set_defaults(fn=cmd_index)
    s = sub.add_parser("search", help="hybrid vector search")
    s.add_argument("query", nargs="*")
    s.add_argument("--like", help="item id: find visually + semantically similar")
    s.add_argument("-k", type=int, default=10)
    s.add_argument("--mode", choices=["hybrid", "text", "visual"], default="hybrid")
    s.add_argument("--visual", type=float, default=0.5, help="hybrid weight on CLIP image match (0-1)")
    s.add_argument("--feed", choices=list(FEED_FORMAT))
    s.add_argument("--category", help="category slug or scope, e.g. motion, web, interface, design")
    s.add_argument("--format")
    s.add_argument("--tag", action="append", help="tag slug, repeatable (AND)")
    s.add_argument("--json", action="store_true")
    s.set_defaults(fn=cmd_search)
    s = sub.add_parser("show", help="print one item")
    s.add_argument("id")
    s.add_argument("--raw", action="store_true")
    s.set_defaults(fn=cmd_show)
    s = sub.add_parser("stats", help="corpus + index summary, category/tag vocab")
    s.set_defaults(fn=cmd_stats)
    s = sub.add_parser("chrome", help="start isolated Chrome with CDP on $RD_CDP (default :9333)")
    s.add_argument("--headed", action="store_true")
    s.set_defaults(fn=cmd_chrome)
    s = sub.add_parser("open", help="open item id (or top hit for a query) in the CDP browser")
    s.add_argument("target")
    s.add_argument("--source", action="store_true", help="open the original source (tweet/site)")
    s.set_defaults(fn=cmd_open)
    s = sub.add_parser("serve", help="live viewer: search grid, activity log, browser mirror")
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--warm", action="store_true", help="preload query models")
    s.set_defaults(fn=cmd_serve)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
