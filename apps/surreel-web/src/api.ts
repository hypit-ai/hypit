import { parseProject, type Project } from "./types.ts";

export class SurreelApiError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "SurreelApiError";
    this.statusCode = statusCode;
  }
}

export type HealthInfo = {
  status?: string;
  agentAvailable?: boolean;
  agent?: string;
  model?: string;
  skills?: string[];
  browser?: string;
  sdkVersion?: string;
};

function normalizeBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export class SurreelApi {
  constructor(
    public baseUrl = "",
    public token = "",
  ) {
    this.baseUrl = normalizeBase(baseUrl);
    this.token = token.trim();
  }

  endpoint(path: string[]): string {
    const suffix = `/api/${path.join("/")}`;
    return this.baseUrl.length === 0 ? suffix : `${this.baseUrl}${suffix}`;
  }

  artifactUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (this.baseUrl.length === 0) return url;
    return new URL(url, `${this.baseUrl}/`).toString();
  }

  private headers(hasBody: boolean): HeadersInit {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (hasBody) headers["Content-Type"] = "application/json";
    if (this.token.length > 0) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  private async request(method: string, path: string[], body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try {
      response = await fetch(this.endpoint(path), {
        method,
        headers: this.headers(body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new SurreelApiError("The Surreel service took too long to respond. Try again.");
      }
      throw new SurreelApiError(
        `Could not connect to Surreel at ${this.baseUrl || "this origin"}. Check the service and connection settings.`,
      );
    } finally {
      clearTimeout(timer);
    }

    let decoded: unknown;
    try {
      decoded = await response.json();
    } catch {
      if (response.ok) throw new SurreelApiError("The service returned an invalid JSON response.");
    }

    if (!response.ok) {
      let message: string | undefined;
      if (decoded && typeof decoded === "object") {
        const data = decoded as Record<string, unknown>;
        if (typeof data.error === "string") message = data.error;
        if (data.error && typeof data.error === "object" && typeof (data.error as { message?: unknown }).message === "string") {
          message = (data.error as { message: string }).message;
        }
        if (message == null && typeof data.message === "string") message = data.message;
      }
      throw new SurreelApiError(
        message?.trim() ? message : `Surreel could not complete this request (HTTP ${response.status}).`,
        response.status,
      );
    }
    if (typeof decoded !== "object" || decoded === null) {
      throw new SurreelApiError("The service returned an invalid response.");
    }
    return decoded as Record<string, unknown>;
  }

  private project(payload: Record<string, unknown>): Project {
    return parseProject(payload.project);
  }

  health(): Promise<HealthInfo> {
    return this.request("GET", ["health"]) as Promise<HealthInfo>;
  }

  async listProjects(): Promise<Project[]> {
    const json = await this.request("GET", ["projects"]);
    const projects = json.projects;
    if (!Array.isArray(projects)) throw new SurreelApiError("The service returned an invalid project list.");
    return projects.map((project) => parseProject(project));
  }

  async createProject(input: {
    prompt: string;
    aspectRatio: string;
    duration: number;
    style: string;
    title?: string;
    format?: string;
    referenceUrl?: string;
  }): Promise<Project> {
    const body: Record<string, unknown> = {
      prompt: input.prompt.trim(),
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      style: input.style,
    };
    if (input.title?.trim()) body.title = input.title.trim();
    if (input.format?.trim()) body.format = input.format.trim();
    if (input.referenceUrl?.trim()) body.referenceUrl = input.referenceUrl.trim();
    return this.project(await this.request("POST", ["projects"], body));
  }

  async getProject(id: string): Promise<Project> {
    return this.project(await this.request("GET", ["projects", id]));
  }

  async runProject(id: string, prompt?: string): Promise<Project> {
    const body: Record<string, unknown> = {};
    if (prompt?.trim()) body.prompt = prompt.trim();
    return this.project(await this.request("POST", ["projects", id, "runs"], body));
  }

  async cancelProject(id: string): Promise<Project> {
    return this.project(await this.request("POST", ["projects", id, "cancel"], {}));
  }

  async patchProject(id: string, input: { review?: string; destinations?: string[] }): Promise<Project> {
    const body: Record<string, unknown> = {};
    if (input.review !== undefined) body.review = input.review;
    if (input.destinations !== undefined) body.destinations = input.destinations;
    return this.project(await this.request("PATCH", ["projects", id], body));
  }
}
