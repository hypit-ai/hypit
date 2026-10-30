import { t, uiDate, uiLabel, uiAttribute, uiText, uiAttr, type Message } from "./i18n.js";
import type {
  StudioArtifactView,
  StudioLibraryView,
  StudioSnapshot,
  StudioTaskView,
} from "../shared.js";
import type { CodePane } from "./code.js";
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

function localizedSidebarItem(input: { label: Message; icon: string; selected: boolean; select(): void }): HTMLButtonElement {
  const button = sidebarItem(input);
  uiAttr(button, "title", input.label);
  uiAttr(button, "aria-label", input.label);
  return button;
}

function emptyState(iconName: string, title: Message, detail: Message): HTMLElement {
  const node = document.createElement("div");
  node.className = "library-empty";
  node.innerHTML = `<span class="library-empty-icon">${icon(iconName)}</span><strong></strong><p></p>`;
  uiText(node.querySelector("strong")!, title);
  uiText(node.querySelector("p")!, detail);
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
  node.setAttribute("aria-label", stem(task.source));
  node.addEventListener("click", select);
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); select(); }
  });
  node.dataset.taskId = task.id;
  const source = task.source;
  const title = stem(source);
  const statuses: Record<StudioTaskView["status"], Message> = {
    queued: "common.queued", running: "common.running", waiting: "common.waiting", complete: "common.completed",
    failed: "common.failed", cancelled: "common.cancelled", "saving-result": "common.saving", attention: "common.needs-attention",
  };
  node.innerHTML = `
    <div class="task-state" aria-hidden="true">${icon(task.ongoing ? "when" : task.status === "complete" ? "check" : task.status === "failed" ? "alert" : "tasks")}</div>
    <div class="task-copy">
      <div class="task-title"><button type="button" class="task-name"></button></div>
      <div class="task-facts"><span class="task-status"></span><time></time></div>
      <div class="task-progress" data-progress></div>
      <div class="task-detail" data-detail></div>
    </div>
    <button type="button" class="task-open" ${uiAttribute("aria-label", "library.view-task-media")} ${uiAttribute("title", "library.view-media")}>${icon("arrowRight")}</button>`;
  const name = node.querySelector<HTMLButtonElement>(".task-name")!;
  name.textContent = title;
  name.addEventListener("click", (event) => { event.stopPropagation(); select(); });
  uiText(node.querySelector<HTMLElement>(".task-status")!, statuses[task.status]);
  const time = node.querySelector("time")!;
  time.dateTime = new Date(task.createdAt).toISOString();
  uiDate(time, task.createdAt);
  const progress = task.ongoing ? taskProgress(task) : undefined;
  const progressNode = node.querySelector<HTMLElement>("[data-progress]")!;
  if (progress === undefined) progressNode.remove();
  else {
    progressNode.textContent = progress; progressNode.title = progress;
    if (!task.operations.some(operation => operation.status === "pending" && operation.phase !== undefined) && task.requests !== undefined) {
      uiText(progressNode, "tasks.progress", task.requests);
      uiAttr(progressNode, "title", "tasks.progress", task.requests);
    }
  }
  const detailNode = node.querySelector<HTMLElement>("[data-detail]")!;
  if (task.detail === undefined) detailNode.remove();
  else {
    const message = document.createElement("div");
    message.className = "task-error-message";
    message.textContent = task.detail;
    detailNode.append(message);
    const copy = document.createElement("button");
    copy.type = "button"; copy.className = "task-copy-error"; uiText(copy, "tasks.copy-error");
    copy.addEventListener("click", (event) => {
      event.stopPropagation();
      void navigator.clipboard.writeText(task.detail!).then(() => { uiText(copy, "common.copied"); }, () => { uiText(copy, "tasks.copy-manually"); });
    });
    detailNode.append(copy);
    detailNode.addEventListener("click", (event) => { event.stopPropagation(); if (!node.classList.contains("selected")) select(); });
  }
  node.querySelector<HTMLButtonElement>(".task-open")!.addEventListener("click", (event) => { event.stopPropagation(); showMedia(); });
  name.title = [title, source, task.id].join("\n");
  return node;
}

function artifactKind(mediaType: string): { readonly label: Message; readonly icon: string } {
  if (mediaType.startsWith("video/")) return { label: "library.video", icon: "video" };
  if (mediaType.startsWith("image/")) return { label: "library.image", icon: "image" };
  if (mediaType.startsWith("audio/")) return { label: "library.audio", icon: "waveform" };
  return { label: "library.data", icon: "code" };
}

function sizeThumbnail(media: HTMLElement, width: number, height: number): void {
  if (width <= 0 || height <= 0) return;
  const longest = Math.max(width, height);
  media.style.width = `${100 * width / longest}%`;
  media.style.height = `${100 * height / longest}%`;
}

