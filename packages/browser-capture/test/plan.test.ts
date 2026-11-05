import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { captureBrowserExecutablePath, parseCapturePlan, planSelector, runCapturePlan, withCapture } from "../src/index.js";
import type { CapturePlan, CapturePlanReport } from "../src/index.js";

const exec = promisify(execFile);
const executablePath = process.env.HYPIT_CAPTURE_TEST_BROWSER ?? await captureBrowserExecutablePath();
const browserReady = existsSync(executablePath);
const codecsReady = ["ffmpeg", "ffprobe"].every((name) => spawnSync(name, ["-version"], { stdio: "ignore" }).status === 0);
const ready = (!browserReady || !codecsReady) && "Chrome, ffmpeg and ffprobe are required";

const PAGE = `<style>body{margin:0;height:2400px;background:#ff0000;font:20px sans-serif}
  button,input{position:absolute;left:40px;font-size:20px}</style>
  <div role="dialog" id="promo" style="position:fixed;right:20px;top:20px;background:#fff;padding:10px">
    Sale <button aria-label="Close" style="position:static" onclick="this.parentElement.remove()">×</button></div>
  <button style="display:none">Show result</button>
  <button id="go" style="top:40px" onclick="document.body.style.background='#0000ff'">Show result</button>
  <div id="rich" contenteditable="true" style="position:absolute;left:300px;top:200px;width:200px">draft <b>kept</b> text</div>
  <input id="name" style="top:120px" value="old text" oninput="document.getElementById('echo').textContent='echo:'+this.value">
  <p id="echo" style="position:absolute;left:400px;top:120px;margin:0"></p>
  <button style="top:200px">Delete project</button>
  <button class="twin" style="top:280px">Twin</button><button class="twin" style="top:340px">Twin</button>`;

test("plans are validated before a browser opens and shorthand selectors become Puppeteer selectors", () => {
  assert.throws(() => parseCapturePlan({ steps: [] }), /startUrl/);
  assert.throws(() => parseCapturePlan({ startUrl: "x", steps: [{ action: "jump" }] }), /unknown action jump/);
  assert.throws(() => parseCapturePlan({ startUrl: "x", steps: [{ action: "click" }] }), /click needs target/);
  assert.throws(() => parseCapturePlan({ startUrl: "x", steps: [{ action: "fill", target: "input" }] }), /fill needs value/);
  assert.throws(() => parseCapturePlan({ startUrl: "x", steps: [{ action: "drag", target: "a" }] }), /drag needs toward/);
  assert.equal(planSelector("text=Generate Video"), "::-p-text(Generate Video)");
  assert.equal(planSelector("text='Seedance 2.5'"), "::-p-text(Seedance 2.5)");
  assert.equal(planSelector("role=button[name='Images']"), '::-p-aria([name="Images"][role="button"])');
  assert.equal(planSelector("#go"), "#go");
});

async function replay(work: string, plan: CapturePlan, cursor: "none" | "page" = "none", scale = 1): Promise<CapturePlanReport> {
  let report: CapturePlanReport | undefined;
  await withCapture({ launch: { executablePath, defaultViewport: { width: 640, height: 480, deviceScaleFactor: scale } } },
    async (session) => { report = await runCapturePlan(session, plan, { directory: join(work, "take"), baseDirectory: work, cursor, fps: 30 }); });
  return report!;
}

/** Mean RGB of the frame at `seconds` in the recording. */
async function colorAt(video: string, seconds: number): Promise<number[]> {
  const { stdout } = await exec("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1",
    "-vf", "scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer" });
  return [...stdout.subarray(0, 3)];
}

