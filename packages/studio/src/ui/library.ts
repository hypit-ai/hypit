import type {
  StudioArtifactView,
  StudioLibraryView,
  StudioSnapshot,
  StudioSourceView,
  StudioTaskView,
} from "../shared.js";
import type { CodePane } from "./code.js";
import { icon } from "./icons.js";

type LibrarySection = "source" | "tasks" | "artifacts";

export type LibraryPane = {
  readonly element: HTMLElement;
  show(snapshot: StudioSnapshot): void;
  refresh(): Promise<void>;
};

function leaf(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

function stem(path: string): string {
  const name = leaf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function compactId(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 9)}…${value.slice(-6)}`;
}

function formatBytes(value: number): string {
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} KB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

const date = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function emptyState(iconName: string, title: string, detail: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "library-empty";
  node.innerHTML = `<span class="library-empty-icon">${icon(iconName)}</span><strong></strong><p></p>`;
  node.querySelector("strong")!.textContent = title;
  node.querySelector("p")!.textContent = detail;
  return node;
}

function taskProgress(task: StudioTaskView): string | undefined {
  const progress = task.operations.find((operation) => operation.status === "pending" && operation.phase !== undefined);
  if (progress === undefined) return undefined;
  if (progress.completed === undefined) return progress.phase;
  const amount = progress.total === undefined
    ? String(progress.completed)
    : `${progress.completed}/${progress.total}`;
  return `${progress.phase} · ${amount}${progress.unit === undefined ? "" : ` ${progress.unit}`}`;
}

function taskCard(task: StudioTaskView): HTMLElement {
  const node = document.createElement("article");
  node.className = `task-card task-${task.status}`;
  const title = task.targets.length === 0 ? leaf(task.run ?? task.source) : task.targets.join(", ");
  const progress = taskProgress(task);
  node.innerHTML = `
    <div class="task-state"><span></span></div>
    <div class="task-copy">
      <div class="task-title"><strong></strong><span class="task-status"></span></div>
      <p class="task-source"></p>
      <div class="task-facts"><span data-time></span><span data-records></span><span data-command></span></div>
      <div class="task-progress" data-progress></div>
    </div>`;
  node.querySelector("strong")!.textContent = title;
  node.querySelector<HTMLElement>(".task-status")!.textContent = task.status;
  const source = task.run ?? task.source;
  node.querySelector<HTMLElement>(".task-source")!.textContent = source;
  node.querySelector<HTMLElement>(".task-source")!.title = source;
  node.querySelector<HTMLElement>("[data-time]")!.textContent = date.format(task.createdAt);
  node.querySelector<HTMLElement>("[data-records]")!.textContent = `${task.acceptedRecords} records`;
  node.querySelector<HTMLElement>("[data-command]")!.textContent = task.outstandingCommands === 0
    ? compactId(task.id)
    : `${task.outstandingCommands} remaining`;
  const progressNode = node.querySelector<HTMLElement>("[data-progress]")!;
  if (progress === undefined) progressNode.remove();
  else progressNode.textContent = progress;
  node.title = `${task.id}\n${source}`;
  return node;
}

function artifactKind(mediaType: string): { readonly label: string; readonly icon: string } {
  if (mediaType.startsWith("video/")) return { label: "Video", icon: "video" };
  if (mediaType.startsWith("image/")) return { label: "Image", icon: "image" };
  if (mediaType.startsWith("audio/")) return { label: "Audio", icon: "waveform" };
  return { label: "Data", icon: "code" };
}

function artifactCard(artifact: StudioArtifactView): HTMLElement {
  const kind = artifactKind(artifact.mediaType);
  const link = document.createElement("a");
  link.className = `artifact-card artifact-${kind.label.toLowerCase()}`;
  const query = new URLSearchParams({
    build: artifact.build,
    output: artifact.output,
    path: artifact.valuePath,
  });
  link.href = `/__studio/artifact?${query.toString()}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  const title = artifact.valuePath === "$" ? artifact.output : `${artifact.output} ${artifact.valuePath}`;
  link.innerHTML = `
    <div class="artifact-preview">
      <span class="artifact-glyph">${icon(kind.icon)}</span>
      <span class="artifact-type"></span>
    </div>
    <div class="artifact-copy">
      <strong></strong>
      <span class="artifact-meta"></span>
    </div>`;
  link.querySelector<HTMLElement>(".artifact-type")!.textContent = kind.label;
  link.querySelector("strong")!.textContent = title;
  link.querySelector<HTMLElement>(".artifact-meta")!.textContent = `${formatBytes(artifact.size)} · ${date.format(artifact.createdAt)}`;
  if (artifact.mediaType.startsWith("image/")) {
    const image = document.createElement("img");
    image.src = link.href;
    image.alt = "";
    image.loading = "lazy";
    link.querySelector<HTMLElement>(".artifact-preview")!.prepend(image);
  }
  link.title = [
    title,
    artifact.mediaType,
    `${artifact.ownerBuild}/${artifact.ownerOutput}/${artifact.filePath}`,
    artifact.run ?? artifact.source,
  ].join("\n");
  return link;
}