function artifactCard(artifact: StudioArtifactView, open: (artifact: StudioArtifactView) => void): HTMLElement {
  const kind = artifactKind(artifact.mediaType);
  const link = document.createElement("div");
  link.tabIndex = 0;
  link.className = `artifact-card artifact-${artifact.mediaType.split("/")[0]}`;
  const query = new URLSearchParams({
    build: artifact.build,
    output: artifact.output,
  });
  const href = `/__studio/artifact?${query.toString()}`;

  link.dataset.artifactId = artifact.id;
  link.dataset.build = artifact.build;
  link.dataset.output = artifact.output;
  const title = artifact.output;
  link.innerHTML = `
    <div class="artifact-preview">
      <span class="artifact-glyph">${icon(kind.icon)}</span>
      <span class="artifact-type"></span>
    </div>`;
  uiText(link.querySelector<HTMLElement>(".artifact-type")!, kind.label);
  const preview = link.querySelector<HTMLElement>(".artifact-preview")!;
  preview.setAttribute("role", "button");
  uiAttr(preview, "aria-label", "library.preview-name", { name: title });
  preview.addEventListener("click", () => open(artifact));
  const copy = document.createElement("div");
  copy.className = "artifact-copy";
  const name = document.createElement("button");
  name.type = "button";
  name.className = "artifact-name";
  const nameText = document.createElement("span");
  nameText.className = "artifact-name-text";
  nameText.textContent = title;
  name.append(nameText);
  name.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!link.classList.contains("selected")) open(artifact);
  });
  copy.append(name);
  link.append(copy);
  link.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target === link) { event.preventDefault(); open(artifact); }
  });
  if (artifact.mediaType.startsWith("image/")) {
    const image = document.createElement("img");
    image.addEventListener("load", () => sizeThumbnail(image, image.naturalWidth, image.naturalHeight));
    image.addEventListener("error", () => { link.classList.add("preview-unavailable"); uiText(link.querySelector<HTMLElement>(".artifact-type")!, "library.preview-unavailable"); });
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
    uiText(label, "library.video-loading-preview");
    const ready = () => {
      if (video.readyState < 2 || video.seeking) return;
      video.classList.add("is-ready");
      uiText(label, "library.video");
    };
    video.addEventListener("loadedmetadata", () => {
      sizeThumbnail(video, video.videoWidth, video.videoHeight);
      video.currentTime = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 2) : 0.1;
    }, { once: true });
    video.addEventListener("loadeddata", ready);
    video.addEventListener("seeked", ready);
    video.addEventListener("error", () => { uiText(label, "library.preview-unavailable"); link.classList.add("preview-unavailable"); });
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
    new Date(artifact.createdAt).toLocaleString(),
    `${artifact.build}/${artifact.filePath}`,
    ...artifact.origins.map((origin) =>
      `${origin.source} · ${origin.build} · ${origin.output}`),
  ].filter((item) => item !== undefined).join("\n");
  return link;
}

