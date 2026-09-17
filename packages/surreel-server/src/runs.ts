import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { AgentRunner } from "./runner.js";
import type { ServerConfig } from "./config.js";
import type { Project } from "./types.js";
import { collectArtifacts } from "./artifacts.js";
import { event, ProjectStore } from "./store.js";
import { ensureProjectDirectory } from "./project-files.js";

export class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Keep stored run failures readable. Raw provider text stays in the server log. */
export function publicRunError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("insufficient_credits") || lower.includes("exceeds available balance")) {
    return "The production agent is out of credits. Top up Codegraff, then retry this brief.";
  }
  return message;
}

type ActiveRun = { controller: AbortController; done?: Promise<void>; timedOut: boolean };

export class ProjectRuns {
  private readonly active = new Map<string, ActiveRun>();
  constructor(private readonly store: ProjectStore, private readonly runner: AgentRunner, private readonly config: ServerConfig) {}

  async start(id: string, prompt?: string): Promise<Project> {
    if (this.active.has(id)) throw new RequestError(409, "A run is already active for this project.");
    if (this.active.size >= this.config.maxConcurrentRuns) throw new RequestError(429, "All agent slots are busy. Wait for a running project to finish.");
    const active: ActiveRun = { controller: new AbortController(), timedOut: false };
    // Reserve synchronously before any I/O, so two HTTP requests cannot launch the same project.
    this.active.set(id, active);
    try {
      const current = await this.store.get(id);
      if (!current) throw new RequestError(404, "Project not found.");
      if (!(await this.runner.available())) throw new RequestError(503, "Codegraff is unavailable. Check the server's agent configuration.");
      const queued = await this.store.update(id, (project) => {
        const { error: _error, ...rest } = project;
        return event({ ...rest, status: "queued" }, "queued", "Your video is queued for the production agent.");
      });
      active.done = new Promise<void>((resolve) => setImmediate(resolve)).then(() => this.execute(id, active, prompt)).catch((error: unknown) => {
        console.error("Surreel could not persist a run update:", error instanceof Error ? error.message : String(error));
      }).finally(() => this.active.delete(id));
      return queued;
    } catch (error) {
      this.active.delete(id);
      throw error;
    }
  }

  private async execute(id: string, active: ActiveRun, prompt?: string): Promise<void> {
    const timer = setTimeout(() => {
      active.timedOut = true;
      active.controller.abort(new Error("The production run exceeded its configured time limit."));
    }, this.config.maxRunMs);
    timer.unref();
    try {
      active.controller.signal.throwIfAborted();
      const project = await this.store.update(id, (value) => event({ ...value, status: "running" }, "running", "The agent is creating your video."));
      const workspace = this.store.workspacePath(id);
      const outputDir = join(workspace, "outputs", randomUUID());
      await ensureProjectDirectory(workspace, outputDir);
      await this.runner.run({
        project, workspace, outputDir, signal: active.controller.signal,
        ...(prompt === undefined ? {} : { prompt }),
        emit: async (type, message) => {
          if (!active.controller.signal.aborted) await this.store.update(id, (value) =>
            value.status === "running" ? event(value, type, message) : value);
        },
      });
      active.controller.signal.throwIfAborted();
      const artifacts = await collectArtifacts(this.config.projectsDir, id, outputDir);
      active.controller.signal.throwIfAborted();
      await this.store.update(id, (value) => value.status === "cancelled" ? value
        : event({ ...value, status: "completed", review: "inbox", artifacts: [...value.artifacts, ...artifacts] }, "completed", "Your video is ready to review and download."));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.update(id, (value) => {
        if (value.status === "cancelled") return value;
        if (active.controller.signal.aborted && !active.timedOut) {
          return event({ ...value, status: "cancelled" }, "cancelled", "The production run was cancelled.");
        }
        const failure = publicRunError(active.timedOut
          ? "The production run exceeded its configured time limit. You can try again with a shorter brief."
          : message);
        return event({ ...value, status: "failed", error: failure.slice(0, 4000) }, "error", failure);
      });
    } finally { clearTimeout(timer); }
  }

  async cancel(id: string): Promise<Project> {
    const current = await this.store.get(id);
    if (!current) throw new RequestError(404, "Project not found.");
    const active = this.active.get(id);
    if (!active) return current;
    active.controller.abort(new Error("Cancelled by the user."));
    return this.store.update(id, (value) => event({ ...value, status: "cancelled" }, "cancelled", "Cancellation requested. The agent is stopping."));
  }

  async close(): Promise<void> {
    for (const active of this.active.values()) active.controller.abort(new Error("The server is shutting down."));
    await Promise.all([...this.active.values()].map((active) => active.done));
  }
}
