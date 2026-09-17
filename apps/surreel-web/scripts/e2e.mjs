#!/usr/bin/env node
const base = process.env.SURREEL_E2E_URL ?? "https://studio.getvideos.app";
const source = process.env.SURREEL_E2E_URL_PAGE ?? "https://unbrowse.ai/";
const timeoutMs = Number(process.env.SURREEL_E2E_TIMEOUT_MS ?? 12 * 60 * 1000);
const pollMs = 4000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function api(method, path, body) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    fail(`${method} /api/${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) fail(`${method} /api/${path} ${response.status}: ${json.error ?? text.slice(0, 200)}`);
  return json;
}

const health = await api("GET", "health");
if (health.status !== "ok" || health.browser !== "Browser Use" || !health.agentAvailable) {
  fail(`health not ready: ${JSON.stringify(health)}`);
}
console.log("health", health.browser, health.agent);

const prompt = [
  "Produce this video with Hypit.",
  "Format: Talking-head UGC",
  "Playbook: references/playbooks/formats/talking-head.md",
  "Crafts: image-direction, voice-direction, video-direction, captions.",
  "Surreel still packs: gpt-image-people, ugc-realistic.",
  "Surreel motion packs: ugc-realistic, ugc-ad-formats.",
  "Open those packs and run every listed craft.",
  "Captions are Hypit caption craft on the finished plate. Do not burn type in Seedance.",
  `Source URL: ${source}`,
  "Fetch this page first. Use only facts from the explored brief.",
  "Deliver a 15-second 9:16 video.",
].join("\n");

const created = await api("POST", "projects", {
  title: "e2e unbrowse talking-head",
  prompt,
  aspectRatio: "9:16",
  duration: 15,
  style: "Talking-head UGC",
  format: "talking-head",
  referenceUrl: source,
});
const id = created.project?.id;
if (!id) fail("create did not return a project id");
const running = await api("POST", `projects/${id}/runs`, {});
console.log("queued", id, running.project?.status);

const started = Date.now();
let project = running.project;
while (Date.now() - started < timeoutMs) {
  const latest = await api("GET", `projects/${id}`);
  project = latest.project;
  const last = project.events?.[0]?.message ?? "";
  console.log(project.status, last);
  if (project.status === "completed" || project.status === "failed" || project.status === "cancelled") break;
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

const events = (project.events ?? []).map((item) => item.message);
const joined = events.join("\n");
if (project.status !== "completed") {
  fail(`e2e ended ${project.status}: ${project.error ?? events[0] ?? "no error"}`);
}
if (!joined.includes("Browser Use")) fail(`e2e completed without a Browser Use explore event:\n${joined}`);
if (!/Opened .+ for the still/.test(joined)) fail(`e2e completed without a skill consult:\n${joined}`);
const video = (project.artifacts ?? []).find((item) => String(item.mimeType ?? "").startsWith("video/"));
if (!video) fail("e2e completed without a video artifact");
const media = await fetch(`${base}${video.url}`, { method: "HEAD" });
if (!media.ok) fail(`video artifact HEAD ${media.status}`);
console.log("e2e ok", id, video.url);