export function createLibraryPane(code: CodePane, openArtifact: (artifact: StudioArtifactView) => void): LibraryPane {
  const element = document.createElement("section");
  element.className = "library";
  element.innerHTML = `
    <div class="library-tabs" role="tablist" ${uiAttribute("aria-label", "library.studio-library")}>
      <button type="button" class="library-tab active" data-library-tab="source" role="tab" aria-selected="true">
        <span>${icon("code")}</span><strong>${uiLabel("library.source")}</strong>
      </button>
      <button type="button" class="library-tab" data-library-tab="tasks" role="tab" aria-selected="false">
        <span>${icon("tasks")}</span><strong>${uiLabel("library.tasks")}</strong>
      </button>
      <button type="button" class="library-tab" data-library-tab="artifacts" role="tab" aria-selected="false">
        <span>${icon("results")}</span><strong>${uiLabel("library.artifacts")}</strong>
      </button>
    </div>
    <section class="library-view active" data-library-view="source">
    </section>
    <section class="library-view" data-library-view="tasks"></section>
    <section class="library-view" data-library-view="artifacts">
    </section>`;

  const sourcePanel = createSidebarPanel("panel", "library.referenced-source-files");
  uiAttr(sourcePanel.navigation, "aria-label", "library.referenced-source-files");
  sourcePanel.toolbar.append(code.toolbar);
  sourcePanel.content.classList.add("source-code");
  sourcePanel.content.append(code.element);
  element.querySelector('[data-library-view="source"]')!.append(sourcePanel.element);
  const taskPanel = createSidebarPanel("panel", "library.task-categories");
  uiAttr(taskPanel.navigation, "aria-label", "library.task-categories");
  taskPanel.toolbar.innerHTML = `<span class="code-location" data-task-heading>${uiLabel("library.all-tasks")}</span><div class="task-context" data-task-context hidden></div>
    <button type="button" class="library-refresh" data-library-refresh ${uiAttribute("aria-label", "library.refresh-tasks")} ${uiAttribute("title", "common.refresh")}>${icon("refresh")}</button>`;
  taskPanel.content.innerHTML = `<div class="media-status" data-library-status="tasks" role="status" hidden></div><div class="task-list" data-task-list></div>`;
  element.querySelector('[data-library-view="tasks"]')!.append(taskPanel.element);
  const mediaPanel = createSidebarPanel("panel", "library.media-categories");
  uiAttr(mediaPanel.navigation, "aria-label", "library.media-categories");
  mediaPanel.toolbar.innerHTML = `<span class="code-location" data-media-heading>${uiLabel("library.all-media")}</span><div class="task-context" data-task-context hidden></div>
    <button type="button" class="library-refresh" data-library-refresh ${uiAttribute("aria-label", "library.refresh-media")} ${uiAttribute("title", "common.refresh")}>${icon("refresh")}</button>`;
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
    uiText(node, "library.loading-more");
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
        icon: file.language === "svs" ? "tune" : "code",
        selected: file.path === selectedSource,
        select: () => { selectedSource = file.path; renderSources(); },
      });
      button.title = `${file.role} · ${file.path}${file.imports.length === 0 ? "" : `\nimports ${file.imports.join(", ")}`}`;
      return button;
    }));
  };

  const renderTaskContext = (): void => {
    for (const node of Array.from(element.querySelectorAll<HTMLElement>("[data-task-context]"))) {
      const title = selectedTask === undefined ? undefined : stem(selectedTask.source);
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
      back.querySelector("span")!.textContent = stem(task.source);
      uiAttr(back, "title", "library.task-return", {
        name: stem(task.source),
      });
      back.addEventListener("click", () => {
        taskFilter = "all";
        switchTo("tasks", false);
        renderTasks();
        taskList.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"]`)?.scrollIntoView({ block: "nearest" });
      });
      const clear = document.createElement("button");
      clear.type = "button"; clear.className = "task-context-clear";
      clear.innerHTML = icon("close"); uiAttr(clear, "title", "library.clear-task-filter"); uiAttr(clear, "aria-label", "library.clear-task-filter");
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
    const filters = [["all", "library.all-tasks", "component"], ["ongoing", "library.in-progress", "when"], ["finished", "library.finished", "check"]] as const;
    const heading = taskPanel.toolbar.querySelector<HTMLElement>("[data-task-heading]")!;
    uiText(heading, filters.find(([id]) => id === taskFilter)![1]);
    if (library?.runtime === undefined) uiAttr(heading, "title", "tasks.saved-only");
    else { heading.removeAttribute("data-ui-title"); heading.title = library.runtime; }
    taskPanel.navigation.replaceChildren(...filters.map(([id, label, mark]) => localizedSidebarItem({
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
      library === undefined && request !== undefined ? "library.loading-tasks" : taskFilter === "ongoing" ? "library.no-tasks-in-progress" : "library.no-tasks-here",
      taskFilter === "ongoing" && library?.runtime === undefined
        ? "tasks.no-runtime"
        : "tasks.refresh-hint"));
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
    const filters = [["all", "library.all-media", "component"], ["video", "library.videos", "video"], ["image", "library.images", "image"], ["audio", "library.audio", "waveform"]] as const;
    const heading = mediaPanel.toolbar.querySelector<HTMLElement>("[data-media-heading]")!;
    uiText(heading, filters.find(([id]) => id === artifactFilter)?.[1] ?? "library.all-media");
    uiAttr(heading, "title", "library.media-category");
    renderTaskContext();
    artifactFilters.replaceChildren(...filters.map(([id, label, mark]) => localizedSidebarItem({
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
      if (held !== undefined && held.dataset.build === artifact.build && held.dataset.output === artifact.output) return held;
      const previousVideo = held?.querySelector("video");
      if (previousVideo != null) { previousVideo.removeAttribute("src"); previousVideo.load(); }
      return artifactCard(artifact, openArtifact);
    });
    for (const card of cards.values()) {
      const video = card.querySelector("video");
      if (video !== null) { video.removeAttribute("src"); video.load(); }
    }
    if (shown.length === 0) entries.push(emptyState("results",
      library === undefined && request !== undefined ? "library.loading-media" : artifactFilter === "all" ? "library.no-media" : "library.no-files-in-this-category",
      "library.media-hint"));
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
    uiText(status, "library.refreshing");
    status.hidden = true;
    element.classList.add("is-refreshing");
    try {
      const query = new URLSearchParams({ section });
      if (before !== undefined) query.set("before", before);
      if (section === "artifacts" && artifactFilter !== "all") query.set("media", artifactFilter);
      if (section === "artifacts" && selectedTask !== undefined) query.set("build", selectedTask.id);
      const response = await fetch(`/__studio/library?${query.toString()}`, { signal: controller.signal });
      const value = await response.json() as StudioLibraryView | { readonly error: string };
      if (!response.ok || "error" in value) throw new Error("error" in value ? value.error : t("library.unavailable"));
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
      uiText(status, "library.updated", { time: new Date().toLocaleTimeString() });
    } catch (error) {
      if (!controller.signal.aborted) {
        const detail = error instanceof Error ? error.message : String(error);
        status.hidden = false;
        uiText(status, libraries[section] === undefined ? "library.refresh-failed" : "library.refresh-failed-retained", { detail });
      }
    } finally {
      if (request === controller) {
        request = undefined;
        element.classList.remove("is-refreshing");
        if (controller.signal.aborted) uiText(status, "library.refresh-interrupted");
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