// Scale 1 records through the screencast; scale 2 through repeated screenshots, which must not
// swallow the take's clicks and keys.
for (const scale of [1, 2]) test(`a plan replays real actions at scale ${scale}, reports their recorded time and target boxes, and leaves the footage clean`, {
  skip: ready, timeout: 60_000,
}, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-capture-plan-"));
  try {
    await writeFile(join(work, "page.html"), PAGE);
    const report = await replay(work, {
      startUrl: pathToFileURL(join(work, "page.html")).href, startUntil: "#go",
      steps: [
        { action: "dismiss" },
        { action: "pause", ms: 900 },
        { action: "click", target: "text=Show result", screenshot: true, name: "result" },
        { action: "fill", target: "#name", value: "Hypit" },
        { action: "wait", for: "text=echo:Hypit", note: "the old value was replaced, not appended" },
        { action: "fill", target: "#rich", value: "", note: "a rich editor is emptied, formatting included" },
        { action: "assert", target: "#rich:not(:has(b))", timeoutMs: 1000 },
        { action: "hover", target: "text=Delete project", note: "destructive: hover only" },
        { action: "click", target: "#missing-banner", optional: true, timeoutMs: 200 },
        { action: "scroll", dy: 600, durationMs: 300 },
        { action: "pause", ms: 700 },
      ],
    }, "none", scale);
    assert.equal(report.failed, null);
    assert.equal(report.steps.length, 11);
    const click = report.steps[2]!;
    assert.deepEqual(click.box, [40, 40, click.box![2], click.box![3]]);
    assert.ok(click.pointer, "pointer actions report where they acted");
    assert.equal(click.screenshot, "02-result.png");
    assert.ok(existsSync(join(work, "take", "screenshots", "02-result.png")));
    assert.ok(report.steps[8]!.skipped, "an optional missing target is skipped, not failed");
    const saved = JSON.parse(await readFile(join(work, "take", "steps.json"), "utf8")) as CapturePlanReport;
    assert.equal(saved.format, "hypit.capture-plan@1");
    assert.equal(saved.recording?.path, "recording.mp4", "saved evidence holds no machine-specific path");
    assert.doesNotMatch(JSON.stringify(saved), new RegExp(work.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.equal(saved.recording?.width, 640 * scale, "the recording keeps the device pixels");
    assert.equal(saved.recording?.frameRate, 30, "the recording is re-timed to a constant rate for media normalization");
    const recipe = await readFile(join(work, "take", "steps.svs"), "utf8");
    assert.match(recipe, /walkthrough\.take \{\s+passed: true;/u);
    assert.ok(recipe.includes(`"pointer":[${click.pointer!.join(",")}]`), "the Recipe carries what the composition draws from");
    assert.doesNotMatch(recipe, /"index":8/u, "skipped steps are left out");
    // Step times are on the recording's clock: the page is red before the click and blue after it.
    const video = join(work, "take", "recording.mp4");
    const before = await colorAt(video, Math.max(0, click.start - 0.4));
    const after = await colorAt(video, click.end + 0.3);
    assert.ok(before[0]! > 180 && before[2]! < 80, `before click ${before}`);
    assert.ok(after[2]! > 180 && after[0]! < 80, `after click ${after}`);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test("guarded clicks, ambiguous targets and reused output directories stop the take with evidence", {
  skip: ready, timeout: 60_000,
}, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-capture-plan-guard-"));
  try {
    await writeFile(join(work, "page.html"), PAGE);
    const startUrl = pathToFileURL(join(work, "page.html")).href;
    const guarded = await replay(work, { startUrl, steps: [{ action: "click", target: "text=Delete project" }] }, "page");
    assert.match(guarded.failed ?? "", /^steps\[0\]: GUARDED_ACTION/);
    assert.ok(existsSync(join(work, "take", "screenshots", "failed.png")));
    assert.ok(existsSync(join(work, "take", "recording.mp4")), "the partial take is kept for diagnosis");
    assert.match(await readFile(join(work, "take", "steps.svs"), "utf8"), /passed: false;/u);
    await assert.rejects(replay(work, { startUrl, steps: [] }), /must be new or empty/);
    await rm(join(work, "take"), { recursive: true });
    const ambiguous = await replay(work, { startUrl, steps: [{ action: "hover", target: ".twin" }] });
    assert.match(ambiguous.failed ?? "", /AMBIGUOUS_TARGET/);
    await rm(join(work, "take"), { recursive: true });
    const chosen = await replay(work, { startUrl, steps: [{ action: "hover", target: ".twin", index: 1 },
      { action: "click", target: "#go", asset: { attribute: "id", value: "other" } }] });
    assert.equal(chosen.steps[0]!.box?.[1], 340);
    assert.match(chosen.failed ?? "", /ASSET_IDENTITY_MISMATCH/);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test("exported login state restores cookies and origin storage, and the login check records only an account label", {
  skip: ready, timeout: 60_000,
}, async () => {
  const { createServer } = await import("node:http");
  const server = createServer((request, response) => {
    if (request.url === "/session") {
      const user = /session=ok/u.test(request.headers.cookie ?? "") ? { name: "Demo Account", token: "secret" } : null;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ user }));
      return;
    }
    response.setHeader("content-type", "text/html");
    response.end(`<p id="state"></p><script>document.getElementById('state').textContent =
      (document.cookie.includes('session=ok') ? 'cookie' : 'none') + ':' + (localStorage.getItem('theme') ?? 'none')</script>`);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const work = await mkdtemp(join(tmpdir(), "hypit-capture-plan-login-"));
  try {
    const statePath = join(work, "state.json");
    await writeFile(statePath, JSON.stringify({
      cookies: [{ name: "session", value: "ok", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
      origins: [{ origin, localStorage: [{ name: "theme", value: "dark" }] }],
    }));
    const plan: CapturePlan = { startUrl: `${origin}/`, loginCheck: `${origin}/session`,
      steps: [{ action: "wait", for: "text=cookie:dark" }] };
    let report: CapturePlanReport | undefined;
    await withCapture({ launch: { executablePath }, storageState: statePath },
      async (session) => { report = await runCapturePlan(session, plan, { directory: join(work, "take") }); });
    assert.equal(report!.failed, null);
    assert.deepEqual(report!.auth, { checked: `${origin}/session`, loggedIn: true, account: "Demo Account" });
    assert.doesNotMatch(await readFile(join(work, "take", "steps.json"), "utf8"), /secret/u);
    let anonymous: CapturePlanReport | undefined;
    await withCapture({ launch: { executablePath } },
      async (session) => { anonymous = await runCapturePlan(session, plan, { directory: join(work, "anonymous") }); });
    assert.match(anonymous!.failed ?? "", /login check failed/);
    assert.equal(anonymous!.recording, null, "nothing is recorded without a session");
  } finally {
    server.close();
    await rm(work, { recursive: true, force: true });
  }
});

test("prepare steps run before the recording, the page sees the plan's locale, and a glide scrolls the page past a carousel", {
  skip: ready, timeout: 60_000,
}, async () => {
  const work = await mkdtemp(join(tmpdir(), "hypit-capture-plan-prepare-"));
  try {
    await writeFile(join(work, "page.html"), `<style>body{margin:0;height:3000px;background:#ff0000}
      #rail{position:absolute;top:150px;left:0;width:640px;overflow-x:auto;white-space:nowrap}
      #rail div{display:inline-block;width:400px;height:200px;background:#333}</style>
      <button id="warm" onclick="document.body.style.background='#0000ff'">Warm</button><p id="lang"></p>
      <div id="rail"><div></div><div></div><div></div></div>
      <script>document.getElementById('lang').textContent='lang:'+navigator.language</script>`);
    const report = await replay(work, { startUrl: "./page.html", locale: "fr-FR",
      prepare: [{ action: "click", target: "#warm" }],
      steps: [{ action: "wait", for: "text=lang:fr-FR" }, { action: "scroll", dy: 900, durationMs: 300 }, { action: "pause", ms: 300 }] });
    assert.equal(report.failed, null);
    assert.deepEqual(report.steps.map((step) => step.action), ["wait", "scroll", "pause"], "prepare steps are not part of the take");
    const first = await colorAt(join(work, "take", "recording.mp4"), 0);
    assert.ok(first[0]! < 60 && first[2]! > 3 * first[0]!, `the take starts in the prepared state ${first}`);
    // The pointer starts over the horizontal rail; the page, not the rail, must move, leaving only blue.
    const last = await colorAt(join(work, "take", "recording.mp4"), report.recording!.duration! - 0.2);
    assert.ok(last[2]! > 220, `the page scrolled past the rail ${last}`);
    assert.throws(() => parseCapturePlan({ startUrl: "x", locale: "not a tag", steps: [] }), /language tag/);
  } finally { await rm(work, { recursive: true, force: true }); }
});
