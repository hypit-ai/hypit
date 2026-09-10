import type {
  StudioArtifactView,
  StudioLibraryView,
  StudioSnapshot,
  StudioSourceView,
  StudioTaskView,
} from "../shared.js";
import type { CodePane } from "./code.js";
import { createArtifactName } from "./artifact-name.js";
import { audioPreview } from "./material-preview.js";
import { createSidebarPanel, sidebarItem } from "./sidebar-panel.js";
import { icon } from "./icons.js";
import { mergeStudioArtifacts } from "../library-media.js";

type LibrarySection = "source" | "tasks" | "artifacts";

export type LibraryPane = {
  readonly element: HTMLElement;
  show(snapshot: StudioSnapshot): void;
  refresh(): Promise<void>;
  selectArtifact(id: string | undefined): void;
};

function leaf(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

function stem(path: string): string {
  const name = leaf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
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
  if (progress === undefined) return task.requests === undefined ? undefined
    : `${task.requests.completed}/${task.requests.total} steps complete`;
  if (progress.completed === undefined) return progress.phase;
  const amount = progress.total === undefined
    ? String(progress.completed)
    : `${progress.completed}/${progress.total}`;
  return `${progress.phase} · ${amount}${progress.unit === undefined ? "" : ` ${progress.unit}`}`;
}

function taskCard(task: StudioTaskView, selected: boolean, select: () => void, showMedia: () => void): HTMLElement {
  const node = document.createElement("article");
  node.className = `task-card task-${task.status}${selected ? " selected" : ""}`;
  node.tabIndex = 0;
  node.setAttribute("aria-label", task.title ?? stem(task.run ?? task.source));
  node.addEventListener("click", select);
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); select(); }
  });
  node.dataset.taskId = task.id;
  const source = task.run ?? task.source;
  const title = task.title ?? stem(source);
  const statuses: Record<StudioTaskView["status"], string> = {
    queued: "Queued", running: "Running", waiting: "Waiting", complete: "Completed",
    failed: "Failed", cancelled: "Cancelled", "saving-result": "Saving", attention: "Needs attention",
  };
  node.innerHTML = `
    <div class="task-state" aria-hidden="true">${icon(task.ongoing ? "when" : task.status === "complete" ? "check" : task.status === "failed" ? "alert" : "tasks")}</div>
    <div class="task-copy">
      <div class="task-title"><button type="button" class="task-name"></button></div>
      <div class="task-facts"><span class="task-status"></span><time></time></div>
      <div class="task-progress" data-progress></div>
      <div class="task-detail" data-detail></div>
    </div>
    <button type="button" class="task-open" aria-label="View task media" title="View media">${icon("arrowRight")}</button>`;
  const name = node.querySelector<HTMLButtonElement>(".task-name")!;
  name.textContent = title;
  name.addEventListener("click", (event) => { event.stopPropagation(); select(); });
  node.querySelector<HTMLElement>(".task-status")!.textContent = statuses[task.status];
  const time = node.querySelector("time")!;
  time.dateTime = new Date(task.createdAt).toISOString();
  time.textContent = date.format(task.createdAt);
  const progress = task.ongoing ? taskProgress(task) : undefined;
  const progressNode = node.querySelector<HTMLElement>("[data-progress]")!;
  if (progress === undefined) progressNode.remove();
  else { progressNode.textContent = progress; progressNode.title = progress; }
  const detailNode = node.querySelector<HTMLElement>("[data-detail]")!;
  if (task.detail === undefined) detailNode.remove();
  else {
    const message = document.createElement("div");
    message.className = "task-error-message";
    message.textContent = task.detail;
    detailNode.append(message);
    const copy = document.createElement("button");
    copy.type = "button"; copy.className = "task-copy-error"; copy.textContent = "Copy error";
    copy.addEventListener("click", (event) => {
      event.stopPropagation();
      void navigator.clipboard.writeText(task.detail!).then(() => { copy.textContent = "Copied"; }, () => { copy.textContent = "Select the text to copy"; });
    });
    detailNode.append(copy);
    detailNode.addEventListener("click", (event) => { event.stopPropagation(); if (!node.classList.contains("selected")) select(); });
  }
  node.querySelector<HTMLButtonElement>(".task-open")!.addEventListener("click", (event) => { event.stopPropagation(); showMedia(); });
  name.title = [title, source, task.id, task.note].filter((item) => item !== undefined).join("\n");
  return node;
}

