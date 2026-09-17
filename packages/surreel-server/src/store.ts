import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, rmdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Artifact, AspectRatio, Project, ProjectEvent, ProjectInput, ProjectStatus, ReviewState, SocialDestination } from "./types.js";
import { SOCIAL_DESTINATIONS } from "./types.js";

const MAX_EVENTS = 300;
const MAX_EVENT_MESSAGE_LENGTH = 4_000;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RESTART_MESSAGE = "The server restarted before this run finished. Start the project again to retry.";

export class ProjectMetadataError extends Error {
  constructor(id: string, reason: string, cause?: unknown) {
    super(`Invalid project metadata for ${id}: ${reason}`, { cause });
    this.name = "ProjectMetadataError";
  }
}

function validateId(id: string): void {
  if (!UUID.test(id)) throw new Error("Project ID must be a UUID.");
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim())) {
    throw new Error(`${name} must be ${allowEmpty ? "a" : "a nonempty"} string of at most ${maximum} characters.`);
  }
  return value;
}

function timestamp(value: unknown, name: string): string {
  const result = text(value, name, 40);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) {
    throw new Error(`${name} must be an ISO timestamp.`);
  }
  return result;
}

function readEvent(value: unknown): ProjectEvent {
  const item = record(value, "event");
  const id = text(item.id, "event.id", 36);
  validateId(id);
  return {
    id,
    type: text(item.type, "event.type", 100),
    message: text(item.message, "event.message", MAX_EVENT_MESSAGE_LENGTH, true),
    createdAt: timestamp(item.createdAt, "event.createdAt"),
  };
}

function readArtifact(value: unknown): Artifact {
  const item = record(value, "artifact");
  return {
    id: text(item.id, "artifact.id", 1_000),
    name: text(item.name, "artifact.name", 1_000),
    url: text(item.url, "artifact.url", 16_384),
    mimeType: text(item.mimeType, "artifact.mimeType", 512),
  };
}

function readProject(value: unknown, expectedId: string): Project {
  const item = record(value, "project");
  if (item.id !== expectedId) throw new Error("The project ID does not match its filename.");
  const aspectRatio = item.aspectRatio;
  if (aspectRatio !== "9:16" && aspectRatio !== "16:9" && aspectRatio !== "1:1") {
    throw new Error("Unknown aspect ratio.");
  }
  const status = item.status;
  if (status !== "draft" && status !== "queued" && status !== "running" && status !== "completed"
    && status !== "failed" && status !== "cancelled") {
    throw new Error("Unknown project status.");
  }
  if (typeof item.duration !== "number" || !Number.isFinite(item.duration) || item.duration <= 0 || item.duration > 3_600) {
    throw new Error("Project duration must be greater than zero and at most 3,600 seconds.");
  }
  if (!Array.isArray(item.events) || item.events.length > MAX_EVENTS) {
    throw new Error(`Project events must be an array of at most ${MAX_EVENTS} entries.`);
  }
  if (!Array.isArray(item.artifacts) || item.artifacts.length > 500) {
    throw new Error("Project artifacts must be an array of at most 500 entries.");
  }
  const review = item.review === undefined && status === "completed"
    ? "inbox"
    : item.review === undefined
      ? undefined
      : readReview(item.review);
  const destinations = item.destinations === undefined ? undefined : readDestinations(item.destinations);
  return {
    id: expectedId,
    title: text(item.title, "project.title", 1_000),
    prompt: text(item.prompt, "project.prompt", 100_000),
    aspectRatio: aspectRatio satisfies AspectRatio,
    duration: item.duration,
    style: text(item.style, "project.style", 1_000),
    ...(item.format === undefined ? {} : { format: text(item.format, "project.format", 80) }),
    ...(item.referenceUrl === undefined ? {} : { referenceUrl: text(item.referenceUrl, "project.referenceUrl", 16_384) }),
    status: status satisfies ProjectStatus,
    createdAt: timestamp(item.createdAt, "project.createdAt"),
    updatedAt: timestamp(item.updatedAt, "project.updatedAt"),
    events: item.events.map(readEvent),
    artifacts: item.artifacts.map(readArtifact),
    ...(item.error === undefined ? {} : { error: text(item.error, "project.error", 16_000, true) }),
    ...(review === undefined ? {} : { review }),
    ...(destinations === undefined ? {} : { destinations }),
  };
}

function readReview(value: unknown): ReviewState {
  if (value !== "inbox" && value !== "approved" && value !== "rejected" && value !== "sent") {
    throw new Error("Unknown review state.");
  }
  return value;
}

function readDestinations(value: unknown): SocialDestination[] {
  if (!Array.isArray(value) || value.length > SOCIAL_DESTINATIONS.length) {
    throw new Error("Project destinations must be a short list of social apps.");
  }
  return value.map((item) => {
    if (!SOCIAL_DESTINATIONS.includes(item as SocialDestination)) {
      throw new Error("Unknown social destination.");
    }
    return item as SocialDestination;
  });
}

/** Return a project with a bounded progress event. Persist it with ProjectStore.update. */
export function event(project: Project, type: string, message: string): Project {
  const createdAt = new Date().toISOString();
  return {
    ...project,
    updatedAt: createdAt,
    events: [
      ...project.events,
      { id: randomUUID(), type, message: message.slice(0, MAX_EVENT_MESSAGE_LENGTH), createdAt },
    ].slice(-MAX_EVENTS),
  };
}

