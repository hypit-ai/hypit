import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "../src/config.js";
import type { ServerConfig } from "../src/config.js";
import { createSurreelServer } from "../src/server.js";
import type { AgentRunner, RunnerInput } from "../src/runner.js";
import { publicRunError } from "../src/runs.js";
import type { Project } from "../src/types.js";

const brief = { prompt: "Make an original launch film about a ceramic lamp.", aspectRatio: "9:16", duration: 15, style: "Editorial" };
const unavailable: AgentRunner = { available: async () => false, run: async () => { throw new Error("Must not run"); } };

async function setup(t: TestContext, runner: AgentRunner = unavailable, overrides: Partial<ServerConfig> = {}) {
  const root = await mkdtemp(join(tmpdir(), "surreel-http-"));
  const config = { ...loadConfig({ SURREEL_PROJECTS_DIR: root }), ...overrides };
  const app = await createSurreelServer({ config, runner });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  const request = (path: string, method = "GET", data?: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
    method, headers: { ...(config.sessionToken ? { authorization: `Bearer ${config.sessionToken}` } : {}),
      ...(data === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const create = async () => {
    const response = await request("/api/projects", "POST", brief);
    assert.equal(response.status, 201);
    return ((await response.json()) as { project: Project }).project;
  };
  return { ...app, root, config, base, request, create };
}

async function waitFor(read: () => Promise<Project | undefined>, status: Project["status"]): Promise<Project> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const project = await read();
    if (project?.status === status) return project;
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${status}.`);
}

test("provider credit errors are rewritten for the project record", () => {
  assert.equal(
    publicRunError("codegraff api error [insufficient_credits]: Estimated turn cost ~5343877 micro-USD exceeds available balance."),
    "The production agent is out of credits. Top up Codegraff, then retry this brief.",
  );
  assert.equal(publicRunError("The selected video provider is not configured."), "The selected video provider is not configured.");
});

test("the API creates persisted drafts and reports actual agent availability", async (t) => {
  const app = await setup(t);
  const health = await app.request("/api/health");
  assert.deepEqual(await health.json(), { status: "ok", agentAvailable: false, agent: "Codegraff", sdkVersion: "0.4.2",
    authentication: "managed-by-codegraff", trustLocalAgent: false });
  const project = await app.create();
  assert.equal(project.status, "draft");
  assert.equal(project.title, "Make an original launch film about a ceramic lamp");
  assert.equal(project.prompt, brief.prompt);
  assert.equal(project.format, undefined);
  assert.deepEqual(((await (await app.request("/api/projects")).json()) as { projects: Project[] }).projects, [project]);
  assert.deepEqual(((await (await app.request(`/api/projects/${project.id}`)).json()) as { project: Project }).project, project);
  const formatted = await app.request("/api/projects", "POST", { ...brief, format: "talking-head", style: "Talking-head UGC" });
  assert.equal(formatted.status, 201);
  assert.equal(((await formatted.json()) as { project: Project }).project.format, "talking-head");
  assert.equal((await app.request(`/api/projects/${randomUUID()}`)).status, 404);
  assert.equal((await app.request(`/api/projects/${project.id}/runs`, "POST", {})).status, 503);
  assert.equal((await app.store.get(project.id))?.status, "draft");
});

test("validation rejects oversized bodies, invalid briefs, and unsupported media requests", async (t) => {
  const app = await setup(t);
  for (const data of [[], { ...brief, prompt: " " }, { ...brief, duration: 2 }, { ...brief, duration: 9.5 },
    { ...brief, aspectRatio: "4:3" }, { ...brief, referenceUrl: "file:///etc/passwd" },
    { ...brief, referenceUrl: "https://user:password@example.com/video" },
    { ...brief, format: "not-a-format" }]) {
    const response = await app.request("/api/projects", "POST", data);
    assert.equal(response.status, 400);
    assert.equal(typeof ((await response.json()) as { error: string }).error, "string");
  }
  assert.equal((await app.request("/api/projects", "POST", { ...brief, prompt: "x".repeat(40_000) })).status, 413);
  assert.equal((await fetch(app.base + "/api/projects", { method: "POST", body: "hello" })).status, 415);
  assert.equal((await fetch(app.base + "/api/projects", { method: "POST", body: "{", headers: { "content-type": "application/json" } })).status, 400);
});

test("exact browser origins and bearer tokens protect project data", async (t) => {
  const app = await setup(t, unavailable, { sessionToken: "test-token-with-at-least-24-characters" });
  assert.equal((await fetch(app.base + "/api/health")).status, 401);
  assert.equal((await app.request("/api/health", "GET", undefined, { origin: "https://untrusted.example" })).status, 403);
  assert.equal((await app.request("/api/health", "GET", undefined, { origin: "http://localhost:8080" })).status, 200);
  const preflight = await fetch(app.base + "/api/projects", { method: "OPTIONS", headers: {
    origin: "http://localhost:8080", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type",
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:8080");
  assert.equal((await app.request("/api/health", "GET", undefined, { authorization: "Bearer wrong" })).status, 401);
  assert.equal((await fetch(app.base + "/api/health", { headers: { origin: new URL(app.base).origin } })).status, 200);
});

test("only one run starts per project and cancellation cannot become completion", async (t) => {
  let calls = 0;
  let release: (() => void) | undefined;
  let captured: RunnerInput | undefined;
  const runner: AgentRunner = {
    available: async () => true,
    async run(input) {
      calls++;
      captured = input;
      await input.emit("message", "Planning the opening shot.");
      await new Promise<void>((resolve) => { release = resolve; });
    },
  };
  const app = await setup(t, runner);
  t.after(() => release?.());
  const project = await app.create();
  const responses = await Promise.all([app.request(`/api/projects/${project.id}/runs`, "POST", {}), app.request(`/api/projects/${project.id}/runs`, "POST", {})]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [202, 409]);
  await waitFor(() => app.store.get(project.id), "running");
  for (let attempts = 0; !captured && attempts < 100; attempts++) await delay(5);
  assert.equal(calls, 1);
  assert.ok(captured);
  const cancel = await app.request(`/api/projects/${project.id}/cancel`, "POST", {});
  assert.equal(cancel.status, 200);
  assert.equal(captured.signal.aborted, true);
  assert.equal((await app.store.get(project.id))?.status, "cancelled");
  release?.();
  await delay(30);
  assert.equal((await app.store.get(project.id))?.status, "cancelled");
  assert.ok((await app.store.get(project.id))?.events.some((event) => event.message === "Planning the opening shot."));
});

test("runner errors reach the project and a later run can retry", async (t) => {
  let calls = 0;
  const runner: AgentRunner = { available: async () => true, async run() { calls++; throw new Error("The selected video provider is not configured."); } };
  const app = await setup(t, runner);
  const project = await app.create();
  assert.equal((await app.request(`/api/projects/${project.id}/runs`, "POST", {})).status, 202);
  const failed = await waitFor(() => app.store.get(project.id), "failed");
  assert.match(failed.error!, /provider is not configured/);
  for (let attempt = 0; attempt < 100; attempt++) {
    const retry = await app.request(`/api/projects/${project.id}/runs`, "POST", { prompt: "Use typography and deterministic graphics." });
    if (retry.status === 202) break;
    assert.equal(retry.status, 409);
    await delay(5);
  }
  await waitFor(() => app.store.get(project.id), "failed");
  assert.equal(calls, 2);
});

test("a successful SDK turn without actual declared output remains a failed production", async (t) => {
  const app = await setup(t, { available: async () => true, run: async () => undefined });
  const project = await app.create();
  await app.request(`/api/projects/${project.id}/runs`, "POST", {});
  const failed = await waitFor(() => app.store.get(project.id), "failed");
  assert.equal(failed.artifacts.length, 0);
  assert.ok(failed.error);
});

test("a run deadline aborts the runner and records failure rather than user cancellation", async (t) => {
  let wasAborted = false;
  const runner: AgentRunner = { available: async () => true, async run(input) {
    await new Promise<void>((_resolve, reject) => {
      input.signal.addEventListener("abort", () => { wasAborted = true; reject(input.signal.reason); }, { once: true });
    });
  } };
  const app = await setup(t, runner, { maxRunMs: 40 });
  const project = await app.create();
  await app.request(`/api/projects/${project.id}/runs`, "POST", {});
  const failed = await waitFor(() => app.store.get(project.id), "failed");
  assert.match(failed.error!, /time limit/);
  assert.equal(wasAborted, true);
});

test("artifact-specific signed URLs allow playback without granting project access", async (t) => {
  const app = await setup(t, unavailable, { sessionToken: "test-token-with-at-least-24-characters" });
  const project = await app.create();
  const artifactId = randomUUID();
  const exportDir = join(app.root, "exports", project.id);
  await mkdir(exportDir, { recursive: true });
  // This test exercises already-published byte serving; collection/codec verification has separate tests.
  await writeFile(join(exportDir, `${artifactId}.mp4`), "0123456789");
  await app.store.update(project.id, (value) => ({ ...value, artifacts: [{ id: artifactId, name: "Review video.mp4",
    mimeType: "video/mp4", url: `/api/projects/${project.id}/artifacts/${artifactId}` }] }));
  const response = await app.request(`/api/projects/${project.id}`);
  const published = ((await response.json()) as { project: Project }).project;
  const url = published.artifacts[0]!.url;
  assert.match(url, /\?access=/);
  const media = await fetch(app.base + url, { headers: { range: "bytes=2-5" } });
  assert.equal(media.status, 206);
  assert.equal(media.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await media.text(), "2345");
  assert.equal((await fetch(`${app.base}/api/projects/${project.id}?${url.split("?")[1]}`)).status, 401);
  assert.equal((await fetch(app.base + url, { method: "POST" })).status, 401);
  assert.equal((await fetch(app.base + url.replace(artifactId, randomUUID()))).status, 401);
});

test("an explicitly configured Flutter build serves on the API origin", async (t) => {
  const web = await mkdtemp(join(tmpdir(), "surreel-web-"));
  t.after(() => rm(web, { recursive: true, force: true }));
  await writeFile(join(web, "index.html"), "<!doctype html><title>Surreel</title>");
  await writeFile(join(web, "main.dart.js"), "window.surreel = true;");
  const app = await setup(t, unavailable, { webDir: web });
  assert.match(await (await fetch(app.base + "/")).text(), /Surreel/);
  assert.match(await (await fetch(app.base + "/project/123")).text(), /Surreel/);
  assert.match((await fetch(app.base + "/main.dart.js")).headers.get("content-type")!, /javascript/);
  assert.equal((await fetch(app.base + "/missing.js")).status, 404);
  assert.equal((await fetch(app.base + "/api/missing")).status, 404);
});

test("retrying a project with a linked output directory fails before launching an agent", { skip: process.platform === "win32" }, async (t) => {
  let calls = 0;
  const app = await setup(t, { available: async () => true, run: async () => { calls++; } });
  const project = await app.create();
  const outside = join(app.root, "outside");
  await mkdir(outside);
  await symlink(outside, join(app.store.workspacePath(project.id), "outputs"));
  await app.request(`/api/projects/${project.id}/runs`, "POST", {});
  const failed = await waitFor(() => app.store.get(project.id), "failed");
  assert.match(failed.error!, /symbolic link/);
  assert.equal(calls, 0);
  assert.deepEqual(await readdir(outside), []);
});

test("published videos survive failed and cancelled revisions and successful revisions append outputs", {
  skip: spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status !== 0,
}, async (t) => {
  let behavior: "fail" | "wait" | "succeed" = "fail";
  let activeSignal: AbortSignal | undefined;
  // Genuine single-frame VP8/WebM; no generation provider or model is used.
  const video = Buffer.from("GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHLTbuMU6uEElTDZ1OsggEY7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmpSrXsYMPQkBNgIxMYXZmNjEuNy4xMDBXQYxMYXZmNjEuNy4xMDAWVK5ryK4BAAAAAAAAP9eBAXPFiNtN4AYzUKSynIEAIrWcg3VuZIiBAIaFVl9WUDiDgQEj44OEAmJaAOCQsIEQuoEQmoECVbCEVbmBARJUw2fXc3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS43LjEwMHNzsmPAi2PFiNtN4AYzUKSyZ8ihRaOHRU5DT0RFUkSHlExhdmM2MS4xOS4xMDEgbGlidnB4H0O2dajngQCjo4EAAIAQAgCdASoQABAAAEcIhYWIhYSIAgIADA1gAP7/q1CA", "base64");
  const runner: AgentRunner = { available: async () => true, async run(input) {
    activeSignal = input.signal;
    if (behavior === "fail") throw new Error("Revision render failed.");
    if (behavior === "wait") {
      await new Promise<void>((resolve) => input.signal.addEventListener("abort", () => resolve(), { once: true }));
      return;
    }
    await writeFile(join(input.outputDir, "revised.webm"), video);
    await writeFile(join(input.outputDir, "surreel-output.json"), JSON.stringify({ artifacts: [{ path: "revised.webm", name: "Second version" }] }));
  } };
  const app = await setup(t, runner, { sessionToken: "version-regression-session-token-24" });
  const project = await app.create();
  const oldId = randomUUID();
  await mkdir(join(app.root, "exports", project.id), { recursive: true });
  await writeFile(join(app.root, "exports", project.id, `${oldId}.webm`), video);
  await app.store.update(project.id, (value) => ({ ...value, status: "completed", artifacts: [{
    id: oldId, name: "First version", mimeType: "video/webm", url: `/api/projects/${project.id}/artifacts/${oldId}`,
  }] }));
  const saved = ((await (await app.request(`/api/projects/${project.id}`)).json()) as { project: Project }).project;
  const oldUrl = saved.artifacts[0]!.url;
  const assertOldAvailable = async () => {
    const response = await fetch(app.base + oldUrl);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), video);
  };
  const start = async () => {
    for (let attempts = 0; attempts < 100; attempts++) {
      const response = await app.request(`/api/projects/${project.id}/runs`, "POST", { prompt: "Please refine the opening shot." });
      if (response.status === 202) {
        assert.equal(((await response.json()) as { project: Project }).project.artifacts[0]!.id, oldId);
        return;
      }
      assert.equal(response.status, 409);
      await delay(5);
    }
    throw new Error("Revision did not start.");
  };
  await start();
  await assertOldAvailable();
  await waitFor(() => app.store.get(project.id), "failed");
  await assertOldAvailable();
  behavior = "wait";
  activeSignal = undefined;
  await start();
  await waitFor(() => app.store.get(project.id), "running");
  while (!activeSignal) await delay(5);
  await assertOldAvailable();
  await app.request(`/api/projects/${project.id}/cancel`, "POST", {});
  await waitFor(() => app.store.get(project.id), "cancelled");
  await assertOldAvailable();
  behavior = "succeed";
  await start();
  const finished = await waitFor(() => app.store.get(project.id), "completed");
  assert.equal(finished.artifacts.length, 2);
  assert.equal(finished.artifacts[0]!.id, oldId);
  assert.notEqual(finished.artifacts[1]!.id, oldId);
  assert.equal(finished.artifacts[1]!.name, "Second version");
  await assertOldAvailable();
});

test("review patch keeps, skips, and marks a finished video sent", async (t) => {
  const app = await setup(t);
  const project = await app.create();
  const artifactId = randomUUID();
  await mkdir(join(app.root, "exports", project.id), { recursive: true });
  await writeFile(join(app.root, "exports", project.id, `${artifactId}.mp4`), "video");
  await app.store.update(project.id, (value) => ({
    ...value,
    status: "completed",
    artifacts: [{
      id: artifactId,
      name: "Review video.mp4",
      mimeType: "video/mp4",
      url: `/api/projects/${project.id}/artifacts/${artifactId}`,
    }],
  }));
  assert.equal((await app.request(`/api/projects/${project.id}`, "PATCH", { review: "approved" })).status, 200);
  const approved = ((await (await app.request(`/api/projects/${project.id}`)).json()) as { project: Project }).project;
  assert.equal(approved.review, "approved");
  assert.equal((await app.request(`/api/projects/${project.id}`, "PATCH", { review: "sent" })).status, 400);
  assert.equal((await app.request(`/api/projects/${project.id}`, "PATCH", { review: "sent", destinations: ["tiktok"] })).status, 200);
  const sent = ((await (await app.request(`/api/projects/${project.id}`)).json()) as { project: Project }).project;
  assert.equal(sent.review, "sent");
  assert.deepEqual(sent.destinations, ["tiktok"]);
  const draft = await app.create();
  assert.equal((await app.request(`/api/projects/${draft.id}`, "PATCH", { review: "approved" })).status, 409);
});