function artifactKind(mediaType: string): { readonly label: string; readonly icon: string } {
  if (mediaType.startsWith("video/")) return { label: "Video", icon: "video" };
  if (mediaType.startsWith("image/")) return { label: "Image", icon: "image" };
  if (mediaType.startsWith("audio/")) return { label: "Audio", icon: "waveform" };
  return { label: "Data", icon: "code" };
}

function sizeThumbnail(media: HTMLElement, width: number, height: number): void {
  if (width <= 0 || height <= 0) return;
  const longest = Math.max(width, height);
  media.style.width = `${100 * width / longest}%`;
  media.style.height = `${100 * height / longest}%`;
}

function artifactCard(artifact: StudioArtifactView, open: (artifact: StudioArtifactView) => void, renamed: (artifact: StudioArtifactView) => void): HTMLElement {
  const kind = artifactKind(artifact.mediaType);
  const link = document.createElement("div");
  link.tabIndex = 0;
  link.className = `artifact-card artifact-${kind.label.toLowerCase()}${artifact.highlighted ? " artifact-highlighted" : ""}`;
  const query = new URLSearchParams({
    build: artifact.build,
    output: artifact.output,
  });
  const href = `/__studio/artifact?${query.toString()}`;

  link.dataset.artifactId = artifact.id;
  link.dataset.build = artifact.build;
  link.dataset.output = artifact.output;
  link.dataset.displayName = artifact.displayName ?? "";
  link.dataset.nameEditable = String(artifact.nameEditable === true);
  const title = artifact.displayName ?? artifact.output;
  link.innerHTML = `
    <div class="artifact-preview">
      <span class="artifact-glyph">${icon(kind.icon)}</span>
      <span class="artifact-type"></span>
    </div>`;
  link.querySelector<HTMLElement>(".artifact-type")!.textContent = kind.label;
  const preview = link.querySelector<HTMLElement>(".artifact-preview")!;
  preview.setAttribute("role", "button");
  preview.setAttribute("aria-label", `Preview ${title}`);
  preview.addEventListener("click", () => open(artifact));
  const name = createArtifactName({
    name: title,
    editable: artifact.nameEditable === true,
    select: () => { if (!link.classList.contains("selected")) open(artifact); },
    async save(displayName) {
      const response = await fetch("/__studio/artifact-name", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ build: artifact.build, output: artifact.output, displayName }),
      });
      const result = await response.json() as { displayName?: string; error?: string };
      if (!response.ok || typeof result.displayName !== "string") throw new Error(result.error ?? "Could not save the name");
      artifact = { ...artifact, displayName: result.displayName };
      link.dataset.displayName = result.displayName;
      renamed(artifact);
      preview.setAttribute("aria-label", `Preview ${result.displayName}`);
      preview.title = [result.displayName, ...preview.title.split("\n").slice(1)].join("\n");
      return result.displayName;
    },
  });
  link.append(name.element);
  link.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "F2") { event.preventDefault(); name.edit(); }
    else if (event.key === "Enter" && event.target === link) { event.preventDefault(); open(artifact); }
  });
  if (artifact.mediaType.startsWith("image/")) {
    const image = document.createElement("img");
    image.addEventListener("load", () => sizeThumbnail(image, image.naturalWidth, image.naturalHeight));
    image.addEventListener("error", () => { link.classList.add("preview-unavailable"); link.querySelector<HTMLElement>(".artifact-type")!.textContent = "Preview unavailable"; });
    image.src = href;
    image.alt = "";
    image.loading = "lazy";
    link.querySelector<HTMLElement>(".artifact-preview")!.prepend(image);
  } else if (artifact.mediaType.startsWith("video/")) {
    const video = document.createElement("video");
    video.preload = "none";
    video.muted = true;
    video.playsInline = true;
    video.dataset.previewSource = href;
    video.setAttribute("aria-hidden", "true");
    const label = link.querySelector<HTMLElement>(".artifact-type")!;
    label.textContent = "Video · Loading preview";
    const ready = () => {
      if (video.readyState < 2 || video.seeking) return;
      video.classList.add("is-ready");
      label.textContent = "Video";
    };
    video.addEventListener("loadedmetadata", () => {
      sizeThumbnail(video, video.videoWidth, video.videoHeight);
      video.currentTime = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 2) : 0.1;
    }, { once: true });
    video.addEventListener("loadeddata", ready);
    video.addEventListener("seeked", ready);
    video.addEventListener("error", () => { label.textContent = "Preview unavailable"; link.classList.add("preview-unavailable"); });
    link.querySelector<HTMLElement>(".artifact-preview")!.prepend(video);
  } else if (artifact.mediaType.startsWith("audio/")) {
    const waveform = document.createElement("img");
    waveform.className = "artifact-waveform";
    waveform.alt = "";
    waveform.dataset.audioSource = href;
    link.querySelector<HTMLElement>(".artifact-preview")!.prepend(waveform);
  }
  preview.title = [
    title,
    artifact.mediaType,
    formatBytes(artifact.size),
    date.format(artifact.createdAt),
    artifact.ownerBuild === undefined ? artifact.filePath : `${artifact.ownerBuild}/${artifact.filePath}`,
    ...artifact.origins.map((origin) => `${origin.run ?? origin.source} · ${origin.build} · ${origin.output}`),
    artifact.buildNote,
  ].filter((item) => item !== undefined).join("\n");
  return link;
}

