import { SurreelApi, SurreelApiError, type HealthInfo } from "./api.ts";
import {
  isActive,
  mergeProjects,
  upsertProject,
  type Project,
} from "./types.ts";

const pollMs = 1500;

export type StudioState = {
  api: SurreelApi;
  projects: Project[];
  selected: Project | undefined;
  loading: boolean;
  busy: boolean;
  connected: boolean;
  error: string | undefined;
  health: HealthInfo;
};

function messageOf(error: unknown): string {
  if (error instanceof SurreelApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong while contacting Surreel. Try again.";
}

export class StudioStore {
  private listeners = new Set<() => void>();
  private api = new SurreelApi();
  private projects: Project[] = [];
  private selected: Project | undefined;
  private loading = true;
  private busy = false;
  private connected = false;
  private error: string | undefined;
  private health: HealthInfo = {};
  private connectionVersion = 0;
  private selectionVersion = 0;
  private listVersion = 0;
  private mutationVersion = 0;
  private selectedReadVersion = 0;
  private pollTimer: number | undefined;
  private snapshot: StudioState;

  constructor() {
    this.snapshot = this.build();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StudioState => this.snapshot;

  private build(): StudioState {
    return {
      api: this.api,
      projects: this.projects,
      selected: this.selected,
      loading: this.loading,
      busy: this.busy,
      connected: this.connected,
      error: this.error,
      health: this.health,
    };
  }

  private emit(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }

  private current(connection: number): boolean {
    return connection === this.connectionVersion;
  }

  async initialize(): Promise<void> {
    await this.loadProjects();
  }

  clearError(): void {
    if (!this.error) return;
    this.error = undefined;
    this.emit();
  }

  clearSelection(): void {
    this.selectionVersion += 1;
    this.selectedReadVersion += 1;
    this.selected = undefined;
    this.error = undefined;
    this.emit();
  }

  selectProject(project: Project): void {
    this.selectionVersion += 1;
    this.selectedReadVersion += 1;
    this.selected = this.replace(project);
    this.error = undefined;
    this.emit();
    void this.refreshSelected();
  }

  private replace(project: Project, force = false): Project {
    this.projects = upsertProject(this.projects, project, force);
    return this.projects.find((item) => item.id === project.id) ?? project;
  }

  async loadProjects(silent = false): Promise<void> {
    if (this.busy) return;
    const connection = this.connectionVersion;
    const request = ++this.listVersion;
    if (!silent) {
      this.loading = true;
      this.error = undefined;
      this.emit();
    }
    try {
      const health = await this.api.health();
      if (!this.current(connection) || request !== this.listVersion) return;
      this.health = health;
      const result = await this.api.listProjects();
      if (!this.current(connection) || request !== this.listVersion) return;
      this.projects = mergeProjects(this.projects, result);
      if (this.selected) {
        const next = this.projects.find((item) => item.id === this.selected?.id);
        if (next && Date.parse(next.updatedAt) >= Date.parse(this.selected.updatedAt)) {
          this.selected = next;
        }
      }
      this.connected = true;
      this.error = undefined;
    } catch (error) {
      if (!this.current(connection) || request !== this.listVersion) return;
      if (!silent) {
        this.connected = false;
        this.error = messageOf(error);
      }
    } finally {
      if (this.current(connection) && request === this.listVersion) {
        this.loading = false;
        this.emit();
        this.schedulePoll();
      }
    }
  }

  async createAndRun(input: {
    prompt: string;
    aspectRatio: string;
    duration: number;
    style: string;
    format?: string;
    title?: string;
    referenceUrl?: string;
  }): Promise<void> {
    if (input.prompt.trim().length === 0) {
      this.error = "Describe the video you want to create.";
      this.emit();
      return;
    }
    const connection = this.connectionVersion;
    const selection = this.selectionVersion;
    this.error = undefined;
    this.loading = false;
    this.listVersion += 1;
    this.emit();
    try {
      const draft = await this.api.createProject(input);
      if (!this.current(connection)) return;
      this.replace(draft);
      this.connected = true;
      if (selection === this.selectionVersion) this.selected = draft;
      this.emit();
      const running = await this.api.runProject(draft.id);
      if (!this.current(connection)) return;
      this.replace(running);
      if (selection === this.selectionVersion) this.selected = running;
    } catch (error) {
      if (this.current(connection)) this.error = messageOf(error);
    } finally {
      if (this.current(connection)) {
        this.emit();
        this.schedulePoll();
      }
    }
  }

  async setReview(project: Project, review: string, destinations?: string[]): Promise<void> {
    this.error = undefined;
    this.emit();
    try {
      const result = await this.api.patchProject(project.id, { review, destinations });
      this.replace(result, true);
      if (this.selected?.id === project.id) this.selected = result;
      this.connected = true;
    } catch (error) {
      this.error = messageOf(error);
    } finally {
      this.emit();
    }
  }

  async refreshSelected(): Promise<void> {
    const project = this.selected;
    if (!project || this.busy) return;
    const connection = this.connectionVersion;
    const selection = this.selectionVersion;
    const request = ++this.selectedReadVersion;
    const id = project.id;
    try {
      const next = await this.api.getProject(id);
      if (connection !== this.connectionVersion || selection !== this.selectionVersion || request !== this.selectedReadVersion) {
        return;
      }
      this.selected = this.replace(next);
      this.connected = true;
      this.error = undefined;
    } catch (error) {
      if (connection !== this.connectionVersion || selection !== this.selectionVersion || request !== this.selectedReadVersion) {
        return;
      }
      this.error = messageOf(error);
    } finally {
      if (connection === this.connectionVersion && selection === this.selectionVersion && request === this.selectedReadVersion) {
        this.emit();
        this.schedulePoll();
      }
    }
  }

  async rerun(prompt: string): Promise<void> {
    const project = this.selected;
    if (this.busy || !project || isActive(project)) return;
    const operation = this.startMutation();
    const connection = this.connectionVersion;
    const selection = this.selectionVersion;
    try {
      const result = await this.api.runProject(project.id, prompt);
      if (connection !== this.connectionVersion || operation !== this.mutationVersion) return;
      this.replace(result);
      this.connected = true;
      if (selection === this.selectionVersion && this.selected?.id === project.id) this.selected = result;
    } catch (error) {
      if (connection === this.connectionVersion && operation === this.mutationVersion) {
        this.error = messageOf(error);
      }
    } finally {
      this.finishMutation(connection, operation);
    }
  }

  async cancel(): Promise<void> {
    const project = this.selected;
    if (this.busy || !project || !isActive(project)) return;
    const operation = this.startMutation();
    const connection = this.connectionVersion;
    const selection = this.selectionVersion;
    try {
      const result = await this.api.cancelProject(project.id);
      if (connection !== this.connectionVersion || operation !== this.mutationVersion) return;
      this.replace(result);
      this.connected = true;
      if (selection === this.selectionVersion && this.selected?.id === project.id) this.selected = result;
    } catch (error) {
      if (connection === this.connectionVersion && operation === this.mutationVersion) {
        this.error = messageOf(error);
      }
    } finally {
      this.finishMutation(connection, operation);
    }
  }

  private startMutation(): number {
    this.busy = true;
    this.error = undefined;
    this.listVersion += 1;
    this.loading = false;
    this.selectedReadVersion += 1;
    this.clearPoll();
    this.emit();
    return ++this.mutationVersion;
  }

  private finishMutation(connection: number, operation: number): void {
    if (connection !== this.connectionVersion || operation !== this.mutationVersion) return;
    this.busy = false;
    this.emit();
    this.schedulePoll();
  }

  private clearPoll(): void {
    if (this.pollTimer !== undefined) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private schedulePoll(): void {
    this.clearPoll();
    if (this.busy) return;
    const actives = this.projects.filter(isActive).length;
    const watching =
      (this.selected !== undefined && isActive(this.selected)) || actives > 1 || (actives === 1 && this.selected !== undefined);
    if (!watching) return;
    this.pollTimer = window.setTimeout(() => {
      this.pollTimer = undefined;
      void this.pollPipeline();
    }, pollMs);
  }

  private async pollPipeline(): Promise<void> {
    if (this.selected && isActive(this.selected)) await this.refreshSelected();
    if (this.projects.some((item) => isActive(item) && item.id !== this.selected?.id)) {
      await this.loadProjects(true);
    }
  }
}

export const studio = new StudioStore();