/** One server process owns a store; metadata is never placed inside an agent workspace. */
export class ProjectStore {
  readonly root: string;
  readonly #metadataRoot: string;
  readonly #workspaceRoot: string;
  readonly #updates = new Map<string, Promise<void>>();
  #initialization: Promise<void> | undefined;

  constructor(root: string) {
    this.root = resolve(root);
    this.#metadataRoot = join(this.root, "meta");
    this.#workspaceRoot = join(this.root, "workspaces");
  }

  initialize(): Promise<void> {
    this.#initialization ??= this.#prepare().catch((error: unknown) => {
      this.#initialization = undefined;
      throw error;
    });
    return this.#initialization;
  }

  workspacePath(id: string): string {
    validateId(id);
    return join(this.#workspaceRoot, id);
  }

  async create(input: ProjectInput): Promise<Project> {
    await this.initialize();
    const id = randomUUID();
    const now = new Date().toISOString();
    const project = readProject({
      ...input,
      id,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      events: [],
      artifacts: [],
    }, id);
    const workspace = this.workspacePath(id);
    await mkdir(workspace, { mode: 0o700 });
    try {
      await this.#write(project);
    } catch (error) {
      // Only the empty directory created above can be removed here.
      await rmdir(workspace).catch(() => undefined);
      throw error;
    }
    return project;
  }

  async list(): Promise<Project[]> {
    await this.initialize();
    const projects: Project[] = [];
    for (const id of await this.#ids()) {
      try {
        const project = await this.#read(id);
        if (project) projects.push(project);
      } catch (error) {
        if (!(error instanceof ProjectMetadataError)) throw error;
      }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<Project | undefined> {
    validateId(id);
    await this.initialize();
    return this.#read(id);
  }

  async update(id: string, updater: (project: Project) => Project): Promise<Project> {
    validateId(id);
    await this.initialize();
    return this.#serialize(id, async () => {
      const current = await this.#read(id);
      if (!current) throw new Error(`Project ${id} was not found.`);
      const next = updater(structuredClone(current));
      if (next.id !== current.id || next.createdAt !== current.createdAt) {
        throw new Error("A project update cannot change its ID or creation time.");
      }
      const project = readProject({
        ...next,
        updatedAt: new Date().toISOString(),
        events: Array.isArray(next.events) ? next.events.slice(-MAX_EVENTS) : next.events,
      }, id);
      await this.#write(project);
      return project;
    });
  }

  async #prepare(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(this.#metadataRoot, { recursive: true, mode: 0o700 });
    await mkdir(this.#workspaceRoot, { recursive: true, mode: 0o700 });
    for (const id of await this.#ids()) {
      let project: Project | undefined;
      try {
        project = await this.#read(id);
      } catch (error) {
        if (error instanceof ProjectMetadataError) continue;
        throw error;
      }
      if (project?.status === "queued" || project?.status === "running") {
        await this.#write(event({ ...project, status: "failed", error: RESTART_MESSAGE }, "error", RESTART_MESSAGE));
      }
    }
  }

  async #ids(): Promise<string[]> {
    const entries = await readdir(this.#metadataRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json") && UUID.test(entry.name.slice(0, -5)))
      .map((entry) => entry.name.slice(0, -5));
  }

  async #read(id: string): Promise<Project | undefined> {
    let handle;
    try {
      handle = await open(join(this.#metadataRoot, `${id}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      if (hasCode(error, "ELOOP")) throw new ProjectMetadataError(id, "Metadata cannot be a symbolic link.", error);
      throw error;
    }
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) throw new ProjectMetadataError(id, "Metadata must be a regular file.");
      if (stats.size > MAX_METADATA_BYTES) {
        throw new ProjectMetadataError(id, `Metadata exceeds the ${MAX_METADATA_BYTES}-byte limit.`);
      }
      // Read no more than the checked length plus one byte, even if another writer grows the file.
      const buffer = Buffer.alloc(stats.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > stats.size) throw new ProjectMetadataError(id, "Metadata changed while reading.");
      try {
        const envelope = record(JSON.parse(buffer.subarray(0, length).toString("utf8")), "metadata");
        if (envelope.version !== "@1") throw new Error("Unsupported metadata version.");
        return readProject(envelope.project, id);
      } catch (error) {
        throw new ProjectMetadataError(id, error instanceof Error ? error.message : "Malformed JSON.", error);
      }
    } finally {
      await handle.close();
    }
  }

  async #write(project: Project): Promise<void> {
    const data = JSON.stringify({ version: "@1", project });
    if (Buffer.byteLength(data, "utf8") > MAX_METADATA_BYTES) throw new Error("Project metadata exceeds the storage limit.");
    const destination = join(this.#metadataRoot, `${project.id}.json`);
    const temporary = join(this.#metadataRoot, `.${project.id}.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(data, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!hasCode(error, "ENOENT")) throw error;
      });
    }
  }

  #serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#updates.get(id) ?? Promise.resolve();
    const result = previous.then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.#updates.set(id, settled);
    return result.finally(() => {
      if (this.#updates.get(id) === settled) this.#updates.delete(id);
    });
  }
}