export function createLibraryPane(code: CodePane, openArtifact: (artifact: StudioArtifactView) => void, renamedArtifact: (artifact: StudioArtifactView) => void): LibraryPane {
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
        <span>${icon("results")}</span><strong>Artifacts</strong>
      </button>
    </div>
    <section class="library-view active" data-library-view="source">
    </section>
    <section class="library-view" data-library-view="tasks"></section>
    <section class="library-view" data-library-view="artifacts">
    </section>`;

  const sourcePanel = createSidebarPanel("panel", "Referenced source files");
  sourcePanel.toolbar.append(code.toolbar);
  sourcePanel.content.classList.add("source-code");
  sourcePanel.content.append(code.element);
  element.querySelector('[data-library-view="source"]')!.append(sourcePanel.element);
  const taskPanel = createSidebarPanel("panel", "Task categories");
  taskPanel.toolbar.innerHTML = `<span class="code-location" data-task-heading>All tasks</span><div class="task-context" data-task-context hidden></div>
    <button type="button" class="library-refresh" data-library-refresh aria-label="Refresh tasks" title="Refresh">${icon("refresh")}</button>`;
  taskPanel.content.innerHTML = `<div class="media-status" data-library-status="tasks" role="status" hidden></div><div class="task-list" data-task-list></div>`;
  element.querySelector('[data-library-view="tasks"]')!.append(taskPanel.element);
  const mediaPanel = createSidebarPanel("panel", "Media categories");
  mediaPanel.toolbar.innerHTML = `<span class="code-location" data-media-heading>All media</span><div class="task-context" data-task-context hidden></div>
    <button type="button" class="library-refresh" data-library-refresh aria-label="Refresh media" title="Refresh">${icon("refresh")}</button>`;
  mediaPanel.content.innerHTML = `<div class="media-status" data-library-status="artifacts" role="status" hidden></div><div class="artifact-grid" data-artifact-grid></div>`;
  element.querySelector('[data-library-view="artifacts"]')!.append(mediaPanel.element);
  const sourceList = sourcePanel.navigation;
  const taskList = element.querySelector<HTMLElement>("[data-task-list]")!;
  const artifactGrid = element.querySelector<HTMLElement>("[data-artifact-grid]")!;
  const artifactFilters = mediaPanel.navigation;
  let snapshot: StudioSnapshot | undefined;
  let selectedSource = "";
  let active: LibrarySection = "source";
  const libraries: Partial<Record<"tasks" | "artifacts", StudioLibraryView>> = {};
  let taskFilter: "all" | "ongoing" | "finished" = "all";
  let artifactFilter = "all";
  let selectedArtifact: string | undefined;
  let selectedTask: StudioTaskView | undefined;
  let request: AbortController | undefined;
  const morePages = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const node = entry.target as HTMLElement;
      const section = node.dataset.moreSection as "tasks" | "artifacts";
      if (!entry.isIntersecting || request !== undefined || active !== section) continue;
      morePages.unobserve(node);
      void refresh(section, node.dataset.before);
    }
  }, { rootMargin: "0px 0px 120px 0px" });
  const continuation = (section: "tasks" | "artifacts", cursor: string): HTMLElement => {
    const node = document.createElement("div");
    node.className = "library-continuation";
    node.dataset.moreSection = section;
    node.dataset.before = cursor;
    node.textContent = "Loading more…";
    return node;
  };
  const selectArtifact = (id: string | undefined): void => {
    selectedArtifact = id;
    for (const card of Array.from(artifactGrid.querySelectorAll<HTMLElement>("[data-artifact-id]"))) {
      const selected = card.dataset.artifactId === id;
      card.classList.toggle("selected", selected);
      if (selected) card.setAttribute("aria-current", "true");
      else card.removeAttribute("aria-current");
    }
  };
  const videoPreviews = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      videoPreviews.unobserve(entry.target);
      if (entry.target instanceof HTMLImageElement) {
        const image = entry.target;
        void audioPreview(image.dataset.audioSource!).then((url) => {
          if (url === undefined || !image.isConnected) return;
          image.src = url;
          image.classList.add("is-ready");
        });
        continue;
      }
      const video = entry.target as HTMLVideoElement;
      video.preload = "metadata";
      video.src = video.dataset.previewSource!;
    }
  }, { root: artifactGrid });

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
      const button = sidebarItem({
        label: `${stem(file.path)} ${file.language.toUpperCase()}`,
        icon: file.language === "svrun" ? "run" : file.language === "svs" ? "tune" : "code",
        selected: file.path === selectedSource,
        select: () => { selectedSource = file.path; renderSources(); },
      });
      button.title = `${file.role} · ${file.path}${file.imports.length === 0 ? "" : `\nimports ${file.imports.join(", ")}`}`;
      return button;
    }));
  };

  const renderTaskContext = (): void => {
    for (const node of Array.from(element.querySelectorAll<HTMLElement>("[data-task-context]"))) {
      const title = selectedTask === undefined ? undefined : selectedTask.title ?? stem(selectedTask.run ?? selectedTask.source);
      if (selectedTask !== undefined && node.dataset.taskId === selectedTask.id
        && node.querySelector(".task-context-name span")?.textContent === title) continue;
      node.replaceChildren();
      node.hidden = selectedTask === undefined;
      node.dataset.taskId = selectedTask?.id ?? "";
      if (selectedTask === undefined) continue;
      const task = selectedTask;
      const back = document.createElement("button");
      back.type = "button"; back.className = "task-context-name";
      back.innerHTML = "<span></span>";
      back.querySelector("span")!.textContent = task.title ?? stem(task.run ?? task.source);
      back.title = `${task.title ?? stem(task.run ?? task.source)} · Return to task`;
      back.addEventListener("click", () => {
        taskFilter = "all";
        switchTo("tasks", false);
        renderTasks();
        taskList.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"]`)?.scrollIntoView({ block: "nearest" });
      });
      const clear = document.createElement("button");
      clear.type = "button"; clear.className = "task-context-clear";
      clear.innerHTML = icon("close"); clear.title = "Clear task filter"; clear.setAttribute("aria-label", clear.title);
      clear.addEventListener("click", () => {
        selectedTask = undefined; delete libraries.artifacts; renderTaskContext(); renderTasks();
        if (active === "artifacts") { renderArtifacts(); void refresh("artifacts"); }
      });
      node.append(back, clear);
    }
  };

  const renderTasks = (): void => {
    for (const node of Array.from(taskList.querySelectorAll("[data-more-section]"))) morePages.unobserve(node);
    const library = libraries.tasks;
    const tasks = library?.tasks ?? [];
    const filters = [["all", "All tasks", "component"], ["ongoing", "In progress", "when"], ["finished", "Finished", "check"]] as const;
    const heading = taskPanel.toolbar.querySelector<HTMLElement>("[data-task-heading]")!;
    heading.textContent = filters.find(([id]) => id === taskFilter)![1];
    heading.title = library?.runtime === undefined ? "Saved project Results · no Runtime selected" : library.runtime;
    taskPanel.navigation.replaceChildren(...filters.map(([id, label, mark]) => sidebarItem({
      label, icon: mark, selected: id === taskFilter,
      select: () => { taskFilter = id; taskList.scrollTop = 0; renderTasks(); },
    })));
    const tasksToShow = tasks.filter((task) => taskFilter === "all" || task.ongoing === (taskFilter === "ongoing"))
      .sort((left, right) => Number(right.ongoing) - Number(left.ongoing) || right.createdAt - left.createdAt);
    if (selectedTask !== undefined) selectedTask = tasks.find((task) => task.id === selectedTask!.id) ?? selectedTask;
    const selectTask = (task: StudioTaskView): void => {
      const changed = selectedTask?.id !== task.id;
      selectedTask = task;
      if (changed) delete libraries.artifacts;
      renderTaskContext();
      for (const card of Array.from(taskList.querySelectorAll<HTMLElement>("[data-task-id]"))) {
        card.classList.toggle("selected", card.dataset.taskId === task.id);
      }
    };
    const entries = tasksToShow.map((task) => taskCard(task, selectedTask?.id === task.id,
      () => selectTask(task), () => { selectTask(task); switchTo("artifacts"); }));
    renderTaskContext();
    if (tasksToShow.length === 0) entries.push(emptyState("tasks",
      library === undefined && request !== undefined ? "Loading tasks…" : taskFilter === "ongoing" ? "No tasks in progress" : "No tasks here",
      taskFilter === "ongoing" && library?.runtime === undefined
        ? "No Runtime is selected. Saved tasks are available under Finished."
        : "Refresh to read the latest task status."));
    // Runtime activity is returned in full on the first page. Older pages contain Results only.
    if (taskFilter !== "ongoing" && library?.next !== undefined) entries.push(continuation("tasks", library.next));
    taskList.replaceChildren(...entries);
    for (const node of Array.from(taskList.querySelectorAll("[data-more-section]"))) morePages.observe(node);
  };

  const renderArtifacts = (): void => {
    videoPreviews.disconnect();
    for (const node of Array.from(artifactGrid.querySelectorAll("[data-more-section]"))) morePages.unobserve(node);
    const cards = new Map(Array.from(artifactGrid.querySelectorAll<HTMLElement>("[data-artifact-id]"), (card) => [card.dataset.artifactId!, card]));
    const library = libraries.artifacts;
    const artifacts = library?.artifacts ?? [];
    const filters = [["all", "All media", "component"], ["video", "Videos", "video"], ["image", "Images", "image"], ["audio", "Audio", "waveform"]] as const;
    const heading = mediaPanel.toolbar.querySelector<HTMLElement>("[data-media-heading]")!;
    heading.textContent = filters.find(([id]) => id === artifactFilter)?.[1] ?? "All media";
    heading.title = "Media category";
    renderTaskContext();
    artifactFilters.replaceChildren(...filters.map(([id, label, mark]) => sidebarItem({
      label, icon: mark, selected: id === artifactFilter,
      select: () => {
        artifactFilter = id;
        delete libraries.artifacts;
        artifactGrid.scrollTop = 0;
        void refresh("artifacts");
        renderArtifacts();
      },
    })));
    const shown = artifactFilter === "all" ? artifacts
      : artifacts.filter((artifact) => artifact.mediaType.startsWith(`${artifactFilter}/`));
    const entries: HTMLElement[] = shown.map((artifact) => {
      const held = cards.get(artifact.id);
      cards.delete(artifact.id);
      if (held !== undefined && held.dataset.build === artifact.build && held.dataset.output === artifact.output
        && held.dataset.displayName === (artifact.displayName ?? "") && held.dataset.nameEditable === String(artifact.nameEditable === true)) return held;
      const previousVideo = held?.querySelector("video");
      if (previousVideo != null) { previousVideo.removeAttribute("src"); previousVideo.load(); }
      return artifactCard(artifact, openArtifact, (updated) => {
        const current = libraries.artifacts;
        if (current !== undefined) libraries.artifacts = { ...current,
          artifacts: current.artifacts.map((item) => item.id === updated.id ? { ...item, displayName: updated.displayName! } : item),
        };
        renamedArtifact(updated);
      });
    });
    for (const card of cards.values()) {
      const video = card.querySelector("video");
      if (video !== null) { video.removeAttribute("src"); video.load(); }
    }
    if (shown.length === 0) entries.push(emptyState("results",
      library === undefined && request !== undefined ? "Loading media…" : artifactFilter === "all" ? "No media" : `No ${artifactFilter} files`,
      "Images, videos and audio published as file Outputs appear here, including those from ongoing Builds."));
    if (library?.next !== undefined) entries.push(continuation("artifacts", library.next));
    artifactGrid.replaceChildren(...entries);
    selectArtifact(selectedArtifact);
    for (const preview of Array.from(artifactGrid.querySelectorAll("video:not([src]), [data-audio-source]:not(.is-ready)"))) videoPreviews.observe(preview);
    for (const node of Array.from(artifactGrid.querySelectorAll("[data-more-section]"))) morePages.observe(node);
  };

  const switchTo = (next: LibrarySection, reload = true): void => {
    active = next;
    for (const tab of Array.from(element.querySelectorAll<HTMLButtonElement>("[data-library-tab]"))) {
      const selected = tab.dataset.libraryTab === next;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    }
    for (const view of Array.from(element.querySelectorAll<HTMLElement>("[data-library-view]"))) {
      view.classList.toggle("active", view.dataset.libraryView === next);
    }
    if (next === "artifacts") renderArtifacts();
    if (next === "tasks") renderTasks();
    if (next !== "source" && reload) void refresh(next);
    else request?.abort();
  };

  const refresh = async (section: "tasks" | "artifacts", before?: string): Promise<void> => {
    if (before !== undefined && request !== undefined) return;
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const status = element.querySelector<HTMLElement>(`[data-library-status="${section}"]`)!;
    status.textContent = "Refreshing…";
    status.hidden = true;
    element.classList.add("is-refreshing");
    try {
      const query = new URLSearchParams({ section });
      if (before !== undefined) query.set("before", before);
      if (section === "artifacts" && artifactFilter !== "all") query.set("media", artifactFilter);
      if (section === "artifacts" && selectedTask !== undefined) query.set("build", selectedTask.id);
      const response = await fetch(`/__studio/library?${query.toString()}`, { signal: controller.signal });
      const value = await response.json() as StudioLibraryView | { readonly error: string };
      if (!response.ok || "error" in value) throw new Error("error" in value ? value.error : "Library unavailable");
      if (controller.signal.aborted) return;
      const previous = libraries[section];
      if (before === undefined || previous === undefined) libraries[section] = value;
      else {
        const tasks = new Map(previous.tasks.map((task) => [task.id, task]));
        for (const task of value.tasks) tasks.set(task.id, task);
        libraries[section] = {
          ...value,
          tasks: [...tasks.values()].sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id)),
          artifacts: mergeStudioArtifacts([...previous.artifacts, ...value.artifacts]),
        };
      }
      if (section === "tasks") renderTasks();
      else renderArtifacts();
      status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      if (!controller.signal.aborted) {
        const detail = error instanceof Error ? error.message : String(error);
        status.hidden = false;
        status.textContent = `Refresh failed: ${detail}${libraries[section] === undefined ? "" : " · Previous view retained"}`;
      }
    } finally {
      if (request === controller) {
        request = undefined;
        element.classList.remove("is-refreshing");
        if (controller.signal.aborted) status.textContent = "Refresh interrupted";
      }
    }
  };

  for (const tab of Array.from(element.querySelectorAll<HTMLButtonElement>("[data-library-tab]"))) {
    tab.addEventListener("click", () => {
      switchTo(tab.dataset.libraryTab as LibrarySection, tab.dataset.libraryTab !== "tasks" || libraries.tasks === undefined);
    });
  }
  for (const button of Array.from(element.querySelectorAll<HTMLButtonElement>("[data-library-refresh]"))) {
    button.addEventListener("click", () => { if (active !== "source") void refresh(active); });
  }

  return {
    element,
    selectArtifact,
    show(value) {
      snapshot = value;
      renderSources();
    },
    refresh: async () => { if (active !== "source") await refresh(active); },
  };
}