export function createLibraryPane(code: CodePane): LibraryPane {
  const element = document.createElement("section");
  element.className = "library";
  element.innerHTML = `
    <div class="library-tabs" role="tablist" aria-label="Studio library">
      <button type="button" class="library-tab active" data-library-tab="source" role="tab" aria-selected="true">
        <span>${icon("code")}</span><strong>Source</strong>
      </button>
      <button type="button" class="library-tab" data-library-tab="tasks" role="tab" aria-selected="false">
        <span>${icon("tasks")}</span><strong>Tasks</strong>
      </button>
      <button type="button" class="library-tab" data-library-tab="artifacts" role="tab" aria-selected="false">
        <span>${icon("archive")}</span><strong>Artifacts</strong>
      </button>
    </div>
    <section class="library-view active" data-library-view="source">
      <div class="source-workspace" data-source-workspace>
        <div class="source-sidebar-heading">
          <span class="source-sidebar-mark" aria-hidden="true">${icon("sidebarCollapse")}</span>
        </div>
        <div class="source-code-heading" data-source-toolbar></div>
        <nav class="source-files" aria-label="Referenced source files" data-source-files></nav>
        <div class="source-code" data-source-code></div>
      </div>
    </section>
    <section class="library-view" data-library-view="tasks">
      <div class="library-toolbar">
        <div><strong>Build archive</strong><small data-task-count></small></div>
        <button type="button" class="library-refresh" data-library-refresh aria-label="Refresh tasks" title="Refresh">${icon("refresh")}</button>
      </div>
      <div class="library-context-row" data-runtime-context></div>
      <div class="task-list" data-task-list></div>
    </section>
    <section class="library-view" data-library-view="artifacts">
      <div class="library-toolbar">
        <div><strong>Accepted artifacts</strong><small data-artifact-count></small></div>
        <button type="button" class="library-refresh" data-library-refresh aria-label="Refresh artifacts" title="Refresh">${icon("refresh")}</button>
      </div>
      <div class="artifact-filters" role="tablist" aria-label="Artifact kinds" data-artifact-filters></div>
      <div class="artifact-grid" data-artifact-grid></div>
    </section>`;

  element.querySelector<HTMLElement>("[data-source-toolbar]")!.append(code.toolbar);
  element.querySelector<HTMLElement>("[data-source-code]")!.append(code.element);
  const sourceList = element.querySelector<HTMLElement>("[data-source-files]")!;
  const taskList = element.querySelector<HTMLElement>("[data-task-list]")!;
  const artifactGrid = element.querySelector<HTMLElement>("[data-artifact-grid]")!;
  const artifactFilters = element.querySelector<HTMLElement>("[data-artifact-filters]")!;
  const runtimeContext = element.querySelector<HTMLElement>("[data-runtime-context]")!;
  let snapshot: StudioSnapshot | undefined;
  let selectedSource = "";
  let active: LibrarySection = "source";
  let library: StudioLibraryView | undefined;
  let artifactFilter = "all";
  let refreshing = false;

  const renderSources = (): void => {
    if (snapshot === undefined) return;
    const files = snapshot.source.files;
    const selected = files.find((file) => file.path === selectedSource)
      ?? files.find((file) => file.path === snapshot!.source.path)
      ?? files[0];
    selectedSource = selected?.path ?? snapshot.source.path;
    if (selected !== undefined && !code.show(snapshot, selected)) {
      selectedSource = code.activePath() ?? snapshot.source.path;
    }
    sourceList.replaceChildren(...files.map((file) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `source-file${file.path === selectedSource ? " active" : ""}`;
      button.innerHTML = `<span class="source-file-icon">${icon(file.language === "svrun" ? "run" : file.language === "svs" ? "tune" : "code")}</span>`;
      button.setAttribute("aria-label", `${stem(file.path)} ${file.language.toUpperCase()}`);
      button.title = `${file.role} · ${file.path}${file.imports.length === 0 ? "" : `\nimports ${file.imports.join(", ")}`}`;
      button.addEventListener("click", () => {
        selectedSource = file.path;
        renderSources();
      });
      return button;
    }));
  };

  const renderTasks = (): void => {
    const tasks = library?.tasks ?? [];
    const runtime = library?.runtime;
    element.querySelector<HTMLElement>("[data-task-count]")!.textContent = `${tasks.length} build${tasks.length === 1 ? "" : "s"}`;
    runtimeContext.replaceChildren();
    const context = document.createElement("span");
    context.className = "runtime-chip";
    context.innerHTML = `<span></span><strong></strong>`;
    context.querySelector("span")!.textContent = runtime === undefined ? "Runtime" : leaf(runtime);
    context.querySelector("strong")!.textContent = runtime === undefined ? "not selected" : leaf(library!.environment);
    context.title = runtime === undefined ? "No Runtime selected for this environment" : `${library!.environment}\n${runtime}`;
    runtimeContext.append(context);
    if (tasks.length === 0) {
      taskList.replaceChildren(emptyState("tasks",
        runtime === undefined ? "No Runtime selected" : "No builds yet",
        runtime === undefined
          ? "Select one with hypit runtime use, then reopen Studio."
          : "Builds created from this environment will appear here."));
      return;
    }
    taskList.replaceChildren(...tasks.map(taskCard));
  };

  const renderArtifacts = (): void => {
    const artifacts = library?.artifacts ?? [];
    element.querySelector<HTMLElement>("[data-artifact-count]")!.textContent = `${artifacts.length} public file${artifacts.length === 1 ? "" : "s"}`;
    const filters = [
      ["all", "All"],
      ["video", "Video"],
      ["image", "Image"],
      ["audio", "Audio"],
    ] as const;
    artifactFilters.replaceChildren(...filters.map(([id, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = id === artifactFilter ? "active" : "";
      button.textContent = label;
      button.addEventListener("click", () => { artifactFilter = id; renderArtifacts(); });
      return button;
    }));
    const shown = artifactFilter === "all"
      ? artifacts
      : artifacts.filter((artifact) => artifact.mediaType.startsWith(`${artifactFilter}/`));
    if (shown.length === 0) {
      artifactGrid.replaceChildren(emptyState("archive",
        artifacts.length === 0 ? "No accepted artifacts" : `No ${artifactFilter} artifacts`,
        "Public files appear here when a Build Result contains them."));
      return;
    }
    artifactGrid.replaceChildren(...shown.map(artifactCard));
  };

  const switchTo = (next: LibrarySection): void => {
    active = next;
    for (const tab of Array.from(element.querySelectorAll<HTMLButtonElement>("[data-library-tab]"))) {
      const selected = tab.dataset.libraryTab === next;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }
    for (const view of Array.from(element.querySelectorAll<HTMLElement>("[data-library-view]"))) {
      view.classList.toggle("active", view.dataset.libraryView === next);
    }
    if (next !== "source") void refresh();
  };

  for (const tab of Array.from(element.querySelectorAll<HTMLButtonElement>("[data-library-tab]"))) {
    tab.addEventListener("click", () => switchTo(tab.dataset.libraryTab as LibrarySection));
  }

  const refresh = async (): Promise<void> => {
    if (refreshing) return;
    refreshing = true;
    element.classList.add("is-refreshing");
    try {
      const response = await fetch("/__studio/library");
      const value = await response.json() as StudioLibraryView | { readonly error: string };
      if (!response.ok || "error" in value) throw new Error("error" in value ? value.error : "Library unavailable");
      library = value;
      renderTasks();
      renderArtifacts();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (active === "tasks") taskList.replaceChildren(emptyState("tasks", "Archive unavailable", detail));
      if (active === "artifacts") artifactGrid.replaceChildren(emptyState("archive", "Build Results unavailable", detail));
    } finally {
      refreshing = false;
      element.classList.remove("is-refreshing");
    }
  };

  for (const button of Array.from(element.querySelectorAll<HTMLButtonElement>("[data-library-refresh]"))) {
    button.addEventListener("click", () => void refresh());
  }
  window.setInterval(() => {
    if (document.visibilityState === "visible" && active !== "source") void refresh();
  }, 3_000);

  return {
    element,
    show(value) {
      snapshot = value;
      renderSources();
    },
    refresh,
  };
}
