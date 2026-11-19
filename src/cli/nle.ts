import { access, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { NleStudioActionObservation, NleStudioActionRequest, NleStudioObservation } from "@hypit/nle-studio/protocol";
import type { LocalHostClient } from "./client.js";
import { readJsonInput, type CliResult } from "./io.js";
import { openBrowser } from "./terminal.js";

export async function projectRoot(start: string): Promise<string> {
  let path = await realpath(start);
  for (;;) {
    try { await access(resolve(path, "hypit.project.json")); return path; }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const parent = dirname(path);
    if (parent === path) throw new Error(`No Hypit project contains ${start}.`);
    path = parent;
  }
}

function projectPath(root: string, path: string) {
  const child = relative(root, resolve(root, path));
  if (child === "" || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error("Choose a file inside the selected Project Boundary.");
  }
  return child.split(sep).join("/");
}

export async function nleCommand(host: LocalHostClient, action: string, document: string, options: {
  readonly project?: string; readonly view?: string; readonly to?: string; readonly profile?: string;
  readonly noOpen?: boolean; readonly progress: boolean;
}, signal: AbortSignal): Promise<CliResult> {
  const documentPath = await realpath(resolve(options.project ?? process.cwd(), document));
  const root = options.project === undefined ? await projectRoot(dirname(documentPath)) : await realpath(options.project);
  const project = await host.openProject(root, signal);
  const { nleStudioProduct } = await import("@hypit/nle-studio");
  let session: { readonly handle: string; readonly project: string; readonly url: string } | undefined;
  let visual = false;
  try {
    const input = { document: projectPath(root, documentPath),
      ...(options.view === undefined ? {} : { viewDocument: projectPath(root, options.view) }) };
    session = await host.request("/api/application/sessions", {
      method: "POST", body: { project: project.handle, product: nleStudioProduct, input, browser: action === "open" }, signal,
    });
    const routes = new URL("api/", session!.url).pathname;
    if (action === "open") {
      if (!options.noOpen) openBrowser(session!.url);
      visual = true;
      return { value: session, text: session!.url };
    }
    const observation = await host.request<NleStudioObservation>(routes + "observe", {
      method: "POST", body: { kind: "open" }, signal,
    });
    if (observation.kind !== "open") throw new Error("NLE Host returned an unexpected observation.");
    const { value } = observation;
    if (action === "inspect") {
      const { project, status, timeline } = value;
      return { value: { project, status, timeline }, text: `${project.document}  revision ${status.projectRevision}`
        + (status.projectDirty ? " (unsaved)" : "") + `\n${timeline.scene.tracks.length} tracks · ${timeline.scene.maximumFrame} frames` };
    }
    if (options.to === undefined) throw new Error("nle export requires --to.");
    const { width, height } = value.canvas.canvas;
    const profile = options.profile === undefined ? {
      picture: { width, height, frameRate: value.timeline.scene.editRate, background: "#000000", quality: "standard" as const },
      audio: { channels: 2 as const, sampleRate: 48_000 },
    } : await readJsonInput(options.profile) as Extract<NleStudioActionRequest, { kind: "delivery" }>["profile"];
    const destination = projectPath(root, options.to);
    const request: NleStudioActionRequest = { kind: "delivery", destination, profile, expectedProjectRevision: value.status.projectRevision };
    let progress = await host.request<NleStudioActionObservation>(routes + "actions", { method: "POST", body: request, signal });
    let previous: number | undefined;
    const actionPath = routes + `actions/${encodeURIComponent(progress.handle)}`;
    while (progress.state === "queued" || progress.state === "running") {
      const percent = Math.floor(progress.progress * 100);
      if (options.progress && percent !== previous) process.stderr.write(`Export ${percent}%\n`);
      previous = percent;
      await delay(300, undefined, { signal });
      progress = await host.request<NleStudioActionObservation>(actionPath, { signal });
    }
    if (progress.state === "failed") throw new Error(progress.diagnostic);
    if (progress.state !== "complete") throw new Error("NLE export was cancelled.");
    return {
      value: { destination, revision: value.status.projectRevision, unsaved: value.status.projectDirty,
        mediaType: progress.result.mediaType, ...(progress.result.frameCount === undefined ? {} : { frameCount: progress.result.frameCount }) },
      text: `Exported ${destination} from revision ${value.status.projectRevision}${value.status.projectDirty ? " (unsaved)" : ""}.`,
    };
  } finally {
    try {
      if (session !== undefined && !visual) await host.request(`/api/application/sessions/${encodeURIComponent(session.handle)}`, { method: "DELETE" });
    } finally {
      await host.closeProject(project.handle);
    }
  }
}
