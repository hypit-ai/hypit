export type ReviewState = "inbox" | "approved" | "rejected" | "sent";

export type AgentEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

export type VideoArtifact = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
};

export type Project = {
  id: string;
  title: string;
  prompt: string;
  aspectRatio: string;
  duration: number;
  style: string;
  format?: string;
  referenceUrl?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  events: AgentEvent[];
  artifacts: VideoArtifact[];
  error?: string;
  review?: ReviewState | string;
  destinations: string[];
};

export function isVideo(artifact: VideoArtifact): boolean {
  return artifact.mimeType.startsWith("video/");
}

export function projectVideo(project: Project): VideoArtifact | undefined {
  for (let index = project.artifacts.length - 1; index >= 0; index -= 1) {
    const artifact = project.artifacts[index];
    if (artifact && isVideo(artifact)) return artifact;
  }
  return undefined;
}

export function isActive(project: Project): boolean {
  return project.status === "queued" || project.status === "running";
}

export function isCompleted(project: Project): boolean {
  return project.status === "completed";
}

export function inReview(project: Project): boolean {
  return (
    isCompleted(project) &&
    projectVideo(project) !== undefined &&
    (project.review == null || project.review === "inbox")
  );
}

export function isApproved(project: Project): boolean {
  return project.review === "approved";
}

export function isSent(project: Project): boolean {
  return project.review === "sent";
}

export function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "queued":
      return "Queued";
    case "running":
      return "Creating";
    case "completed":
      return "Ready";
    case "failed":
      return "Needs attention";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function requiredString(json: Record<string, unknown>, key: string): string {
  const value = json[key];
  if (typeof value !== "string") throw new Error(`Missing or invalid ${key}.`);
  return value;
}

function optionalString(json: Record<string, unknown>, key: string): string | undefined {
  const value = json[key];
  if (value == null) return undefined;
  return requiredString(json, key);
}

function requiredDate(json: Record<string, unknown>, key: string): string {
  const value = requiredString(json, key);
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${key} timestamp.`);
  return value;
}

function strings(json: Record<string, unknown>, key: string): string[] {
  const values = json[key];
  if (values == null) return [];
  if (!Array.isArray(values)) throw new Error(`Invalid ${key} list.`);
  return values.filter((value): value is string => typeof value === "string");
}

function objects(json: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const values = json[key];
  if (values == null) return [];
  if (!Array.isArray(values)) throw new Error(`Invalid ${key} list.`);
  return values.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null);
}

export function parseProject(json: unknown): Project {
  if (typeof json !== "object" || json === null) throw new Error("Invalid project.");
  const data = json as Record<string, unknown>;
  const duration = data.duration;
  if (typeof duration !== "number" || !Number.isInteger(duration)) {
    throw new Error("Project duration must be an integer.");
  }
  const status = requiredString(data, "status");
  const events = objects(data, "events").map((event) => ({
    id: requiredString(event, "id"),
    type: requiredString(event, "type"),
    message: requiredString(event, "message"),
    createdAt: requiredDate(event, "createdAt"),
  }));
  const artifacts = objects(data, "artifacts").map((artifact) => ({
    id: requiredString(artifact, "id"),
    name: requiredString(artifact, "name"),
    url: requiredString(artifact, "url"),
    mimeType: requiredString(artifact, "mimeType"),
  }));
  return {
    id: requiredString(data, "id"),
    title: requiredString(data, "title"),
    prompt: requiredString(data, "prompt"),
    aspectRatio: requiredString(data, "aspectRatio"),
    duration,
    style: requiredString(data, "style"),
    format: optionalString(data, "format"),
    referenceUrl: optionalString(data, "referenceUrl"),
    status,
    createdAt: requiredDate(data, "createdAt"),
    updatedAt: requiredDate(data, "updatedAt"),
    events,
    artifacts,
    error: optionalString(data, "error"),
    review: optionalString(data, "review") ?? (status === "completed" ? "inbox" : undefined),
    destinations: strings(data, "destinations"),
  };
}

export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function mergeProjects(previous: Project[], incoming: Project[]): Project[] {
  const prior = new Map(previous.map((project) => [project.id, project]));
  const next = incoming.map((project) => {
    const existing = prior.get(project.id);
    if (existing && Date.parse(existing.updatedAt) > Date.parse(project.updatedAt)) return existing;
    return project;
  });
  const seen = new Set(next.map((project) => project.id));
  for (const project of previous) {
    if (!seen.has(project.id)) next.push(project);
  }
  return sortProjects(next);
}

export function upsertProject(projects: Project[], project: Project, force = false): Project[] {
  const existing = projects.find((item) => item.id === project.id);
  if (!force && existing && Date.parse(existing.updatedAt) > Date.parse(project.updatedAt)) {
    return projects;
  }
  return sortProjects([...projects.filter((item) => item.id !== project.id), project]);
}
