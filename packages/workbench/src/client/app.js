import { bindWorkbenchTopbar, workbenchTopbar } from "/assets/topbar.js";

const app = document.querySelector("#app");

const icons = {
  media: '<path d="M4 7h16v12H4z"/><path d="m10 10 5 3-5 3z"/>',
  text: '<path d="M5 5h14M12 5v14M8 19h8"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h4M7 14h3M14 10h3M13 14h4"/>',
  transition: '<path d="M4 5h7v14H4zM13 5h7v14h-7zM9 8l6 8M15 8l-6 8"/>',
  effects: '<path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>',
  filter: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  select: '<path d="m5 3 12 9-6 1-3 6z"/>',
  cut: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 11 7M8.5 15.5 19.5 8.5"/>',
  split: '<path d="M12 3v18"/><path d="m4 8 5 4-5 4zM20 8l-5 4 5 4z"/>',
  trimStart: '<path d="M6 4v16M18 7l-6 5 6 5"/>',
  trimEnd: '<path d="M18 4v16M6 7l6 5-6 5"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',
  redo: '<path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  panel: '<path d="M4 4h16v16H4zM15 4v16"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  properties: '<path d="M4 7h7M15 7h5M4 12h3M11 12h9M4 17h9M17 17h3"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="17" r="2"/>',
  where: '<path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4"/><circle cx="12" cy="12" r="2"/>',
  when: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  how: '<path d="M4 7h7M15 7h5M4 12h3M11 12h9M4 17h9M17 17h3"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="17" r="2"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  previous: '<path d="M6 5v14M18 6l-8 6 8 6z"/>',
  next: '<path d="M18 5v14M6 6l8 6-8 6z"/>',
  volume: '<path d="M5 10v4h4l5 4V6l-5 4zM17 9a4 4 0 0 1 0 6"/>',
  mute: '<path d="M5 10v4h4l5 4V6l-5 4zM18 9l4 6M22 9l-4 6"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.5-2"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12"/><circle cx="12" cy="12" r="2"/>',
  hidden: '<path d="m3 3 18 18M10.6 6.2A9 9 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-2 2.7M6.6 6.6C3.8 8.4 2 12 2 12s4 6 10 6a9 9 0 0 0 3.4-.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  snap: '<path d="M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5M8 11h6"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5M8 11h6M11 8v6"/>',
  zoomFit: '<path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4"/><path d="M8 12h8"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  preview: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3-5 3zM9 21h6M12 18v3"/>',
  audio: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  component: '<path d="m12 2 4 2.3v4.6l-4 2.3-4-2.3V4.3zM4 12l4 2.3v4.6l-4 2.3-4-2.3v-4.6zM20 12l4 2.3v4.6l-4 2.3-4-2.3v-4.6z" transform="scale(.8) translate(3 1)"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  comment: '<path d="M4 5h16v11H9l-5 4z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.6-2.1L20 8M4 16l2.3 2.1A7 7 0 0 0 17.9 16"/>',
  check: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  pending: '<circle cx="12" cy="12" r="8"/>',
  edit: '<path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8zM14.5 6.3l3.2 3.2"/>',
  attach: '<path d="m8 12 6.5-6.5a4 4 0 0 1 5.7 5.7L11 20.4a6 6 0 0 1-8.5-8.5L12 2.4"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8 14a5 5 0 0 0 8 0"/>',
  send: '<path d="m3 11 18-8-8 18-2-8zM11 13l5-5"/>',
};

function icon(name, size = 16) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ""}</svg>`;
}

if (location.pathname === "/nle") {
  startNle();
} else if (location.pathname === "/comments") {
  startComments();
} else {
  const selected = location.pathname === "/canvas" ? "canvas" : location.pathname === "/comments" ? "comments" : "scene";
  const surface = selected === "canvas" ? "Canvas" : selected === "comments" ? "Comments" : "Scene";
  app.className = "surface-placeholder";
  app.innerHTML = `${workbenchTopbar({ projectName: surface, active: selected })}<div>${icon(selected === "canvas" ? "component" : selected === "comments" ? "captions" : "image", 24)}<strong>${surface}</strong><span>这个工作面尚未安装。</span></div>`;
  bindWorkbenchTopbar(app);
  app.dataset.loading = "false";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "";
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} KB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

function formatLibraryDuration(value) {
  if (!Number.isFinite(value)) return "";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Ported from the former Studio artifact library; persistence remains caller-owned. */
function createArtifactName(options) {
  const copy = element("div", "artifact-copy");
  const label = element("button", "artifact-name");
  label.type = "button";
  let name = options.name;
  const text = element("span", "artifact-name-text", name);
  label.append(text);
  label.title = options.editable ? `${name}\n双击或按 F2 重命名` : name;
  copy.append(label);
  label.addEventListener("click", event => { event.stopPropagation(); options.select(); });
  let editing = false;
  const edit = () => {
    if (editing || !options.editable) return;
    options.select();
    editing = true;
    copy.classList.add("editing");
    label.hidden = true;
    const field = element("textarea", "artifact-name-editor");
    field.value = name;
    field.rows = 1;
    field.setAttribute("aria-label", "素材名称");
    const error = element("span", "artifact-name-error");
    error.setAttribute("role", "status");
    copy.append(field, error);
    const resize = () => {
      field.style.height = "0px";
      field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
    };
    resize();
    field.focus();
    field.setSelectionRange(name.length, name.length);
    field.addEventListener("input", resize);
    field.addEventListener("click", event => event.stopPropagation());
    let saving = false;
    const close = () => {
      editing = false;
      field.remove();
      error.remove();
      label.hidden = false;
      copy.classList.remove("editing");
    };
    const save = async () => {
      if (!editing || saving) return;
      const value = field.value.trim();
      if (value === name) { close(); return; }
      if (value.length === 0) { error.textContent = "请输入名称"; return; }
      saving = true;
      field.readOnly = true;
      error.textContent = "保存中…";
      try {
        name = await options.save(value);
        text.textContent = name;
        label.title = `${name}\n双击或按 F2 重命名`;
        close();
      } catch (errorValue) {
        error.textContent = errorValue instanceof Error ? errorValue.message : String(errorValue);
      } finally {
        saving = false;
        field.readOnly = false;
      }
    };
    field.addEventListener("blur", () => { void save(); });
    field.addEventListener("keydown", event => {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        event.stopPropagation();
        close();
        label.focus();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void save();
      }
    });
  };
  label.addEventListener("dblclick", event => { event.preventDefault(); event.stopPropagation(); edit(); });
  return { element: copy, edit };
}

const audioPreviews = new Map();
async function audioPreview(url) {
  if (audioPreviews.has(url)) return await audioPreviews.get(url);
  const pending = (async () => {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const width = 1024;
      const height = 56;
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      const samplesPerColumn = Math.max(1, Math.floor(buffer.length / width));
      const segments = [];
      for (let x = 0; x < width; x += 1) {
        const from = x * samplesPerColumn;
        const to = Math.min(buffer.length, from + samplesPerColumn);
        let peak = 0;
        for (const channel of channels) {
          for (let sample = from; sample < to; sample += 1) peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
        }
        const amplitude = Math.max(1, peak * (height - 4));
        const top = (height - amplitude) / 2;
        segments.push(`M${x} ${top.toFixed(2)}V${(top + amplitude).toFixed(2)}`);
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${segments.join("")}" fill="none" stroke="rgba(255,255,255,.76)" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    } finally {
      await context.close();
    }
  })().catch(() => undefined);
  audioPreviews.set(url, pending);
  return await pending;
}

const filmstripRequests = new Map();

function positiveHeader(response, name) {
  const value = Number(response.headers.get(name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function loadFilmstrip(resource) {
  const response = await fetch(resource);
  if (!response.ok) return undefined;
  const count = positiveHeader(response, "x-hypit-storyboard-count");
  const columns = positiveHeader(response, "x-hypit-storyboard-columns");
  const rows = positiveHeader(response, "x-hypit-storyboard-rows");
  const tileWidth = positiveHeader(response, "x-hypit-storyboard-tile-width");
  const tileHeight = positiveHeader(response, "x-hypit-storyboard-tile-height");
  const blob = await response.blob();
  const imageUrl = URL.createObjectURL(blob);
  if ([count, columns, rows, tileWidth, tileHeight].some(value => value === undefined)) {
    const image = new Image();
    image.src = imageUrl;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(imageUrl);
      return undefined;
    }
    if (image.naturalWidth < 1 || image.naturalHeight < 1) {
      URL.revokeObjectURL(imageUrl);
      return undefined;
    }
    return {
      imageUrl,
      count: 1,
      columns: 1,
      rows: 1,
      tileWidth: image.naturalWidth,
      tileHeight: image.naturalHeight,
    };
  }
  return {
    imageUrl,
    count: Math.floor(count),
    columns: Math.floor(columns),
    rows: Math.floor(rows),
    tileWidth: Math.floor(tileWidth),
    tileHeight: Math.floor(tileHeight),
  };
}

function filmstripFor(resource) {
  const held = filmstripRequests.get(resource);
  if (held) return held;
  const pending = loadFilmstrip(resource).catch(() => undefined);
  filmstripRequests.set(resource, pending);
  return pending;
}

function renderFilmstrip(target, filmstrip, direction) {
  if (!target.isConnected) return;
  const box = target.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return;
  const slotWidth = Math.max(1, box.height * filmstrip.tileWidth / filmstrip.tileHeight);
  const slotCount = Math.max(1, Math.ceil(box.width / slotWidth));
  const frames = [];
  for (let slot = 0; slot < slotCount; slot += 1) {
    const left = slot * slotWidth;
    const progress = Math.max(0, Math.min(1, (left + slotWidth / 2) / box.width));
    const chronological = Math.min(filmstrip.count - 1, Math.floor(progress * filmstrip.count));
    const index = direction === "reverse" ? filmstrip.count - 1 - chronological : chronological;
    const column = index % filmstrip.columns;
    const row = Math.floor(index / filmstrip.columns);
    const frame = element("span", "timeline-item-filmstrip-frame");
    frame.style.left = `${left}px`;
    frame.style.width = `${slotWidth}px`;
    frame.style.backgroundImage = `url(${JSON.stringify(filmstrip.imageUrl)})`;
    frame.style.backgroundSize = `${filmstrip.columns * slotWidth}px ${filmstrip.rows * box.height}px`;
    frame.style.backgroundPosition = `${-column * slotWidth}px ${-row * box.height}px`;
    frames.push(frame);
  }
  target.replaceChildren(...frames);
  target.classList.add("ready");
}

function mountFilmstrip(target, resource, direction) {
  void filmstripFor(resource).then(filmstrip => {
    if (filmstrip) renderFilmstrip(target, filmstrip, direction);
  });
}

function seconds(value) {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function frames(value, rate) {
  return seconds(value) * rate.numerator / rate.denominator;
}

function frameValue(count, rate) {
  return { ticks: String(count), timeBase: { numerator: rate.denominator, denominator: rate.numerator } };
}

function itemEnd(item, rate) {
  return frames(item.start, rate) + frames(item.duration, rate);
}

function itemLabel(item, media) {
  if (item.name) return item.name;
  if (item.kind === "adjustment") return item.component.name;
  if (item.source === "media") return media.find(value => value.asset === item.asset.path)?.name
    ?? item.asset.path.split("/").at(-1).replace(/\.media\.json$/, "");
  if (item.source === "component") return item.component.name;
  return item.composition.name;
}

function itemIcon(item) {
  if (item.kind === "adjustment") return "effects";
  if (item.source === "media") return "film";
  if (item.source === "component") return "component";
  return "image";
}

function itemType(item) {
  return item.kind === "adjustment" ? "Adjustment" : `Present · ${item.source}`;
}

function formatNumber(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, "");
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) [a, b] = [b, a % b];
  return Math.max(1, a);
}

function aspectRatioLabel(width, height) {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function timecode(frame, rate) {
  const fps = rate.numerator / rate.denominator;
  const safe = Math.max(0, Math.round(frame));
  const totalSeconds = Math.floor(safe / fps);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const secs = totalSeconds % 60;
  const localFrame = Math.floor(safe - totalSeconds * fps);
  return [hours, minutes, secs, localFrame].map(value => String(value).padStart(2, "0")).join(":");
}

function playbackTime(frame, rate) {
  const centiseconds = Math.max(0, Math.round(frame * rate.denominator / rate.numerator * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor(centiseconds / 6000) % 60;
  const seconds = Math.floor(centiseconds / 100) % 60;
  const fraction = centiseconds % 100;
  const tail = `${String(seconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}`
    : `${minutes}:${tail}`;
}

async function request(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? `Workbench request failed (${response.status})`);
  return value;
}

function startComments() {
  const state = {
    snapshot: undefined,
    feedback: undefined,
    frame: 0,
    playing: false,
    muted: false,
    filter: "all",
    animation: undefined,
    busy: false,
    selected: undefined,
    editing: undefined,
    anchor: undefined,
    pendingAttachments: [],
    emojiOpen: false,
    previewKey: undefined,
    previewCommandFrame: undefined,
    previewCommandId: 0,
    previewScrubbing: false,
  };

  app.className = "comments-editor";
  app.innerHTML = `${workbenchTopbar({ projectName: "正在打开工程…", active: "comments", mode: "timeline" })}
    <main class="comments-shell">
      <section class="comments-preview-pane">
        <header class="comments-pane-heading"><div>${icon("preview", 14)}<strong>预览</strong></div></header>
        <div class="comments-stage"><div id="comments-frame" class="comments-frame"><iframe id="comments-programme" title="Programme preview"></iframe><div class="comments-frame-fallback"><span>hypit</span><strong>正在准备预览</strong></div></div></div>
        <footer class="comments-player">
          <input id="comments-scrubber" class="preview-scrubber" type="range" min="0" max="1" step="1" value="0" aria-label="评论预览时间">
          <div class="comments-transport">
            <output id="comments-time">0:00.00 / 0:00.00</output>
            <div class="comments-transport-center">
              <button class="icon-button" type="button" data-review-action="previous" title="上一帧">${icon("previous")}</button>
              <button class="comments-play" type="button" data-review-action="play" title="播放">${icon("play", 18)}</button>
              <button class="icon-button" type="button" data-review-action="next" title="下一帧">${icon("next")}</button>
            </div>
            <button class="icon-button comments-mute" type="button" data-review-action="mute" title="静音">${icon("volume")}</button>
          </div>
        </footer>
      </section>
      <aside class="comments-panel">
        <header class="comments-panel-heading">
          <div>${icon("comment", 14)}<strong>评论</strong><span id="comments-count"></span></div>
          <button class="icon-button" type="button" data-review-action="refresh" title="刷新评论">${icon("refresh", 14)}</button>
        </header>
        <nav class="comments-filters" aria-label="评论筛选">
          <button type="button" data-comment-filter="all">全部</button>
          <button type="button" data-comment-filter="pending">待处理</button>
          <button type="button" data-comment-filter="resolved">已完成</button>
        </nav>
        <div id="comments-error" class="comments-error" role="status" aria-live="polite" hidden></div>
        <div id="comments-list" class="comments-list"></div>
        <footer class="comments-composer">
          <button id="comment-at" class="comment-at" type="button" title="使用当前帧">00:00.00</button>
          <div class="comment-input-shell">
            <textarea id="comment-input" rows="3" placeholder="想调整哪里？" spellcheck="true" enterkeyhint="send"></textarea>
            <div id="comment-pending-attachments" class="comment-pending-attachments" hidden></div>
            <div class="comments-composer-actions">
              <div class="comment-tools">
                <button type="button" data-review-action="emoji" title="插入表情">${icon("smile", 15)}</button>
                <button type="button" data-review-action="attach" title="添加图片">${icon("attach", 15)}</button>
                <span>也可以拖入或粘贴图片</span>
              </div>
              <button id="comment-send" class="comment-send" type="button" title="发送评论" disabled>${icon("send", 15)}</button>
            </div>
          </div>
          <input id="comment-files" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple hidden>
          <div id="comment-emoji-picker" class="comment-emoji-picker" hidden>${["👍", "❤️", "😂", "😮", "😢", "🔥", "✨"].map(value => `<button type="button" data-comment-emoji="${value}">${value}</button>`).join("")}</div>
        </footer>
      </aside>
    </main>`;
  bindWorkbenchTopbar(app);

  const frameNode = app.querySelector("#comments-frame");
  const programmeFrame = frameNode.querySelector("#comments-programme");
  const frameFallback = frameNode.querySelector(".comments-frame-fallback");
  const scrubber = app.querySelector("#comments-scrubber");
  const input = app.querySelector("#comment-input");
  const inputShell = app.querySelector(".comment-input-shell");
  const filesInput = app.querySelector("#comment-files");
  const pendingAttachments = app.querySelector("#comment-pending-attachments");
  const emojiPicker = app.querySelector("#comment-emoji-picker");

  const fps = () => state.snapshot.view.editRate.numerator / state.snapshot.view.editRate.denominator;
  const maximumFrame = () => Math.max(1, state.snapshot.scene.maximumFrame);
  const frameSeconds = () => state.frame / fps();
  const seek = frame => {
    state.frame = Math.max(0, Math.min(Math.round(frame), maximumFrame()));
    renderCommentsChrome();
    renderCommentsPreview();
    seekPreview(true);
  };

  function reviewTime(value) {
    const centiseconds = Math.max(0, Math.round(value * 100));
    const minutes = Math.floor(centiseconds / 6000);
    const seconds = Math.floor(centiseconds / 100) % 60;
    const fraction = centiseconds % 100;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(2, "0")}`;
  }

  function showCommentsError(error) {
    const node = app.querySelector("#comments-error");
    node.hidden = error === undefined;
    node.textContent = error === undefined ? "" : error instanceof Error ? error.message : String(error);
  }

  const acceptedFeedbackImages = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
  const comments = () => state.feedback?.comments ?? [];
  const clearPendingAttachments = () => {
    for (const pending of state.pendingAttachments) URL.revokeObjectURL(pending.url);
    state.pendingAttachments = [];
  };
  const renderPendingAttachments = () => {
    pendingAttachments.replaceChildren();
    pendingAttachments.hidden = state.pendingAttachments.length === 0;
    for (const [index, pending] of state.pendingAttachments.entries()) {
      const item = element("figure", "comment-pending-attachment");
      const image = document.createElement("img");
      image.src = pending.url;
      image.alt = pending.file.name;
      const remove = element("button", "", "×");
      remove.type = "button";
      remove.dataset.pendingAttachmentRemove = String(index);
      remove.title = `移除 ${pending.file.name}`;
      item.append(image, remove);
      pendingAttachments.append(item);
    }
  };
  const addPendingAttachments = fileList => {
    showCommentsError();
    for (const file of [...fileList]) {
      if (state.pendingAttachments.length >= 8) {
        showCommentsError("一条评论最多附加 8 张图片。");
        break;
      }
      if (!acceptedFeedbackImages.has(file.type)) {
        showCommentsError(`${file.name || "这个文件"} 不是支持的 PNG、JPEG、WebP、GIF 或 AVIF 图片。`);
        continue;
      }
      if (file.size > 12 * 1024 * 1024) {
        showCommentsError(`${file.name} 超过了 12 MiB。`);
        continue;
      }
      state.pendingAttachments.push({ file, url: URL.createObjectURL(file) });
    }
    renderPendingAttachments();
    renderCommentsChrome();
  };
  const previewCommand = (action, detail = {}) => {
    const commandId = ++state.previewCommandId;
    programmeFrame.contentWindow?.postMessage({
      type: "hypit.html-document.command@1",
      action,
      commandId,
      ...detail,
    }, location.origin);
  };
  const seekPreview = (force = false) => {
    const frame = Math.max(0, Math.min(Math.round(state.frame), Math.max(0, maximumFrame() - 1)));
    if (!force && state.previewCommandFrame === frame) return;
    state.previewCommandFrame = frame;
    previewCommand("seek", { frame });
  };

  function renderCommentsChrome() {
    if (!state.snapshot) return;
    app.querySelector("#comments-time").textContent = `${playbackTime(state.frame, state.snapshot.view.editRate)} / ${playbackTime(maximumFrame(), state.snapshot.view.editRate)}`;
    app.querySelector("#comment-at").textContent = reviewTime(state.anchor?.at ?? frameSeconds());
    scrubber.max = String(maximumFrame());
    scrubber.value = String(Math.round(state.frame));
    scrubber.style.setProperty("--preview-progress", `${Math.max(0, Math.min(1, state.frame / maximumFrame())) * 100}%`);
    const play = app.querySelector('[data-review-action="play"]');
    const playIcon = state.playing ? "pause" : "play";
    if (play.dataset.icon !== playIcon) {
      play.dataset.icon = playIcon;
      play.innerHTML = icon(playIcon, 18);
    }
    play.title = state.playing ? "暂停" : "播放";
    play.setAttribute("aria-label", play.title);
    app.querySelector('[data-review-action="mute"]').innerHTML = icon(state.muted ? "mute" : "volume");
    app.querySelector("#comment-send").disabled = state.busy || state.feedback === undefined
      || state.anchor === undefined || (input.value.trim().length === 0 && state.pendingAttachments.length === 0);
    filesInput.disabled = state.busy;
    renderPendingAttachments();
  }

  function renderCommentsPreview() {
    if (!state.snapshot) return;
    const project = state.snapshot.project;
    const key = `${project.revision}:${state.snapshot.view.revision}`;
    if (state.previewKey !== key) {
      state.previewKey = key;
      state.previewCommandFrame = undefined;
      frameNode.classList.add("fallback");
      frameFallback.querySelector("strong").textContent = "正在准备 Programme 预览";
      programmeFrame.src = `/api/nle/programme?revision=${project.revision}&viewRevision=${state.snapshot.view.revision}`;
      return;
    }
    if (!state.playing) seekPreview();
  }

  async function refreshFeedback() {
    if (state.busy) return;
    try {
      state.feedback = await request("/api/nle/feedback");
      showCommentsError();
      renderCommentsList();
    } catch (error) {
      showCommentsError(error);
    }
  }

  async function mutateFeedback(mutation, saved, uploads = []) {
    if (state.busy) return;
    state.busy = true;
    showCommentsError();
    renderCommentsList();
    renderCommentsChrome();
    try {
      state.feedback = await request("/api/nle/feedback", { mutation, uploads });
      saved?.();
      showCommentsError();
    } catch (error) {
      showCommentsError(error);
    } finally {
      state.busy = false;
      renderCommentsList();
      renderCommentsChrome();
    }
  }

  function captureCommentAnchor() {
    stopPlayback();
    state.anchor = { at: frameSeconds() };
    renderCommentsChrome();
  }

  function renderCommentsList() {
    const list = app.querySelector("#comments-list");
    const focused = list.querySelector(".comment-edit textarea");
    const cursor = focused === document.activeElement
      ? { start: focused.selectionStart, end: focused.selectionEnd }
      : undefined;
    list.replaceChildren();
    const visible = comments()
      .map((comment, index) => ({ comment, number: index + 1 }))
      .sort((left, right) => left.comment.at - right.comment.at)
      .filter(({ comment }) => state.filter === "all" || (state.filter === "resolved") === comment.resolved);
    for (const { comment, number: ordinal } of visible) {
      const card = element("article", `comment-card${comment.resolved ? " resolved" : ""}${state.selected === comment.id ? " selected" : ""}`);
      card.dataset.commentId = comment.id;
      card.addEventListener("click", event => {
        if (event.target.closest?.("button,a,form") || window.getSelection()?.isCollapsed === false) return;
        state.selected = comment.id;
        stopPlayback();
        seek(comment.at * fps());
        renderCommentsList();
      });
      const heading = element("header", "comment-card-heading");
      const time = element("button", "comment-time", reviewTime(comment.at));
      time.type = "button";
      time.dataset.commentSeek = comment.id;
      time.title = "跳到这一帧";
      const number = element("span", "comment-number", `#${ordinal}`);
      const controls = element("div", "comment-controls");
      const resolve = element("button", "");
      resolve.type = "button";
      resolve.dataset.commentToggle = comment.id;
      resolve.title = comment.resolved ? "标为待处理" : "标为已完成";
      resolve.innerHTML = icon(comment.resolved ? "check" : "pending", 14);
      const edit = element("button", "");
      edit.type = "button";
      edit.dataset.commentEdit = comment.id;
      edit.title = "编辑评论";
      edit.innerHTML = icon("edit", 14);
      const remove = element("button", "");
      remove.type = "button";
      remove.dataset.commentDelete = comment.id;
      remove.title = "删除评论";
      remove.innerHTML = icon("trash", 14);
      controls.append(resolve, edit, remove);
      heading.append(time, number, controls);
      card.append(heading);
      if (state.editing?.id === comment.id) {
        const form = element("form", "comment-edit");
        const textarea = document.createElement("textarea");
        textarea.rows = 3;
        textarea.value = state.editing.text;
        textarea.setAttribute("aria-label", "编辑评论文字");
        const actions = element("div", "comment-edit-actions");
        const cancel = element("button", "", "取消");
        cancel.type = "button";
        cancel.dataset.commentEditCancel = comment.id;
        const save = element("button", "", "保存");
        save.type = "submit";
        save.disabled = state.busy || (textarea.value.trim().length === 0 && comment.attachments.length === 0);
        textarea.addEventListener("input", () => {
          if (state.editing) state.editing.text = textarea.value;
          save.disabled = state.busy || (textarea.value.trim().length === 0 && comment.attachments.length === 0);
        });
        actions.append(cancel, save);
        form.append(textarea, actions);
        form.addEventListener("submit", event => {
          event.preventDefault();
          if (!state.editing || (textarea.value.trim().length === 0 && comment.attachments.length === 0)) return;
          void mutateFeedback({
            type: "replace",
            before: state.editing.before,
            comment: { ...state.editing.before, text: textarea.value.trim() },
          }, () => { state.editing = undefined; });
        });
        card.append(form);
      } else {
        if (comment.text.length > 0) card.append(element("p", "comment-text", comment.text));
        if (comment.attachments.length > 0) {
          const attachments = element("div", "comment-attachments");
          for (const attachment of comment.attachments) {
            const link = element("a", "comment-attachment");
            link.href = `/api/nle/feedback/attachment?id=${encodeURIComponent(attachment.id)}`;
            link.target = "_blank";
            link.rel = "noreferrer";
            link.title = attachment.name;
            const image = document.createElement("img");
            image.src = link.href;
            image.alt = attachment.name;
            link.append(image);
            attachments.append(link);
          }
          card.append(attachments);
        }
      }
      list.append(card);
    }
    if (!visible.length) {
      const empty = element("div", "comments-empty");
      const loading = state.feedback === undefined;
      empty.innerHTML = `${icon(state.filter === "resolved" ? "check" : "comment", 20)}<strong>${loading ? "正在读取 project.feedback.json" : state.filter === "resolved" ? "还没有已完成评论" : state.filter === "pending" ? "当前没有待处理评论" : "这里还没有评论"}</strong><span>${loading ? "评论是项目文件，不是浏览器假数据。" : state.filter === "all" ? "在下方写下对当前帧的反馈。" : "切换筛选条件查看其它评论。"}</span>`;
      list.append(empty);
    }
    app.querySelector("#comments-count").textContent = state.feedback ? String(comments().length) : "";
    for (const button of app.querySelectorAll("[data-comment-filter]")) button.setAttribute("aria-selected", String(button.dataset.commentFilter === state.filter));
    if (cursor) {
      const next = list.querySelector(".comment-edit textarea");
      next?.focus({ preventScroll: true });
      next?.setSelectionRange(cursor.start, cursor.end);
    }
  }

  function render() {
    if (!state.snapshot) return;
    const project = state.snapshot.project;
    state.anchor ??= { at: frameSeconds() };
    document.title = `${project.name} · Hypit Comments`;
    app.querySelector("[data-project-name]").textContent = project.name;
    frameNode.style.aspectRatio = `${project.canvas.width} / ${project.canvas.height}`;
    frameNode.style.setProperty("--comments-ratio", String(project.canvas.width / project.canvas.height));
    frameNode.style.backgroundColor = project.canvas.clearColor;
    renderCommentsChrome();
    renderCommentsPreview();
    renderCommentsList();
    app.dataset.loading = "false";
  }

  function stopPlayback() {
    state.playing = false;
    if (state.animation !== undefined) cancelAnimationFrame(state.animation);
    state.animation = undefined;
    previewCommand("pause");
    if (state.snapshot) renderCommentsChrome();
  }

  function togglePlayback() {
    if (state.playing) { stopPlayback(); return; }
    if (state.frame >= maximumFrame()) state.frame = 0;
    state.playing = true;
    seekPreview(true);
    previewCommand("play");
    renderCommentsChrome();
  }

  async function uploadFeedbackImage(file) {
    const response = await fetch(`/api/nle/feedback/upload?name=${encodeURIComponent(file.name || "image")}`, {
      method: "POST",
      headers: { "content-type": file.type },
      body: file,
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message ?? `图片上传失败 (${response.status})`);
    return value;
  }

  async function discardFeedbackUploads(uploads) {
    await Promise.all(uploads.map(upload => fetch(
      `/api/nle/feedback/upload?token=${encodeURIComponent(upload.token)}`,
      { method: "DELETE" },
    ).catch(() => undefined)));
  }

  async function addComment() {
    const text = input.value.trim();
    if ((!text && state.pendingAttachments.length === 0) || !state.feedback || !state.anchor || state.busy) return;
    const pending = [...state.pendingAttachments];
    const uploads = [];
    state.busy = true;
    showCommentsError();
    renderCommentsChrome();
    try {
      for (const attachment of pending) uploads.push(await uploadFeedbackImage(attachment.file));
      const comment = {
        id: `c-${crypto.randomUUID()}`,
        context: state.feedback.context,
        at: state.anchor.at,
        text,
        resolved: false,
        attachments: uploads.map(upload => upload.attachment),
      };
      state.feedback = await request("/api/nle/feedback", {
        mutation: { type: "add", comment },
        uploads: uploads.map(upload => ({ token: upload.token, attachment: upload.attachment })),
      });
      input.value = "";
      input.style.height = "";
      clearPendingAttachments();
      state.selected = comment.id;
      state.anchor = { at: frameSeconds() };
      state.filter = "all";
      state.emojiOpen = false;
      emojiPicker.hidden = true;
    } catch (error) {
      await discardFeedbackUploads(uploads);
      showCommentsError(error);
    } finally {
      state.busy = false;
      renderCommentsList();
      renderCommentsChrome();
    }
  }

  app.addEventListener("click", event => {
    const target = event.target.closest?.("button");
    if (!target || !state.snapshot) return;
    if (target.dataset.pendingAttachmentRemove !== undefined) {
      const index = Number(target.dataset.pendingAttachmentRemove);
      const [removed] = state.pendingAttachments.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      renderCommentsChrome();
      return;
    }
    if (target.dataset.commentEmoji) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.setRangeText(target.dataset.commentEmoji, start, end, "end");
      input.dispatchEvent(new Event("input"));
      input.focus();
      state.emojiOpen = false;
      emojiPicker.hidden = true;
      return;
    }
    if (target.dataset.commentFilter) { state.filter = target.dataset.commentFilter; renderCommentsList(); return; }
    if (target.dataset.commentSeek) {
      const comment = comments().find(value => value.id === target.dataset.commentSeek);
      if (comment) { state.selected = comment.id; stopPlayback(); seek(comment.at * fps()); renderCommentsList(); }
      return;
    }
    if (target.dataset.commentToggle) {
      const comment = comments().find(value => value.id === target.dataset.commentToggle);
      if (comment) void mutateFeedback({ type: "replace", before: comment, comment: { ...comment, resolved: !comment.resolved } });
      return;
    }
    if (target.dataset.commentEdit) {
      const comment = comments().find(value => value.id === target.dataset.commentEdit);
      if (comment) {
        state.editing = { id: comment.id, before: comment, text: comment.text };
        state.selected = comment.id;
        stopPlayback();
        seek(comment.at * fps());
        renderCommentsList();
        app.querySelector(`.comment-card[data-comment-id="${CSS.escape(comment.id)}"] .comment-edit textarea`)?.focus();
      }
      return;
    }
    if (target.dataset.commentEditCancel) { state.editing = undefined; renderCommentsList(); return; }
    if (target.dataset.commentDelete) {
      const comment = comments().find(value => value.id === target.dataset.commentDelete);
      if (comment) void mutateFeedback({ type: "delete", before: comment }, () => {
        if (state.selected === comment.id) state.selected = undefined;
        if (state.editing?.id === comment.id) state.editing = undefined;
      });
      return;
    }
    if (target.id === "comment-send") { void addComment(); return; }
    if (target.id === "comment-at") { captureCommentAnchor(); return; }
    const action = target.dataset.reviewAction;
    if (action === "previous") { stopPlayback(); seek(state.frame - 1); }
    if (action === "next") { stopPlayback(); seek(state.frame + 1); }
    if (action === "play") togglePlayback();
    if (action === "mute") { state.muted = !state.muted; previewCommand("mute", { muted: state.muted }); renderCommentsChrome(); }
    if (action === "refresh") void refreshFeedback();
    if (action === "attach") filesInput.click();
    if (action === "emoji") {
      state.emojiOpen = !state.emojiOpen;
      emojiPicker.hidden = !state.emojiOpen;
    }
  });
  const beginPreviewScrub = () => {
    if (state.previewScrubbing) return;
    state.previewScrubbing = true;
    stopPlayback();
  };
  const scrubPreview = () => {
    if (!state.previewScrubbing) stopPlayback();
    state.frame = Math.max(0, Math.min(Math.round(Number(scrubber.value)), maximumFrame()));
    renderCommentsChrome();
    seekPreview(true);
  };
  const finishPreviewScrub = () => {
    if (!state.previewScrubbing) return;
    state.previewScrubbing = false;
    seekPreview(true);
  };
  scrubber.addEventListener("pointerdown", beginPreviewScrub);
  scrubber.addEventListener("input", scrubPreview);
  scrubber.addEventListener("change", finishPreviewScrub);
  scrubber.addEventListener("pointerup", finishPreviewScrub);
  scrubber.addEventListener("pointercancel", finishPreviewScrub);
  filesInput.addEventListener("change", () => {
    if (filesInput.files) addPendingAttachments(filesInput.files);
    filesInput.value = "";
  });
  input.addEventListener("focus", () => { if (input.value.length === 0) captureCommentAnchor(); else stopPlayback(); });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(180, input.scrollHeight)}px`;
    renderCommentsChrome();
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229 || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!event.repeat) void addComment();
  });
  input.addEventListener("paste", event => {
    const images = [...event.clipboardData.files].filter(file => acceptedFeedbackImages.has(file.type));
    if (images.length === 0) return;
    event.preventDefault();
    addPendingAttachments(images);
  });
  inputShell.addEventListener("dragover", event => {
    if (![...event.dataTransfer.items].some(item => item.kind === "file")) return;
    event.preventDefault();
    inputShell.classList.add("drag-over");
  });
  inputShell.addEventListener("dragleave", event => {
    if (!inputShell.contains(event.relatedTarget)) inputShell.classList.remove("drag-over");
  });
  inputShell.addEventListener("drop", event => {
    event.preventDefault();
    inputShell.classList.remove("drag-over");
    addPendingAttachments(event.dataTransfer.files);
  });
  addEventListener("keydown", event => {
    if (!state.snapshot || event.target.matches("textarea,input")) return;
    if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); stopPlayback(); seek(state.frame - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); stopPlayback(); seek(state.frame + 1); }
  });

  programmeFrame.addEventListener("load", () => {
    frameNode.classList.remove("fallback");
    previewCommand("mute", { muted: state.muted });
    seekPreview(true);
    if (state.playing) previewCommand("play");
  });
  addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== programmeFrame.contentWindow) return;
    if (event.data?.type === "hypit.html-document.error@1") {
      frameNode.classList.add("fallback");
      frameFallback.querySelector("strong").textContent = event.data.message || "Programme 预览不可用";
      return;
    }
    if (event.data?.type !== "hypit.html-document.state@1") return;
    const commandId = Number.isSafeInteger(event.data.commandId) ? event.data.commandId : 0;
    if (commandId < state.previewCommandId) return;
    if (state.previewScrubbing) return;
    if (Number.isFinite(event.data.frame)) state.frame = Math.max(0, Math.min(event.data.frame, maximumFrame()));
    state.playing = event.data.playing === true;
    state.previewCommandFrame = state.frame;
    renderCommentsChrome();
  });
  document.addEventListener("pointerdown", event => {
    if (state.selected === undefined) return;
    const card = event.target.closest?.(".comment-card");
    if (card?.dataset.commentId === state.selected) return;
    state.selected = undefined;
    app.querySelector(".comment-card.selected")?.classList.remove("selected");
  });
  addEventListener("focus", () => { if (state.feedback) void refreshFeedback(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.feedback) void refreshFeedback();
  });

  request("/api/nle").then(value => {
    state.snapshot = value;
    state.anchor = { at: frameSeconds() };
    render();
    void refreshFeedback();
  }).catch(error => {
    app.dataset.loading = "false";
    frameFallback.querySelector("strong").textContent = error instanceof Error ? error.message : String(error);
  });
}

function startNle() {
  const state = {
    snapshot: undefined,
    selection: undefined,
    frame: 0,
    playing: false,
    muted: false,
    busy: false,
    inspector: undefined,
    inspectorRequest: 0,
    inspectorDomainByItem: new Map(),
    inspectorPageByItem: new Map(),
    inspectorCache: new Map(),
    inspectorLoads: new Map(),
    inspectorPendingKey: undefined,
    inspectorPrefetchTimer: undefined,
    bin: "media",
    mediaFilter: "all",
    renameEdit: undefined,
    tool: "select",
    zoomWindow: { start: 0, end: 1 },
    timelineScrollRatio: .5,
    timelineVerticalReady: false,
    animation: undefined,
    previewKey: undefined,
    previewCommandFrame: undefined,
    previewCommandId: 0,
    layersOpen: false,
    spatialDraft: undefined,
    previewScrubbing: false,
  };

  app.className = "nle-editor properties-open";
  app.innerHTML = `
    <header class="nle-library-toolbar topbar">
      <div class="product-mark brand" aria-label="Hypit"><span class="brand-mark" aria-hidden="true">
        <svg class="brand-symbol" viewBox="50 180 262 234"><path fill="currentColor" d="M303.78 277.82c-5.98-8.63-15.83-13.77-26.32-13.77h-93.41c-12.28 0-24.92 7.44-29.6 18.8l-28.26 75.82c-4.6 11.25-4.54 24.05 2.22 34.16 6.79 10.15 19.36 16.15 31.57 16.15h85.98c14.12 0 26.9-8.88 31.84-22.1l29.69-79.57c3.67-9.84 2.29-20.86-3.69-29.48Zm-51.76 99.43c-.94 2.52-3.39 4.22-6.08 4.22h-83.45c-4.34 0-6.68-2.8-7.49-3.99s-2.5-4.43-.84-8.44l23.85-66.24c2.29-6.35 8.08-10.87 14.82-11.22.33-.02.67-.02 1.02-.02h75.41s12.51 1.42 9.29 14.61l-26.53 71.09ZM106.85 361.73s-22.36-11.59-17.66-32.66l29.67-82.23c4.78-13.25 17.36-22.09 31.45-22.09h95.02c6.25 0 12.1 3.03 15.71 8.14l13.89 19.68H161.96c-8.7 0-16.49 5.41-19.52 13.57l-35.59 95.6Zm-33.55-38.46s-22.37-11.59-17.66-32.66l29.67-82.23c4.79-13.25 17.37-22.09 31.45-22.09h89.91c6.25 0 12.1 3.03 15.71 8.14l13.89 19.68H128.43c-8.7 0-16.49 5.41-19.52 13.57l-35.59 95.6Z"/></svg>
        <svg class="brand-wordmark" viewBox="370 228 422 180"><g fill="currentColor"><rect x="692.47" y="276.19" width="19.22" height="90.09" rx="4.12"/><path d="M462.31 293.32c-4.51-11.11-12.93-15.68-28.26-17.66-15.52-2-31.17 1.58-36.41 2.96V240.2c0-2.22-1.8-4.02-4.02-4.02h-11.19c-2.22 0-4.02 1.8-4.02 4.02v123.26c0 2.22 1.8 4.02 4.02 4.02h11.19c2.22 0 4.02-1.8 4.02-4.02v-66.25c3.68-1.46 16.84-6.13 30.89-4.57 12.12 1.35 15.81 10.13 16.92 14.75.32 1.33.47 2.68.47 4.03v53.36c0 1.49 1.2 2.68 2.68 2.68h13.65c1.49 0 2.68-1.2 2.68-2.68V307.4c0-4.82-.82-9.63-2.63-14.09Z"/><path d="M568.55 346.34v-67.42c0-1.57-1.27-2.85-2.85-2.85h-14.66c-1.57 0-2.85 1.27-2.85 2.85v64.51c0 .58-.19 1.16-.58 1.6-1.62 1.88-7.33 6.23-25.19 5.92-2.22.05-6.37-.58-8.51-1.13-14.03-3.61-12.62-17.41-12.62-33.16v-37.73c0-1.57-1.27-2.85-2.85-2.85h-13.68c-1.57 0-2.85 1.27-2.85 2.85v57.63s-2.72 24.49 25.91 30.92c0 0 3.11.67 7.45 1.01 3.13.16 8.78.27 14.27-.42 6.97-.77 13.42-2.51 17.37-5.02 0 0-1.77 20.45-18.82 23.73-9.86 1.13-24.24-.46-31.62-1.65-2.22-.36-4.33 1.06-4.84 3.24l-2.55 10.92c-.49 2.08.99 4.09 3.1 4.28 7.44.63 23.6 1.84 34.54 1.37 14.62-.61 26.8-6.24 34.06-21.17 7.26-14.93 5.93-37.54 5.93-37.54Z"/><path d="M674.19 297.63c-8.46-21.2-28.09-21.76-37.64-22.58-7.78-.66-37.08.93-47.69 1.54-2.17.13-3.86 1.92-3.86 4.1v119.88c0 1.74 1.41 3.14 3.14 3.14h14.17c1.74 0 3.14-1.41 3.14-3.14v-34.16c45.01 4.23 52.91-1.5 60.82-8.86 8.8-8.2 15.13-37.91 7.91-59.92Zm-17.73 33.19c-.27 4.64-1.91 18-19.5 19.22-17.59 1.23-31.5-2.32-31.5-2.32v-54.21c4.62-.18 16.65-.61 25.09-.61 10.64 0 15.27 1.5 21.82 8.32s4.37 24.96 4.09 29.59Z"/><path d="M784.34 292.92c1.41 0 2.56-1.15 2.56-2.56v-11.6c0-1.41-1.15-2.56-2.56-2.56h-27.3v-19.11c0-1.32-1.07-2.38-2.38-2.38h-14.87c-1.32 0-2.38 1.07-2.38 2.38v19.11h-10.74c-1.41 0-2.56 1.15-2.56 2.56v11.6c0 1.41 1.15 2.56 2.56 2.56h10.74v48.61c0 14.46 11.72 26.19 26.19 26.19h19.46c2.13 0 3.86-1.73 3.86-3.86v-9.69c0-2.13-1.73-3.86-3.86-3.86h-13.53c-6.9 0-12.48-5.59-12.48-12.48v-44.92h27.3Z"/></g><circle fill="#e83f5f" cx="703.1" cy="250.37" r="14.18"/></svg>
      </span></div>
      <div class="document-state project-title">
        <strong id="project-name">正在打开工程…</strong><span id="document-status"></span>
      </div>
      <div class="document-actions topbar-right">
        <button class="icon-button" type="button" data-action="undo" title="撤销">${icon("undo")}</button>
        <button class="icon-button" type="button" data-action="redo" title="重做">${icon("redo")}</button>
      </div>
    </header>
    <div class="nle-upper">
      <aside class="nle-bin">
        <nav class="nle-bin-heading" aria-label="创作工具">
          <button type="button" data-bin="media">${icon("media")}<span>素材</span><i></i></button>
          <button type="button" data-bin="components">${icon("component")}<span>组件</span><i></i></button>
          <button type="button" data-bin="captions">${icon("captions")}<span>字幕</span><i></i></button>
          <button type="button" data-bin="transitions">${icon("transition")}<span>转场</span><i></i></button>
          <button type="button" data-bin="effects">${icon("effects")}<span>特效</span><i></i></button>
          <button type="button" data-bin="filters">${icon("filter")}<span>滤镜</span><i></i></button>
        </nav>
        <div id="bin-content" class="nle-panel-body"></div>
      </aside>
      <div class="nle-pane-handle column" data-resize-pane="bin" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <section class="nle-monitor">
        <header class="nle-monitor-title"><div class="monitor-heading">${icon("preview", 14)}<strong>预览</strong></div><button class="icon-button monitor-layers-button" type="button" data-action="canvas-layers" title="当前画面图层" aria-label="当前画面图层" aria-expanded="false">${icon("layers", 15)}</button></header>
        <div class="nle-stage"><div id="programme" class="nle-canvas"></div><aside id="canvas-layer-panel" class="canvas-layer-panel" hidden></aside></div>
        <footer class="nle-transport">
          <input id="transport-scrubber" class="preview-scrubber" type="range" min="0" max="1" step="1" value="0" aria-label="预览时间">
          <span id="transport-time" class="transport-time">0:00.00 / 0:00.00</span>
          <div class="transport-center">
            <button class="icon-button" type="button" data-action="previous" title="上一帧">${icon("previous")}</button>
            <button class="transport-play" type="button" data-action="play" title="播放">${icon("play", 18)}</button>
            <button class="icon-button" type="button" data-action="next" title="下一帧">${icon("next")}</button>
          </div>
          <button class="icon-button" type="button" data-action="mute" title="静音">${icon("volume")}</button>
        </footer>
      </section>
      <div class="nle-pane-handle column properties-handle" data-resize-pane="properties" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <aside class="nle-properties">
        <nav id="inspector-tabs" class="nle-inspector-tabs" aria-label="属性分类"></nav>
        <div id="inspector" class="nle-panel-body"></div>
      </aside>
    </div>
    <div class="nle-pane-handle row" data-resize-pane="timeline" role="separator" aria-orientation="horizontal" tabindex="0"></div>
    <section class="nle-timeline">
      <header class="nle-timeline-toolbar">
        <button class="icon-button" type="button" data-action="tool-select" title="选择工具" aria-label="选择工具">${icon("select")}</button>
        <button class="icon-button" type="button" data-action="undo" title="撤销">${icon("undo")}</button>
        <button class="icon-button" type="button" data-action="redo" title="重做">${icon("redo")}</button>
        <span class="toolbar-separator"></span>
        <button class="icon-button" type="button" data-action="tool-cut" title="切割工具">${icon("cut")}</button>
        <button class="icon-button" type="button" data-action="trim-start" title="将左边沿裁到播放头">${icon("trimStart")}</button>
        <button class="icon-button" type="button" data-action="split" title="在播放头分割">${icon("split")}</button>
        <button class="icon-button" type="button" data-action="trim-end" title="将右边沿裁到播放头">${icon("trimEnd")}</button>
        <button class="icon-button" type="button" data-action="remove" title="删除">${icon("trash")}</button>
        <output id="timeline-timecode" class="timeline-timecode">00:00:00:00</output>
        <div class="toolbar-space"></div>
        <div class="nle-zoom">
          <button class="icon-button" type="button" data-action="zoom-fit" title="适应内容">${icon("zoomFit")}</button>
          <button class="icon-button" type="button" data-action="zoom-out" title="缩小">${icon("zoomOut")}</button>
          <input id="timeline-zoom" type="range" min="0" max="100" step="1" value="0" aria-label="时间线缩放">
          <button class="icon-button" type="button" data-action="zoom-in" title="放大">${icon("zoomIn")}</button>
        </div>
        <span class="toolbar-separator"></span>
        <button class="export-button" type="button" data-action="export">${icon("export", 13)}<span>导出</span></button>
      </header>
      <div id="timeline-scroll" class="nle-timeline-scroll"><div id="tracks" class="nle-tracks" data-timeline-background></div></div>
      <div id="timeline-zoom-strip" class="nle-timeline-zoom-strip" aria-label="时间线可视范围">
        <div id="timeline-zoom-window" class="nle-timeline-zoom-window">
          <span class="nle-timeline-zoom-grip start" data-zoom-grip="start"></span>
          <span class="nle-timeline-zoom-grip end" data-zoom-grip="end"></span>
        </div>
      </div>
    </section>
    <dialog id="nle-export-dialog" class="nle-export-dialog">
      <form id="nle-export-form" class="nle-export-form">
        <header><div>${icon("export", 16)}<strong>导出视频</strong></div><button type="button" data-export-close aria-label="关闭">×</button></header>
        <div class="nle-export-fields">
          <label><span>文件名</span><input id="export-file-name" name="fileName" type="text" maxlength="192" required></label>
          <fieldset><legend>输出尺寸</legend><label><span>宽度</span><input id="export-width" name="width" type="number" min="1" step="1" required></label><b>×</b><label><span>高度</span><input id="export-height" name="height" type="number" min="1" step="1" required></label></fieldset>
          <label><span>帧率</span><select id="export-frame-rate" name="frameRate"></select></label>
          <label><span>质量</span><select id="export-quality" name="quality"><option value="draft">草稿</option><option value="standard" selected>标准</option><option value="high">高</option></select></label>
        </div>
        <section id="export-status" class="nle-export-status" hidden><div><span id="export-status-label"></span><strong id="export-status-value"></strong></div><progress id="export-progress"></progress><p id="export-output"></p></section>
        <footer><button class="secondary-button" type="button" data-export-close>关闭</button><button class="secondary-button" id="export-cancel" type="button" hidden>取消导出</button><button class="export-button" id="export-start" type="submit">${icon("export", 13)}<span>开始导出</span></button></footer>
      </form>
    </dialog>
    <div id="notice" class="notice" role="status" aria-live="polite"></div>`;

  app.querySelector(".nle-library-toolbar.topbar").outerHTML = workbenchTopbar({
    projectName: "正在打开工程…",
    active: "timeline",
    mode: "timeline",
  });
  bindWorkbenchTopbar(app);

  const libraryPreviews = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      libraryPreviews.unobserve(entry.target);
      if (entry.target instanceof HTMLImageElement) {
        const image = entry.target;
        void audioPreview(image.dataset.audioSource).then(url => {
          if (!url || !image.isConnected) return;
          image.src = url;
          image.classList.add("is-ready");
        });
      } else if (entry.target instanceof HTMLVideoElement) {
        entry.target.preload = "metadata";
        entry.target.src = entry.target.dataset.previewSource;
      }
    }
  }, { root: app.querySelector("#bin-content"), rootMargin: "80px" });

  const upper = app.querySelector(".nle-upper");
  const installResizeHandle = ({ name, axis, initial, minimum, maximum, invert = false, apply }) => {
    const handle = app.querySelector(`[data-resize-pane="${name}"]`);
    const memory = `hypit.workbench.nle.${name}-size`;
    const held = Number(localStorage.getItem(memory));
    let size = Number.isFinite(held) && held > 0 ? held : initial;
    const settle = value => {
      size = Math.max(minimum, Math.min(maximum(), value));
      apply(size);
      localStorage.setItem(memory, String(size));
    };
    settle(size);
    handle.addEventListener("pointerdown", event => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const from = axis === "column" ? event.clientX : event.clientY;
      const began = size;
      const move = moved => {
        const at = axis === "column" ? moved.clientX : moved.clientY;
        settle(began + (at - from) * (invert ? -1 : 1));
      };
      const done = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", done);
        handle.removeEventListener("pointercancel", done);
        try { handle.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", done);
      handle.addEventListener("pointercancel", done);
    });
    handle.addEventListener("keydown", event => {
      const step = event.shiftKey ? 48 : 12;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") settle(size - step);
      else if (event.key === "ArrowRight" || event.key === "ArrowDown") settle(size + step);
      else return;
      event.preventDefault();
    });
    return settle;
  };
  const settleBinWidth = installResizeHandle({
    name: "bin", axis: "column", initial: 416, minimum: 240,
    maximum: () => Math.max(240, upper.clientWidth - (app.classList.contains("properties-open") ? 648 : 328)),
    apply: size => upper.style.setProperty("--bin-width", `${size}px`),
  });
  const settlePropertiesWidth = installResizeHandle({
    name: "properties", axis: "column", initial: 320, minimum: 260, invert: true,
    maximum: () => Math.max(260, upper.clientWidth - 576),
    apply: size => upper.style.setProperty("--properties-width", `${size}px`),
  });
  const settleTimelineHeight = installResizeHandle({
    name: "timeline", axis: "row", initial: Math.round(innerHeight * .45), minimum: 220, invert: true,
    maximum: () => Math.max(220, app.clientHeight - 300),
    apply: size => app.style.setProperty("--timeline-height", `${size}px`),
  });
  addEventListener("resize", () => {
    settleBinWidth(Number.parseFloat(getComputedStyle(upper).getPropertyValue("--bin-width")) || 416);
    settlePropertiesWidth(Number.parseFloat(getComputedStyle(upper).getPropertyValue("--properties-width")) || 320);
    settleTimelineHeight(Number.parseFloat(getComputedStyle(app).getPropertyValue("--timeline-height")) || Math.round(innerHeight * .45));
  });

  const notice = app.querySelector("#notice");
  const notify = (message, error = false) => {
    notice.textContent = message;
    notice.dataset.error = String(error);
    notice.dataset.visible = "true";
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { notice.dataset.visible = "false"; }, error ? 6000 : 2200);
  };

  const exportDialog = app.querySelector("#nle-export-dialog");
  const exportForm = app.querySelector("#nle-export-form");
  let exportPollTimer;
  const greatestCommonDivisor = (left, right) => {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b !== 0) [a, b] = [b, a % b];
    return a || 1;
  };
  const exportProgressCopy = progress => {
    if (!progress) return ["准备导出", ""];
    if (progress.phase === "open") return ["打开工程", progress.state === "complete" ? "完成" : ""];
    if (progress.phase === "load-packages") return ["加载组件", progress.state === "complete" ? "完成" : ""];
    if (progress.phase === "media") return ["准备素材", `${progress.completed}/${progress.total}`];
    if (progress.phase === "lower") return ["编译节目", progress.state === "complete" ? "完成" : ""];
    if (progress.phase === "picture") return ["渲染画面", progress.frames === undefined ? "" : `${progress.frames} 帧`];
    if (progress.phase === "audio") return ["渲染音频", progress.state === "complete" ? "完成" : ""];
    if (progress.phase === "mux") return ["合成 MP4", progress.state === "complete" ? "完成" : ""];
    return ["发布文件", progress.state === "complete" ? "完成" : ""];
  };
  const renderExportState = job => {
    const running = job.state === "running";
    const status = app.querySelector("#export-status");
    const label = app.querySelector("#export-status-label");
    const value = app.querySelector("#export-status-value");
    const output = app.querySelector("#export-output");
    const progress = app.querySelector("#export-progress");
    const start = app.querySelector("#export-start");
    const cancel = app.querySelector("#export-cancel");
    status.hidden = job.state === "idle";
    start.hidden = running;
    start.querySelector("span").textContent = job.state === "complete" ? "再次导出" : "开始导出";
    cancel.hidden = !running;
    for (const control of exportForm.querySelectorAll("input,select")) control.disabled = running;
    if (job.state === "idle") return;
    if (running) {
      const copy = exportProgressCopy(job.progress);
      label.textContent = copy[0];
      value.textContent = copy[1];
      output.textContent = "";
      if (job.progress?.phase === "media" && job.progress.total > 0) {
        progress.max = job.progress.total;
        progress.value = job.progress.completed;
      } else {
        progress.removeAttribute("value");
      }
      return;
    }
    progress.max = 1;
    progress.value = job.state === "complete" ? 1 : 0;
    if (job.state === "complete") {
      label.textContent = "导出完成";
      value.textContent = `${job.output.canvas.width}×${job.output.canvas.height} · ${job.output.frameCount} 帧`;
      output.textContent = job.output.path;
      return;
    }
    label.textContent = job.state === "cancelled" ? "导出已取消" : "导出失败";
    value.textContent = "";
    output.textContent = job.error ?? "";
  };
  const pollExportState = async () => {
    clearTimeout(exportPollTimer);
    if (!exportDialog.open) return;
    try {
      const job = await request("/api/nle/export");
      renderExportState(job);
      if (job.state === "running") exportPollTimer = setTimeout(() => { void pollExportState(); }, 350);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  };
  const openExportDialog = async () => {
    const project = currentProject();
    const divisor = greatestCommonDivisor(project.canvas.width, project.canvas.height);
    exportDialog.dataset.aspectWidth = String(project.canvas.width / divisor);
    exportDialog.dataset.aspectHeight = String(project.canvas.height / divisor);
    app.querySelector("#export-file-name").value = `${project.id}.mp4`;
    app.querySelector("#export-width").value = String(project.canvas.width);
    app.querySelector("#export-height").value = String(project.canvas.height);
    const rates = [[24, 1], [25, 1], [30, 1], [30000, 1001], [60, 1]];
    const currentRate = state.snapshot.view.editRate;
    if (!rates.some(([numerator, denominator]) => numerator === currentRate.numerator
      && denominator === currentRate.denominator)) rates.push([currentRate.numerator, currentRate.denominator]);
    const rateSelect = app.querySelector("#export-frame-rate");
    rateSelect.replaceChildren(...rates.map(([numerator, denominator]) => {
      const option = document.createElement("option");
      option.value = `${numerator}/${denominator}`;
      option.textContent = denominator === 1 ? `${numerator} fps` : `${numerator}/${denominator} fps`;
      option.selected = numerator === currentRate.numerator && denominator === currentRate.denominator;
      return option;
    }));
    exportDialog.showModal();
    await pollExportState();
  };
  const snapExportResolution = source => {
    const aspectWidth = Number(exportDialog.dataset.aspectWidth);
    const aspectHeight = Number(exportDialog.dataset.aspectHeight);
    const width = app.querySelector("#export-width");
    const height = app.querySelector("#export-height");
    const scale = source === width
      ? Math.max(1, Math.round(Number(width.value) / aspectWidth))
      : Math.max(1, Math.round(Number(height.value) / aspectHeight));
    width.value = String(aspectWidth * scale);
    height.value = String(aspectHeight * scale);
  };
  app.querySelector("#export-width").addEventListener("change", event => snapExportResolution(event.currentTarget));
  app.querySelector("#export-height").addEventListener("change", event => snapExportResolution(event.currentTarget));
  for (const close of app.querySelectorAll("[data-export-close]")) close.addEventListener("click", () => {
    clearTimeout(exportPollTimer);
    exportDialog.close();
  });
  exportDialog.addEventListener("cancel", () => clearTimeout(exportPollTimer));
  exportForm.addEventListener("submit", async event => {
    event.preventDefault();
    snapExportResolution(app.querySelector("#export-width"));
    const [numerator, denominator] = app.querySelector("#export-frame-rate").value.split("/").map(Number);
    try {
      const job = await request("/api/nle/export", {
        revision: currentProject().revision,
        fileName: app.querySelector("#export-file-name").value.trim(),
        quality: app.querySelector("#export-quality").value,
        frameRate: { numerator, denominator },
        resolution: {
          width: Number(app.querySelector("#export-width").value),
          height: Number(app.querySelector("#export-height").value),
        },
      });
      renderExportState(job);
      exportPollTimer = setTimeout(() => { void pollExportState(); }, 250);
    } catch (error) {
      renderExportState({ state: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.querySelector("#export-cancel").addEventListener("click", async () => {
    const response = await fetch("/api/nle/export", { method: "DELETE" });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error?.message ?? "取消导出失败");
    renderExportState(job);
  });

  const currentProject = () => state.snapshot.project;
  const minimumTrackHeight = 32;
  const maximumTrackHeight = 240;
  const defaultTrackHeight = kind => kind === "picture" ? 76 : 48;
  const trackLocked = track => state.snapshot.view.tracks.find(value => value.track === track)?.locked ?? false;
  const trackMuteLabel = track => track.kind === "audio"
    ? (track.muted ? "取消静音" : "静音")
    : (track.muted ? "启用轨道" : "停用轨道");
  const maximumFrame = () => state.snapshot.scene.maximumFrame;
  const programmeFrame = frame => Math.max(0, Math.min(
    Math.round(frame),
    Math.max(0, maximumFrame() - 1),
  ));
  const previewCommand = (action, detail = {}) => {
    const iframe = app.querySelector("#programme iframe");
    const target = iframe?.contentWindow;
    if (!iframe || !target) return;
    const request = action === "mute" ? undefined : ++state.previewCommandId;
    const invoke = async () => {
      await target.__hypitDocument?.ready;
      if (iframe.contentWindow !== target || request !== undefined && request !== state.previewCommandId) return;
      if (action === "play") await target.__hypitPlayFrame?.(programmeFrame(detail.frame ?? state.frame));
      else if (action === "pause" || action === "seek") {
        await target.__hypitSeekFrame?.(programmeFrame(detail.frame ?? state.frame));
      } else if (action === "mute") await target.__hypitSetMuted?.(detail.muted === true);
      else throw new Error(`Unknown Programme command ${action}.`);
    };
    void invoke().catch(error => {
      state.playing = false;
      renderChrome();
      notify(error instanceof Error ? error.message : String(error), true);
    });
  };
  const seekProgramme = (force = false) => {
    const frame = programmeFrame(state.frame);
    if (!force && state.previewCommandFrame === frame) return;
    state.previewCommandFrame = frame;
    previewCommand("seek", { frame });
  };
  const selectedTrack = () => state.selection?.type === "track" ? currentProject().tracks.find(track => track.id === state.selection.id) : undefined;
  const selectedItem = () => {
    if (state.selection?.type !== "item") return undefined;
    for (const track of currentProject().tracks) {
      const item = track.items.find(candidate => candidate.id === state.selection.id);
      if (item) return { track, item };
    }
    return undefined;
  };
  const timelineSceneItem = id => state.snapshot.scene.tracks
    .flatMap(track => track.items).find(item => item.id === id);
  const selectedTimelineSceneItem = () => state.selection?.type === "item"
    ? timelineSceneItem(state.selection.id) : undefined;
  const canvasLayer = id => state.snapshot?.canvasScene.layers.find(layer => layer.id === id);
  const canvasLayerActive = layer => layer.enabled && !layer.trackMuted
    && state.frame >= layer.startFrame && state.frame < layer.startFrame + layer.durationFrames;
  const activeCanvasLayers = () => state.snapshot?.canvasScene.layers.filter(canvasLayerActive) ?? [];

  const update = async (path, body, success) => {
    if (state.busy) return;
    state.busy = true;
    renderChrome();
    try {
      state.snapshot = await request(path, body);
      if (success) notify(success);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  };

  const transact = async (label, commands, success) => await update("/api/nle/transaction", {
    label,
    transaction: { revision: currentProject().revision, commands },
  }, success);
  const transactView = async (commands, success) => await update("/api/nle/view-transaction", {
    transaction: { revision: state.snapshot.view.revision, commands },
  }, success);

  const placeProjectMedia = async (entry, track, frame) => {
    if (state.busy) return;
    state.busy = true;
    renderChrome();
    try {
      const rate = state.snapshot.view.editRate;
      const response = await request("/api/nle/place-media", {
        revision: currentProject().revision,
        media: entry.id,
        track,
        at: frameValue(frame, rate),
        ...(entry.kind === "image" ? {
          duration: frameValue(Math.max(1, Math.round(5 * rate.numerator / rate.denominator)), rate),
        } : {}),
      });
      state.snapshot = response.snapshot;
      state.selection = { type: "item", id: response.item };
      state.frame = frame;
      notify("素材已放入时间线");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  };

  const updateSpatialLayout = async (item, layout, success = "画面布局已更新") => {
    if (state.busy) return;
    state.busy = true;
    renderChrome();
    try {
      state.snapshot = await request("/api/nle/spatial-edit", {
        revision: currentProject().revision,
        item,
        layout,
      });
      state.spatialDraft = undefined;
      notify(success);
    } catch (error) {
      state.spatialDraft = undefined;
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  };

  function select(selection) {
    const refreshLibrary = [state.selection?.type, selection?.type].some(type => type === "media");
    state.selection = selection;
    if (refreshLibrary) renderBin();
    renderChrome();
    renderInspector();
    renderCanvasScene();
    paintTimeline();
  }

  function seek(frame) {
    state.frame = Math.max(0, Math.min(Math.round(frame), Math.ceil(timelineExtentFrame())));
    renderChrome();
    renderMonitor();
    paintTimeline();
  }

  const narrowestZoomWindow = () => 1 / Math.max(1, maximumFrame());
  const widestZoomWindow = 4;
  const timelineExtentFrame = () => Math.max(1, maximumFrame()) * widestZoomWindow;

  function settleZoom(start, end) {
    const width = Math.max(narrowestZoomWindow(), Math.min(widestZoomWindow, end - start));
    const from = Math.max(0, Math.min(widestZoomWindow - width, start));
    state.zoomWindow = { start: from, end: from + width };
    syncZoomChrome();
    renderTimeline();
  }

  function pinchZoom(at, factor) {
    const shown = state.zoomWindow;
    const width = shown.end - shown.start;
    const anchor = Math.max(0, Math.min(1, at));
    const wanted = Math.max(narrowestZoomWindow(), Math.min(widestZoomWindow, width * factor));
    const held = shown.start + width * anchor;
    settleZoom(held - wanted * anchor, held + wanted * (1 - anchor));
  }

  function slideZoom(by) {
    const shown = state.zoomWindow;
    const width = shown.end - shown.start;
    settleZoom(shown.start + by * width, shown.end + by * width);
  }

  function playheadFraction() {
    const shown = state.zoomWindow;
    const at = state.frame / Math.max(1, maximumFrame());
    return Math.max(0, Math.min(1, (at - shown.start) / Math.max(1e-6, shown.end - shown.start)));
  }

  function placeFrame(frame) {
    const shown = state.zoomWindow;
    return (frame / Math.max(1, maximumFrame()) - shown.start) / Math.max(1e-6, shown.end - shown.start);
  }

  function frameAtPointer(surface, event) {
    const rectangle = surface.getBoundingClientRect();
    const across = rectangle.width === 0 ? 0 : Math.max(0, Math.min(1, (event.clientX - rectangle.left) / rectangle.width));
    const shown = state.zoomWindow;
    return (shown.start + across * (shown.end - shown.start)) * maximumFrame();
  }

  function syncZoomChrome() {
    const shown = state.zoomWindow;
    const width = shown.end - shown.start;
    const slider = app.querySelector("#timeline-zoom");
    if (slider) {
      const minimum = narrowestZoomWindow();
      const range = Math.log(widestZoomWindow / minimum);
      slider.value = String(Math.round(
        (range === 0 ? 0 : Math.max(0, Math.min(1, Math.log(widestZoomWindow / width) / range))) * 100,
      ));
    }
    const windowNode = app.querySelector("#timeline-zoom-window");
    if (windowNode) {
      windowNode.style.left = `${shown.start / widestZoomWindow * 100}%`;
      windowNode.style.width = `${width / widestZoomWindow * 100}%`;
    }
  }

  function paintTimeline() {
    if (!state.snapshot) return;
    for (const item of app.querySelectorAll(".timeline-item")) {
      const selected = state.selection?.type === "item" && state.selection.id === item.dataset.item;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    }
    for (const row of app.querySelectorAll(".nle-track")) {
      row.classList.toggle("selected", state.selection?.type === "track" && state.selection.id === row.dataset.trackRow);
    }
    const at = placeFrame(state.frame);
    const outside = at < 0 || at > 1;
    const line = app.querySelector(".nle-playhead");
    const grip = app.querySelector(".nle-playhead-grip");
    if (line) {
      line.style.left = `${at * 100}%`;
      line.classList.toggle("outside", outside);
    }
    if (grip) {
      grip.style.left = `${at * 100}%`;
      grip.classList.toggle("outside", outside);
    }
  }

  function rulerTime(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor(whole / 60) % 60;
    const local = `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
    return hours === 0 ? local : `${String(hours).padStart(2, "0")}:${local}`;
  }

  function rateDivisors(rate) {
    const values = [];
    for (let value = 1; value <= rate; value += 1) {
      if (rate % value === 0) values.push(value);
    }
    return values;
  }

  function clockStepAtLeast(minimumSeconds) {
    const minimum = Math.max(1, minimumSeconds);
    let unit = 1;
    while (minimum > unit * 60) unit *= 60;
    for (const subdivision of rateDivisors(60)) {
      const step = subdivision * unit;
      if (step >= minimum) return step;
    }
    return unit * 60;
  }

  function nearMultiple(value, step) {
    return Math.abs(value / step - Math.round(value / step)) < 1e-6;
  }

  function drawTimelineRuler(scale) {
    if (!scale || !state.snapshot) return;
    scale.replaceChildren();
    const exactRate = state.snapshot.view.editRate.numerator / state.snapshot.view.editRate.denominator;
    const rate = Math.max(1, Math.round(exactRate));
    const shown = state.zoomWindow;
    const projectFrameCount = Math.max(1, maximumFrame());
    const extentFrameCount = timelineExtentFrame();
    const startFrame = shown.start * projectFrameCount;
    const endFrame = shown.end * projectFrameCount;
    const visibleFrames = Math.max(1, endFrame - startFrame);
    const width = Math.max(1, scale.clientWidth);
    const pixelsPerFrame = width / visibleFrames;
    const pixelsPerSecond = pixelsPerFrame * exactRate;
    const startSecond = startFrame / exactRate;
    const endSecond = endFrame / exactRate;
    const majorSeconds = clockStepAtLeast(112 / pixelsPerSecond);

    const context = element("span", "nle-ruler-context", rulerTime(startSecond));
    scale.append(context);

    for (let second = Math.max(0, Math.ceil((startSecond - 1e-6) / majorSeconds) * majorSeconds);
      second <= endSecond + 1e-6; second += majorSeconds) {
      const frame = second * exactRate;
      const at = placeFrame(frame);
      if (at < 0 || at > 1) continue;
      const tick = element("span", `nle-ruler-tick nle-ruler-tick-second major${at > .94 ? " last" : ""}`);
      tick.style.left = `${at * 100}%`;
      if (at * width >= 52) tick.textContent = rulerTime(second);
      scale.append(tick);
    }

    const frameLattice = rateDivisors(rate).map(value => value / exactRate);
    const minimumMinorSeconds = 12 / pixelsPerSecond;
    const minorStepSeconds = frameLattice.find(value => value >= minimumMinorSeconds)
      ?? clockStepAtLeast(minimumMinorSeconds);
    const frameLabelStep = frameLattice.find(value => value < 1 && value * pixelsPerSecond >= 68);
    const firstMinor = Math.max(0, Math.ceil((startSecond - 1e-6) / minorStepSeconds));
    const lastMinor = Math.floor((endSecond + 1e-6) / minorStepSeconds);
    for (let index = firstMinor; index <= lastMinor; index += 1) {
      const second = index * minorStepSeconds;
      const frame = second * exactRate;
      if (frame > extentFrameCount + 1e-6 || nearMultiple(second, majorSeconds)) continue;
      const at = placeFrame(frame);
      if (at < 0 || at > 1) continue;
      const wholeSecond = nearMultiple(second, 1);
      const labelled = frameLabelStep !== undefined
        && !wholeSecond
        && nearMultiple(second, frameLabelStep)
        && at * width >= 52;
      const tick = element("span", wholeSecond
        ? "nle-ruler-tick nle-ruler-tick-second minor"
        : "nle-ruler-tick nle-ruler-tick-frame");
      tick.style.left = `${at * 100}%`;
      scale.append(tick);
      if (labelled) {
        const withinSecond = Math.round((second - Math.floor(second)) * exactRate);
        const label = element("span", "nle-ruler-frame-label", `${withinSecond}f`);
        label.style.left = `${at * 100}%`;
        scale.append(label);
      }
    }

    const grip = element("span", "nle-playhead-grip");
    scale.append(grip);
    paintTimeline();
  }

  function stopPlayback() {
    state.playing = false;
    if (state.animation !== undefined) cancelAnimationFrame(state.animation);
    state.animation = undefined;
    previewCommand("pause", { frame: programmeFrame(state.frame) });
    renderChrome();
  }

  function startPlaybackChrome() {
    if (state.animation !== undefined) return;
    let previous = performance.now();
    const tick = now => {
      if (!state.playing) {
        state.animation = undefined;
        return;
      }
      const fps = state.snapshot.view.editRate.numerator / state.snapshot.view.editRate.denominator;
      state.frame = Math.min(Math.max(0, maximumFrame() - 1), state.frame + (now - previous) / 1000 * fps);
      previous = now;
      previewCommand("play", { frame: programmeFrame(state.frame) });
      renderChrome();
      const position = placeFrame(state.frame);
      if (position > .88 && state.zoomWindow.end < .9999) {
        slideZoom(Math.max(.25, position - .18));
      } else {
        paintTimeline();
      }
      state.animation = requestAnimationFrame(tick);
    };
    state.animation = requestAnimationFrame(tick);
  }

  function togglePlayback() {
    if (state.playing) {
      stopPlayback();
      renderChrome();
      return;
    }
    if (state.frame >= Math.max(0, maximumFrame() - 1)) {
      state.frame = 0;
      seekProgramme(true);
    }
    state.playing = true;
    previewCommand("play", { frame: programmeFrame(state.frame) });
    startPlaybackChrome();
    renderChrome();
  }

  function renderChrome() {
    if (!state.snapshot) return;
    const project = currentProject();
    app.querySelector("[data-project-name]").textContent = project.name;
    const undo = app.querySelector('[data-action="undo"]');
    undo.disabled = state.busy || !state.snapshot.canUndo;
    undo.title = state.snapshot.undoLabel ? `撤销：${state.snapshot.undoLabel}` : "没有可撤销的操作";
    const redo = app.querySelector('[data-action="redo"]');
    redo.disabled = state.busy || !state.snapshot.canRedo;
    redo.title = state.snapshot.redoLabel ? `重做：${state.snapshot.redoLabel}` : "没有可重做的操作";
    app.querySelector('[data-action="tool-cut"]').classList.toggle("active", state.tool === "cut");
    const selected = selectedItem();
    const selectedScene = selectedTimelineSceneItem();
    const selectedLocked = selected !== undefined && trackLocked(selected.track.id);
    const playheadInside = selected !== undefined
      && state.frame > frames(selected.item.start, state.snapshot.view.editRate)
      && state.frame < itemEnd(selected.item, state.snapshot.view.editRate);
    const split = app.querySelector('[data-action="split"]');
    split.disabled = state.busy || selectedLocked || !playheadInside || !selectedScene?.editing.split;
    app.querySelector('[data-action="trim-start"]').disabled = state.busy || selectedLocked || !playheadInside || !selectedScene?.editing.trimStart;
    app.querySelector('[data-action="trim-end"]').disabled = state.busy || selectedLocked || !playheadInside || !selectedScene?.editing.trimEnd;
    app.querySelector('[data-action="remove"]').disabled = state.busy || selected === undefined || selectedLocked;
    const play = app.querySelector('[data-action="play"]');
    const playIcon = state.playing ? "pause" : "play";
    if (play.dataset.icon !== playIcon) {
      play.dataset.icon = playIcon;
      play.innerHTML = icon(playIcon, 18);
    }
    play.title = state.playing ? "暂停" : "播放";
    play.setAttribute("aria-label", play.title);
    app.querySelector('[data-action="mute"]').innerHTML = icon(state.muted ? "mute" : "volume");
    const scrubber = app.querySelector("#transport-scrubber");
    scrubber.max = String(maximumFrame());
    scrubber.value = String(Math.max(0, Math.min(Math.round(state.frame), maximumFrame())));
    scrubber.style.setProperty("--preview-progress", `${Math.max(0, Math.min(1, state.frame / Math.max(1, maximumFrame()))) * 100}%`);
    const layers = app.querySelector('[data-action="canvas-layers"]');
    layers.classList.toggle("active", state.layersOpen);
    layers.setAttribute("aria-expanded", String(state.layersOpen));
    app.querySelector("#transport-time").textContent = `${playbackTime(state.frame, state.snapshot.view.editRate)} / ${playbackTime(maximumFrame(), state.snapshot.view.editRate)}`;
    app.querySelector("#timeline-timecode").textContent = timecode(state.frame, state.snapshot.view.editRate);
  }

  function selectLibrary(selection) {
    state.selection = selection;
    for (const card of app.querySelectorAll(".artifact-card")) {
      const selected = card.dataset.libraryId === selection?.id;
      card.classList.toggle("selected", selected);
      if (selected) card.setAttribute("aria-current", "true");
      else card.removeAttribute("aria-current");
    }
    renderChrome();
    renderInspector();
    renderCanvasScene();
    paintTimeline();
  }

  let draggedProjectMediaId;

  function sizeLibraryPreview(node, width, height) {
    if (!(width > 0 && height > 0)) return;
    const longest = Math.max(width, height);
    node.style.width = `${100 * width / longest}%`;
    node.style.height = `${100 * height / longest}%`;
  }

  function artifactCard(entry) {
    const selection = { type: "media", id: entry.id };
    const card = element("article", `artifact-card artifact-${entry.kind}`);
    card.tabIndex = 0;
    card.draggable = true;
    card.dataset.libraryId = entry.id;
    card.addEventListener("dragstart", event => {
      if (!event.dataTransfer) return;
      draggedProjectMediaId = entry.id;
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-hypit-media-asset", entry.id);
      event.dataTransfer.setData("text/plain", entry.id);
    });
    card.addEventListener("dragend", () => { draggedProjectMediaId = undefined; });
    card.classList.toggle("selected", state.selection?.type === selection.type && state.selection.id === entry.id);
    card.addEventListener("click", () => selectLibrary(selection));
    card.addEventListener("keydown", event => {
      if (event.target === card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        selectLibrary(selection);
      }
    });
    const preview = element("div", "artifact-preview");
    preview.innerHTML = `<span class="artifact-glyph">${icon(entry.kind === "audio" ? "audio" : entry.kind === "image" ? "image" : "film", 22)}</span><span class="artifact-type">${entry.kind}</span>`;
    const resource = entry.resource;
    if (resource && entry.kind === "image") {
      const image = new Image();
      image.alt = "";
      image.loading = "lazy";
      image.addEventListener("load", () => sizeLibraryPreview(image, entry.width ?? image.naturalWidth, entry.height ?? image.naturalHeight));
      image.addEventListener("error", () => card.classList.add("preview-unavailable"));
      image.src = resource;
      preview.prepend(image);
    } else if (resource && entry.kind === "video") {
      const video = document.createElement("video");
      video.preload = "none";
      video.muted = true;
      video.playsInline = true;
      video.dataset.previewSource = resource;
      const ready = () => {
        if (video.readyState < 2 || video.seeking) return;
        video.classList.add("is-ready");
      };
      video.addEventListener("loadedmetadata", () => {
        sizeLibraryPreview(video, entry.width ?? video.videoWidth, entry.height ?? video.videoHeight);
        video.currentTime = Number.isFinite(video.duration) ? Math.min(.1, video.duration / 2) : .1;
      }, { once: true });
      video.addEventListener("loadeddata", ready);
      video.addEventListener("seeked", ready);
      video.addEventListener("error", () => card.classList.add("preview-unavailable"));
      preview.prepend(video);
      libraryPreviews.observe(video);
    } else if (resource && entry.kind === "audio") {
      const waveform = new Image();
      waveform.className = "artifact-waveform";
      waveform.alt = "";
      waveform.dataset.audioSource = resource;
      preview.prepend(waveform);
      libraryPreviews.observe(waveform);
    } else {
      card.classList.add("preview-unavailable");
    }
    const facts = [entry.mediaType, entry.size === undefined ? undefined : formatBytes(entry.size),
      entry.durationSeconds === undefined ? undefined : formatLibraryDuration(entry.durationSeconds),
      entry.asset, entry.error];
    preview.title = [entry.name, ...facts].filter(Boolean).join("\n");
    const name = createArtifactName({
      name: entry.name,
      editable: false,
      select: () => selectLibrary(selection),
    });
    if (state.selection?.type === selection.type && state.selection.id === entry.id) state.renameEdit = name.edit;
    card.append(preview, name.element);
    return card;
  }

  function renderMediaLibrary(body) {
    const entries = state.snapshot.mediaLibrary.assets;
    const toolbar = element("div", "media-library-toolbar");
    const filters = element("div", "media-kind-filters");
    for (const [value, label] of [["all", "全部"], ["video", "视频"], ["image", "图片"], ["audio", "音频"]]) {
      const button = element("button", "", label);
      button.type = "button";
      button.classList.toggle("active", state.mediaFilter === value);
      button.addEventListener("click", () => { state.mediaFilter = value; renderBin(); });
      filters.append(button);
    }
    const refresh = element("button", "icon-button");
    refresh.type = "button";
    refresh.dataset.action = "refresh-media";
    refresh.title = "刷新项目素材";
    refresh.setAttribute("aria-label", refresh.title);
    refresh.innerHTML = icon("refresh", 14);
    toolbar.append(filters, refresh);
    body.append(toolbar);
    const shown = entries.filter(entry => state.mediaFilter === "all" || entry.kind === state.mediaFilter);
    const grid = element("div", "artifact-grid");
    state.renameEdit = undefined;
    for (const entry of shown) grid.append(artifactCard(entry));
    if (shown.length === 0) grid.append(emptyState("media", "工程中还没有这类素材", "项目素材会从实际 Media Asset 清单投影到这里。"));
    body.append(grid);
    return shown.length;
  }

  function renderBin() {
    const project = currentProject();
    for (const button of app.querySelectorAll("[data-bin]")) button.setAttribute("aria-selected", String(button.dataset.bin === state.bin));
    const body = app.querySelector("#bin-content");
    body.replaceChildren();
    if (state.bin === "media") {
      renderMediaLibrary(body);
    } else if (state.bin === "components") {
      const items = project.tracks.flatMap(track => track.items)
        .filter(item => item.kind === "present" && item.source === "component");
      const components = [...new Map(items.map(item => [`${item.component.module.name}#${item.component.name}`, item.component])).values()];
      const list = element("div", "object-list");
      for (const component of components) {
        const row = element("div", "object-row static");
        row.innerHTML = `${icon("component")}<span></span><small></small>`;
        row.querySelector("span").textContent = component.name;
        row.querySelector("small").textContent = component.module.name;
        list.append(row);
      }
      if (!components.length) list.append(emptyState("component", "工程中还没有组件", "组件目录接入后，可添加的项目组件会显示在这里。"));
      body.append(list);
    } else if (state.bin === "captions") {
      body.append(emptyState("captions", "字幕工作台尚未接入", "生成、导入和批量编辑字幕的入口会放在这里。"));
    } else if (state.bin === "transitions") {
      body.append(emptyState("transition", "转场目录尚未接入", "转场会由包目录提供，并作用于相邻或重叠的项目。"));
    } else if (state.bin === "effects") {
      body.append(emptyState("effects", "特效目录尚未接入", "改变画面空间、时间或表现行为的组件会放在这里。"));
    } else if (state.bin === "filters") {
      body.append(emptyState("filter", "滤镜目录尚未接入", "改变画面色彩与整体观感的组件会放在这里。"));
    }
  }

  function emptyState(iconName, title, detail) {
    const empty = element("div", "panel-empty");
    empty.innerHTML = `${icon(iconName, 22)}<strong></strong><span></span>`;
    empty.querySelector("strong").textContent = title;
    empty.querySelector("span").textContent = detail;
    return empty;
  }

  function renderMonitor() {
    if (!state.snapshot) return;
    const project = currentProject();
    const canvas = app.querySelector("#programme");
    canvas.style.aspectRatio = `${project.canvas.width} / ${project.canvas.height}`;
    canvas.style.setProperty("--ratio", String(project.canvas.width / project.canvas.height));
    canvas.style.backgroundColor = project.canvas.clearColor;
    const key = `${project.revision}:${state.snapshot.view.revision}`;
    if (state.previewKey !== key) {
      state.previewKey = key;
      state.previewCommandFrame = undefined;
      const frame = element("iframe", "programme-frame");
      frame.title = "Programme preview";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
      frame.setAttribute("allow", "autoplay");
      frame.src = `/api/nle/programme?revision=${project.revision}&viewRevision=${state.snapshot.view.revision}`;
      const loading = element("div", "programme-loading", "正在准备画面…");
      frame.addEventListener("load", () => {
        previewCommand("mute", { muted: state.muted });
        seekProgramme(true);
        if (state.playing) previewCommand("play");
      });
      canvas.replaceChildren(frame, loading, element("div", "canvas-edit-overlay"));
    }
    if (!canvas.querySelector(".canvas-edit-overlay")) canvas.append(element("div", "canvas-edit-overlay"));
    if (!state.playing) seekProgramme();
    renderCanvasScene();
    app.querySelector("#transport-time").textContent = `${playbackTime(state.frame, state.snapshot.view.editRate)} / ${playbackTime(maximumFrame(), state.snapshot.view.editRate)}`;
  }

  function placeCanvasLayerBox(node, layout) {
    const canvas = state.snapshot.canvasScene.canvas;
    node.style.left = `${layout.x / canvas.width * 100}%`;
    node.style.top = `${layout.y / canvas.height * 100}%`;
    node.style.width = `${layout.width / canvas.width * 100}%`;
    node.style.height = `${layout.height / canvas.height * 100}%`;
  }

  function renderCanvasScene() {
    if (!state.snapshot) return;
    const overlay = app.querySelector(".canvas-edit-overlay");
    const panel = app.querySelector("#canvas-layer-panel");
    if (!overlay || !panel) return;
    overlay.replaceChildren();
    const active = activeCanvasLayers();
    for (const layer of active) {
      if (!layer.layout) continue;
      const selected = state.selection?.type === "item" && state.selection.id === layer.id;
      const box = element("div", `canvas-layer-box${selected ? " selected" : ""}${layer.editing.transform ? "" : " locked"}`);
      box.dataset.canvasLayer = layer.id;
      box.setAttribute("aria-label", layer.title);
      const layout = state.spatialDraft?.item === layer.id ? state.spatialDraft.layout : layer.layout;
      placeCanvasLayerBox(box, layout);
      if (selected) {
        if (layer.editing.transform) {
          for (const handle of ["nw", "ne", "se", "sw"]) {
            const grip = element("i", `canvas-layer-handle handle-${handle}`);
            grip.dataset.canvasHandle = handle;
            box.append(grip);
          }
        }
      }
      overlay.append(box);
    }

    panel.hidden = !state.layersOpen;
    panel.replaceChildren();
    if (!state.layersOpen) return;
    const heading = element("header", "canvas-layer-panel-heading");
    heading.append(element("strong", "", "当前画面"), element("span", "", `${active.length} 层`));
    panel.append(heading);
    const list = element("div", "canvas-layer-list");
    for (const layer of [...active].reverse()) {
      const button = element("button", `canvas-layer-row${state.selection?.type === "item" && state.selection.id === layer.id ? " selected" : ""}`);
      button.type = "button";
      button.dataset.canvasLayer = layer.id;
      button.innerHTML = `${icon(layer.role === "adjustment" ? "effects" : layer.source === "media" ? "film" : layer.source === "component" ? "component" : "layers", 14)}<span></span><small></small>`;
      button.querySelector("span").textContent = layer.title;
      button.querySelector("small").textContent = layer.role === "adjustment" ? "效果"
        : layer.owner.kind === "picture-layout" ? `共享 · ${layer.owner.sharedBy.length}` : "片段";
      list.append(button);
    }
    if (!active.length) list.append(element("div", "canvas-layer-empty", "当前时间没有可见画面层"));
    panel.append(list);
  }

  const inspectorDomainPresentation = [
    { id: "where", label: "位置", icon: "where" },
    { id: "when", label: "时间", icon: "when" },
    { id: "how", label: "样式", icon: "how" },
  ];

  function renderInspectorTabs(item, sections) {
    const tabs = app.querySelector("#inspector-tabs");
    tabs.replaceChildren();
    const available = new Set(sections?.map(section => section.domain) ?? []);
    if (item === undefined || sections === undefined || available.size === 0) {
      tabs.classList.add("title");
      tabs.setAttribute("aria-label", "属性");
      const title = element("div", "nle-inspector-title");
      title.innerHTML = `${icon("properties", 14)}<strong>属性</strong>`;
      tabs.append(title);
      return undefined;
    }
    tabs.classList.remove("title");
    tabs.setAttribute("aria-label", "属性分类");
    const shown = inspectorDomainPresentation.filter(domain => available.has(domain.id));
    const remembered = item === undefined ? undefined : state.inspectorDomainByItem.get(item);
    const active = shown.some(domain => domain.id === remembered) ? remembered : shown[0]?.id;
    if (item !== undefined && active !== undefined) state.inspectorDomainByItem.set(item, active);
    for (const domain of shown) {
      const button = element("button", "nle-inspector-tab");
      button.type = "button";
      button.setAttribute("aria-selected", String(domain.id === active));
      button.innerHTML = `${icon(domain.icon, 14)}<strong>${domain.label}</strong><i></i>`;
      button.addEventListener("click", () => {
        state.inspectorDomainByItem.set(item, domain.id);
        renderInspector();
      });
      tabs.append(button);
    }
    return active;
  }

  function inspectorField(label, value) {
    const row = element("div", "property-row");
    row.append(element("span", "", label), element("strong", "", value));
    return row;
  }

  function inspectorSceneField(field, section) {
    let value = field.value;
    if (field.control === "boolean") value = field.value ? "是" : "否";
    if (field.control === "select") value = field.options?.find(option => option.value === field.value)?.label ?? field.value;
    if (field.unit) value = `${formatNumber(Number(value))} ${field.unit}`;
    if (field.editable) {
      const row = element("label", "property-row property-editable");
      row.append(element("span", "", field.label));
      let control;
      if (field.control === "select") {
        control = element("select", "property-input");
        for (const option of field.options ?? []) {
          const node = document.createElement("option");
          node.value = option.value;
          node.textContent = option.label;
          node.selected = option.value === field.value;
          control.append(node);
        }
      } else if (field.control === "boolean") {
        control = document.createElement("input");
        control.className = "property-toggle";
        control.type = "checkbox";
        control.checked = Boolean(field.value);
      } else {
        control = document.createElement("input");
        control.className = "property-input";
        control.type = field.control === "number" ? "number" : "text";
        if (field.control === "number") {
          control.step = field.step ?? "any";
          if (field.minimum !== undefined) control.min = field.minimum;
          if (field.maximum !== undefined) control.max = field.maximum;
        }
        control.value = String(field.value);
      }
      control.dataset.inspectorSection = section.id;
      control.dataset.inspectorField = field.id;
      control.dataset.inspectorControl = field.control;
      const valueCell = element("span", "property-input-cell");
      valueCell.append(control);
      if (field.unit) valueCell.append(element("em", "", field.unit));
      row.append(valueCell);
      row.dataset.control = field.control;
      return row;
    }
    const row = inspectorField(field.label, String(value));
    row.dataset.control = field.control;
    if (field.control === "color") {
      const swatch = element("i", "property-color");
      swatch.style.backgroundColor = String(field.value);
      row.querySelector("strong").prepend(swatch);
    }
    return row;
  }

  function inspectorScope(owner) {
    if (owner.kind !== "component-value" && owner.kind !== "picture-layout") return undefined;
    const badge = element("span", "property-scope", `共享 ${owner.sharedBy.length}`);
    badge.title = `${owner.name} · ${owner.sharedBy.length} 个片段共用`;
    return badge;
  }

  function inspectorSceneRows(section) {
    const rows = [];
    for (let index = 0; index < section.fields.length;) {
      const field = section.fields[index];
      if (field.row === undefined) {
        rows.push(inspectorSceneField(field, section));
        index += 1;
        continue;
      }
      const fields = [];
      while (index < section.fields.length && section.fields[index].row?.id === field.row.id) {
        fields.push(section.fields[index]);
        index += 1;
      }
      const row = element("div", "property-row property-compound-row");
      row.append(element("span", "property-compound-label", field.row.label));
      const values = element("div", "property-compound-values");
      for (const candidate of fields) {
        const rendered = inspectorSceneField(candidate, section);
        const compact = element("label", "property-compound-field");
        compact.dataset.control = candidate.control;
        compact.append(element("span", "", candidate.label), rendered.lastElementChild);
        values.append(compact);
      }
      row.append(values);
      rows.push(row);
    }
    return rows;
  }

  function inspectorSceneGroup(section, omitHeading = false) {
    const group = element("section", "property-group inspector-scene-group");
    const heading = element("div", "property-group-heading");
    const scope = inspectorScope(section.owner);
    if (!omitHeading || scope !== undefined) heading.append(element("h3", "", section.label));
    if (scope !== undefined) heading.append(scope);
    const grid = element("div", "property-grid");
    grid.append(...inspectorSceneRows(section));
    if (heading.childElementCount > 0) group.append(heading);
    group.append(grid);
    return group;
  }

  function inspectorPage(item, domain, sections) {
    const domainSections = sections.filter(section => section.domain === domain);
    const pages = new Map();
    for (const section of domainSections) {
      if (section.page !== undefined && !pages.has(section.page.id)) pages.set(section.page.id, section.page);
    }
    if (pages.size === 0) return { id: undefined, sections: domainSections, navigation: undefined };
    const key = `${item}:${domain}`;
    const remembered = state.inspectorPageByItem.get(key);
    const active = remembered !== undefined && pages.has(remembered) ? remembered : pages.keys().next().value;
    state.inspectorPageByItem.set(key, active);
    const visible = pages.size === 1 ? domainSections
      : domainSections.filter(section => section.page === undefined || section.page.id === active);
    if (pages.size === 1) return { id: active, sections: visible, navigation: undefined };
    const navigation = element("nav", "inspector-subtabs");
    navigation.setAttribute("aria-label", "属性页面");
    for (const page of pages.values()) {
      const button = element("button", "inspector-subtab", page.label);
      button.type = "button";
      button.setAttribute("aria-selected", String(page.id === active));
      button.addEventListener("click", () => {
        state.inspectorPageByItem.set(key, page.id);
        renderInspector();
      });
      navigation.append(button);
    }
    return { id: active, sections: visible, navigation };
  }

  const inspectorKey = (item, revision) => `${revision}:${item}`;

  function itemInspectorScene(item, revision) {
    const key = inspectorKey(item, revision);
    const cached = state.inspectorCache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const loading = state.inspectorLoads.get(key);
    if (loading !== undefined) return loading;
    const promise = request(`/api/nle/item-inspector/${encodeURIComponent(item)}?revision=${revision}`)
      .then(scene => {
        state.inspectorCache.set(key, scene);
        return scene;
      })
      .finally(() => state.inspectorLoads.delete(key));
    state.inspectorLoads.set(key, promise);
    return promise;
  }

  async function loadItemInspector(item, revision) {
    const key = inspectorKey(item, revision);
    const token = ++state.inspectorRequest;
    try {
      const scene = await itemInspectorScene(item, revision);
      if (token !== state.inspectorRequest || state.selection?.type !== "item" || state.selection.id !== item
        || currentProject().revision !== revision) return;
      state.inspector = { item, revision, scene };
    } catch (error) {
      if (token !== state.inspectorRequest || state.selection?.type !== "item" || state.selection.id !== item
        || currentProject().revision !== revision) return;
      state.inspector = { item, revision, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (state.inspectorPendingKey === key) state.inspectorPendingKey = undefined;
    }
    renderInspector();
  }

  function renderInspector() {
    const inspector = app.querySelector("#inspector");
    const tabs = app.querySelector("#inspector-tabs");
    const project = currentProject();
    const selected = selectedItem();
    const track = selectedTrack();
    const selectedMedia = state.selection?.type === "media"
      ? state.snapshot.mediaLibrary.assets.find(media => media.id === state.selection.id) : undefined;
    const selectedKey = selected === undefined ? undefined : inspectorKey(selected.item.id, project.revision);
    const matchingInspector = selected !== undefined
      && state.inspector?.item === selected.item.id && state.inspector.revision === project.revision
      ? state.inspector : undefined;
    const loadedInspector = selectedKey === undefined ? undefined
      : state.inspectorCache.get(selectedKey) ?? matchingInspector?.scene;
    if (selected !== undefined && loadedInspector === undefined && matchingInspector?.error === undefined) {
      if (state.inspectorPendingKey !== selectedKey) {
        state.inspectorPendingKey = selectedKey;
        queueMicrotask(() => {
          if (state.selection?.type === "item" && state.selection.id === selected.item.id
            && currentProject().revision === project.revision) {
            void loadItemInspector(selected.item.id, project.revision);
          }
        });
      }
      inspector.inert = true;
      tabs.inert = true;
      return;
    }
    inspector.inert = false;
    tabs.inert = false;
    inspector.replaceChildren();
    const activeDomain = renderInspectorTabs(selected?.item.id, loadedInspector?.sections);
    if (selectedMedia) {
      inspector.append(
        inspectorGroup("项目素材",
          inspectorField("名称", selectedMedia.name),
          inspectorField("类型", selectedMedia.mediaType ?? selectedMedia.kind),
          ...(selectedMedia.durationSeconds === undefined ? [] : [inspectorField("时长", formatLibraryDuration(selectedMedia.durationSeconds))]),
          ...(selectedMedia.width === undefined ? [] : [inspectorField("画面", `${selectedMedia.width} × ${selectedMedia.height}`)]),
          inspectorField("音频", selectedMedia.hasAudio ? "有" : "无"),
          inspectorField("使用次数", String(selectedMedia.usedBy))),
        inspectorGroup("来源",
          inspectorField("Media Asset", selectedMedia.asset),
          inspectorField("素材 ID", selectedMedia.id),
          ...(selectedMedia.size === undefined ? [] : [inspectorField("大小", formatBytes(selectedMedia.size))]),
          ...(selectedMedia.error === undefined ? [] : [inspectorField("读取错误", selectedMedia.error)])),
      );
      return;
    }
    if (!selected && !track) {
      const duration = maximumFrame();
      inspector.append(
        inspectorGroup("项目",
          inspectorField("名称", project.name),
          inspectorField("修订", String(project.revision))),
        inspectorGroup("构图空间",
          inspectorField("逻辑尺寸", `${project.canvas.width} × ${project.canvas.height}`),
          inspectorField("画幅比例", aspectRatioLabel(project.canvas.width, project.canvas.height)),
          inspectorField("底色", project.canvas.clearColor)),
        inspectorGroup("时间线",
          inspectorField("时长", `${formatNumber(duration)} 帧`),
          inspectorField("编辑网格", `${formatNumber(state.snapshot.view.editRate.numerator / state.snapshot.view.editRate.denominator)} fps`),
          inspectorField("轨道", String(project.tracks.length))),
      );
      return;
    }
    if (track) {
      const toggles = element("div", "property-actions");
      toggles.append(actionButton(trackMuteLabel(track), "track-mute", track.muted ? "volume" : "mute"), actionButton(trackLocked(track.id) ? "解锁" : "锁定", "track-lock", trackLocked(track.id) ? "unlock" : "lock"));
      const sceneTrack = state.snapshot.scene.tracks.find((candidate) => candidate.id === track.id);
      const authoredHeight = state.snapshot.view.tracks.find((candidate) => candidate.track === track.id)?.heightPx;
      inspector.append(inspectorGroup("轨道",
        inspectorField("名称", track.name),
        inspectorField("类型", track.kind),
        inspectorField("项目", String(track.items.length)),
        inspectorField("高度", `${sceneTrack?.heightPx ?? 0} px${authoredHeight === undefined ? " · 默认" : " · 自定义"}`),
        inspectorField("轨道 ID", track.id),
        toggles));
      return;
    }
    const item = selected.item;
    const edit = element("div", "property-actions three");
    edit.append(actionButton("−1 帧", "move-earlier"), actionButton("+1 帧", "move-later"), actionButton(item.enabled ? "停用" : "启用", "toggle-item", item.enabled ? "hidden" : "eye"));
    const start = frames(item.start, state.snapshot.view.editRate);
    edit.querySelector('[data-action="move-earlier"]').disabled = trackLocked(selected.track.id) || start < 1;
    edit.querySelector('[data-action="move-later"]').disabled = trackLocked(selected.track.id);
    if (matchingInspector?.error !== undefined) {
      inspector.append(element("div", "inspector-state property-error", matchingInspector.error));
      return;
    }
    const page = inspectorPage(item.id, activeDomain, loadedInspector.sections);
    if (page.navigation !== undefined) inspector.append(page.navigation);
    const omitOnlyHeading = page.navigation !== undefined && page.sections.length === 1
      && page.sections[0].page?.label === page.sections[0].label;
    inspector.append(...page.sections.map(section => inspectorSceneGroup(section, omitOnlyHeading)));
    if (activeDomain === "when" && (page.id === undefined || page.id === "clip")) {
      inspector.append(inspectorGroup("片段操作", edit));
    }
  }

  function inspectorGroup(title, ...children) {
    const group = element("section", "property-group");
    const grid = element("div", "property-grid");
    grid.append(...children);
    group.append(element("h3", "", title), grid);
    return group;
  }

  function actionButton(label, action, iconName) {
    const button = element("button", "secondary-button");
    button.type = "button";
    button.dataset.action = action;
    if (iconName) button.innerHTML = `${icon(iconName)}<span></span>`;
    (button.querySelector("span") ?? button).textContent = label;
    return button;
  }

  function renderTimeline() {
    if (!state.snapshot) return;
    syncZoomChrome();
    const scene = state.snapshot.scene;
    const scroll = app.querySelector("#timeline-scroll");
    const tracks = app.querySelector("#tracks");
    if (state.timelineVerticalReady) {
      const range = Math.max(0, tracks.scrollHeight - scroll.clientHeight);
      if (range > 0) state.timelineScrollRatio = scroll.scrollTop / range;
    }
    tracks.replaceChildren();
    tracks.classList.toggle("cut-mode", state.tool === "cut");
    const ruler = element("div", "nle-ruler");
    ruler.append(element("div", "nle-ruler-label"));
    const scale = element("div", "nle-ruler-scale");
    scale.dataset.action = "seek";
    ruler.append(scale);
    tracks.append(ruler);
    drawTimelineRuler(scale);
    const stack = element("div", "nle-track-stack");
    for (const track of scene.tracks) {
      const row = element("div", `nle-track${state.selection?.type === "track" && state.selection.id === track.id ? " selected" : ""}`);
      row.dataset.trackRow = track.id;
      row.style.height = `${track.heightPx}px`;
      row.style.flexBasis = `${track.heightPx}px`;
      const head = element("div", "nle-track-label");
      const trackButton = element("button", "track-kind");
      trackButton.type = "button";
      trackButton.dataset.track = track.id;
      trackButton.title = `${track.name} · ${track.kind === "audio" ? "音频轨道" : "画面轨道"}`;
      trackButton.setAttribute("aria-label", trackButton.title);
      trackButton.innerHTML = icon(track.kind === "audio" ? "audio" : "image", 14);
      const mute = element("button", `track-control${track.muted ? " active" : ""}`);
      mute.type = "button";
      mute.dataset.trackMute = track.id;
      const pictureTrack = track.kind !== "audio";
      mute.title = trackMuteLabel(track);
      mute.setAttribute("aria-label", mute.title);
      mute.innerHTML = icon(pictureTrack ? (track.muted ? "hidden" : "eye") : (track.muted ? "mute" : "volume"), 14);
      const lock = element("button", `track-control${trackLocked(track.id) ? " active" : ""}`);
      lock.type = "button";
      lock.dataset.trackLock = track.id;
      lock.title = trackLocked(track.id) ? "解锁" : "锁定";
      lock.innerHTML = icon(trackLocked(track.id) ? "lock" : "unlock", 14);
      head.append(trackButton, mute, lock);
      const lane = element("div", `nle-track-content track-tone-${track.tone}`);
      lane.style.setProperty("--lane-height", `${track.heightPx}px`);
      lane.dataset.lane = track.id;
      for (const item of track.items) {
        const start = item.startFrame;
        const duration = item.durationFrames;
        const from = placeFrame(start);
        const to = placeFrame(start + duration);
        if (to <= 0 || from >= 1) continue;
        const selected = state.selection?.type === "item" && state.selection.id === item.id;
        const editable = item.editing.move || item.editing.trimStart || item.editing.trimEnd;
        const clip = element("button", `timeline-item timeline-item-tone-${item.presentation.tone} timeline-item-chrome-${item.presentation.chrome}${editable ? " timeline-item-editable" : ""}${item.editing.split ? " timeline-item-splittable" : ""}${item.enabled ? "" : " disabled"}${selected ? " selected" : ""}`);
        clip.type = "button";
        clip.dataset.item = item.id;
        clip.style.left = `${from * 100}%`;
        clip.style.width = `max(2px, ${(to - from) * 100}%)`;
        clip.title = `${item.display.title} · ${formatNumber(start)}–${formatNumber(start + duration)} 帧`;
        clip.innerHTML = `<span class="timeline-item-head"><span class="timeline-item-name"></span><span class="timeline-item-meta"></span></span><span class="timeline-item-body"><span class="timeline-item-layers" aria-hidden="true"></span></span><span class="timeline-item-boundary" aria-hidden="true"></span><span class="timeline-item-selection" aria-hidden="true"></span>`;
        if (item.editing.trimStart) {
          const handle = element("i", "timeline-item-trim-handle start");
          handle.dataset.timelineTrim = "start";
          handle.setAttribute("aria-hidden", "true");
          clip.append(handle);
        }
        if (item.editing.trimEnd) {
          const handle = element("i", "timeline-item-trim-handle end");
          handle.dataset.timelineTrim = "end";
          handle.setAttribute("aria-hidden", "true");
          clip.append(handle);
        }
        clip.querySelector(".timeline-item-name").textContent = item.display.title;
        const fps = state.snapshot.view.editRate.numerator / state.snapshot.view.editRate.denominator;
        clip.querySelector(".timeline-item-meta").textContent = `${(duration / fps).toFixed(2)}s`;
        const layers = clip.querySelector(".timeline-item-layers");
        for (const [index, layer] of item.display.layers.entries()) {
          const layerNode = element("span", `timeline-item-layer timeline-item-layer-${layer.kind} timeline-item-layer-role-${layer.role}`);
          layerNode.style.zIndex = String(index + 1);
          if (layer.kind === "text") {
            layerNode.textContent = layer.text;
          } else {
            layerNode.classList.add(`timeline-item-layer-layout-${layer.layout}`, `timeline-item-preview-${layer.preview.kind}`, `state-${layer.preview.state}`);
            if (layer.direction && layer.layout !== "filmstrip") {
              layerNode.classList.add(`timeline-item-layer-direction-${layer.direction}`);
            }
            if (layer.preview.state === "ready") {
              if (layer.layout === "filmstrip") {
                mountFilmstrip(layerNode, layer.preview.resource, layer.direction);
              } else {
                layerNode.style.backgroundImage = `url(${JSON.stringify(layer.preview.resource)})`;
              }
            }
          }
          layers.append(layerNode);
        }
        lane.append(clip);
      }
      const resize = element("div", "nle-track-resize");
      resize.dataset.trackResize = track.id;
      resize.title = "拖动调整轨道高度；双击恢复默认";
      resize.setAttribute("role", "separator");
      resize.setAttribute("aria-orientation", "horizontal");
      resize.setAttribute("aria-valuemin", String(minimumTrackHeight));
      resize.setAttribute("aria-valuemax", String(maximumTrackHeight));
      resize.setAttribute("aria-valuenow", String(track.heightPx));
      row.append(head, lane, resize);
      stack.append(row);
    }
    if (!scene.tracks.length) {
      const empty = element("div", "timeline-empty");
      empty.append(emptyState("film", "时间线为空", "Agent 或组件可以通过 NLE transaction 添加轨道与项目。"));
      stack.append(empty);
    }
    tracks.append(stack);
    const hoverLayer = element("div", "nle-timeline-hover-layer");
    const hover = element("div", "nle-timeline-hover");
    hover.append(element("span", "nle-timeline-hover-time"));
    hoverLayer.append(hover, element("div", "nle-timeline-snap-guide"));
    tracks.append(hoverLayer);
    const playheadLayer = element("div", "nle-playhead-layer");
    playheadLayer.append(element("div", "nle-playhead"));
    tracks.append(playheadLayer);
    const rulerHeight = ruler.offsetHeight;
    const availableHeight = Math.max(0, scroll.clientHeight - rulerHeight);
    const trackHeight = scene.tracks.reduce((total, track) => total + track.heightPx, 0);
    const edgeRoom = Math.min(12, Math.max(8, (scene.tracks[0]?.heightPx ?? 54) / 6));
    const scrollable = trackHeight + edgeRoom * 2 > availableHeight;
    tracks.style.setProperty("--timeline-track-area-height", `${availableHeight}px`);
    tracks.style.setProperty("--timeline-track-edge-room", `${edgeRoom}px`);
    stack.classList.toggle("scrollable", scrollable);
    const range = Math.max(0, tracks.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = range * Math.max(0, Math.min(1, state.timelineScrollRatio));
    state.timelineVerticalReady = true;
    paintTimeline();
  }

  function render() {
    if (!state.snapshot) return;
    document.title = `${currentProject().name} · Hypit NLE`;
    renderChrome();
    renderBin();
    renderMonitor();
    renderInspector();
    renderTimeline();
    app.dataset.loading = "false";
  }

  async function splitSelected() {
    const selected = selectedItem();
    if (!selected || trackLocked(selected.track.id)) return;
    if (!selectedTimelineSceneItem()?.editing.split) {
      notify("当前项目不支持分割", true);
      return;
    }
    const project = currentProject();
    const start = frames(selected.item.start, state.snapshot.view.editRate);
    const end = itemEnd(selected.item, state.snapshot.view.editRate);
    if (state.frame <= start || state.frame >= end) {
      notify("播放头需要位于所选片段内部", true);
      return;
    }
    const rightId = `${selected.item.id}-part-${crypto.randomUUID().slice(0, 8)}`;
    await transact(`分割 ${itemLabel(selected.item, state.snapshot.mediaLibrary.assets)}`, [{ kind: "item.split", id: selected.item.id, at: frameValue(Math.round(state.frame), state.snapshot.view.editRate), rightId }], "已分割");
    state.selection = { type: "item", id: rightId };
  }

  async function trimSelected(edge) {
    const selected = selectedItem();
    if (!selected || trackLocked(selected.track.id)) return;
    const editing = selectedTimelineSceneItem()?.editing;
    if (edge === "start" ? !editing?.trimStart : !editing?.trimEnd) {
      notify("当前项目不支持裁边", true);
      return;
    }
    const at = Math.round(state.frame);
    const start = frames(selected.item.start, state.snapshot.view.editRate);
    const end = itemEnd(selected.item, state.snapshot.view.editRate);
    if (at <= start || at >= end) {
      notify("播放头需要位于所选片段内部", true);
      return;
    }
    const side = edge === "start" ? "左边沿" : "右边沿";
    await transact(`裁剪 ${itemLabel(selected.item, state.snapshot.mediaLibrary.assets)} ${side}`, [{
      kind: "item.trim",
      id: selected.item.id,
      edge,
      at: frameValue(at, state.snapshot.view.editRate),
    }], `已裁剪${side}`);
  }

  async function removeSelected() {
    const selected = selectedItem();
    if (!selected || trackLocked(selected.track.id)) return;
    await transact(`删除 ${itemLabel(selected.item, state.snapshot.mediaLibrary.assets)}`, [{ kind: "item.remove", ids: [selected.item.id] }], "已删除");
    state.selection = undefined;
  }

  app.addEventListener("pointerover", event => {
    if (!state.snapshot) return;
    clearTimeout(state.inspectorPrefetchTimer);
    const item = event.target.closest?.("[data-item]")?.dataset.item
      ?? event.target.closest?.("[data-canvas-layer]")?.dataset.canvasLayer;
    if (item === undefined) return;
    const revision = currentProject().revision;
    state.inspectorPrefetchTimer = setTimeout(() => {
      void itemInspectorScene(item, revision).catch(() => { /* Selection reports the actionable error. */ });
    }, 80);
  });

  app.addEventListener("click", event => {
    const target = event.target.closest("button,[data-action=seek],[data-lane],[data-timeline-background]");
    if (!target || !state.snapshot) return;
    if (target.dataset.bin) { state.bin = target.dataset.bin; renderBin(); return; }
    if (target.dataset.canvasLayer) {
      select({ type: "item", id: target.dataset.canvasLayer });
      return;
    }
    if (target.dataset.item) {
      const item = currentProject().tracks.flatMap(track => track.items).find(item => item.id === target.dataset.item);
      if (!item) return;
      const lane = target.closest("[data-lane]");
      if (lane) state.frame = Math.max(0, Math.min(Math.round(frameAtPointer(lane, event)), Math.ceil(timelineExtentFrame())));
      state.selection = { type: "item", id: item.id };
      renderChrome();
      renderMonitor();
      renderInspector();
      paintTimeline();
      if (state.tool === "cut") {
        if (timelineSceneItem(item.id)?.editing.split) void splitSelected();
      }
      return;
    }
    if (target.dataset.track) { select({ type: "track", id: target.dataset.track }); return; }
    if (target.dataset.trackMute) {
      const track = currentProject().tracks.find(value => value.id === target.dataset.trackMute);
      if (track) void transact(`${trackMuteLabel(track)} ${track.name}`, [{ kind: "track.update", id: track.id, muted: !track.muted }]);
      return;
    }
    if (target.dataset.trackLock) {
      const track = currentProject().tracks.find(value => value.id === target.dataset.trackLock);
      if (track) void transactView([{ kind: "track-lock.set", track: track.id, locked: !trackLocked(track.id) }]);
      return;
    }
    if (target.dataset.action === "seek" || target.dataset.lane || target.dataset.timelineBackground !== undefined) {
      if (event.target.closest(".nle-track-label")) return;
      if (target.dataset.lane || target.dataset.timelineBackground !== undefined) {
        const surface = target.dataset.lane ? target : app.querySelector(".nle-ruler-scale");
        state.selection = undefined;
        state.frame = Math.max(0, Math.min(Math.round(frameAtPointer(surface, event)), Math.ceil(timelineExtentFrame())));
        renderChrome();
        renderMonitor();
        renderInspector();
        paintTimeline();
      } else {
        seek(frameAtPointer(target, event));
      }
      return;
    }
    const action = target.dataset.action;
    if (!action) return;
    if (action === "undo") void update("/api/nle/undo", {}, "已撤销");
    if (action === "redo") void update("/api/nle/redo", {}, "已重做");
    if (action === "refresh-media") void update("/api/nle/media-library/refresh", {}, "项目素材已刷新");
    if (action === "export") void openExportDialog();
    if (action === "canvas-layers") {
      state.layersOpen = !state.layersOpen;
      renderChrome();
      renderCanvasScene();
    }
    if (action === "tool-select") { state.tool = "select"; renderChrome(); renderTimeline(); }
    if (action === "tool-cut") { state.tool = state.tool === "cut" ? "select" : "cut"; renderChrome(); renderTimeline(); }
    if (action === "previous") { stopPlayback(); seek(state.frame - 1); }
    if (action === "next") { stopPlayback(); seek(state.frame + 1); }
    if (action === "play") togglePlayback();
    if (action === "mute") {
      state.muted = !state.muted;
      previewCommand("mute", { muted: state.muted });
      renderChrome();
    }
    if (action === "zoom-out") pinchZoom(playheadFraction(), 1.25);
    if (action === "zoom-in") pinchZoom(playheadFraction(), .8);
    if (action === "zoom-fit") settleZoom(0, 1);
    if (action === "split") void splitSelected();
    if (action === "trim-start") void trimSelected("start");
    if (action === "trim-end") void trimSelected("end");
    if (action === "remove") void removeSelected();
    const selected = selectedItem();
    const track = selectedTrack();
    if (action === "move-earlier" && selected) void transact(`提前 ${itemLabel(selected.item, state.snapshot.mediaLibrary.assets)}`, [{ kind: "item.move", ids: [selected.item.id], delta: frameValue(-1, state.snapshot.view.editRate) }]);
    if (action === "move-later" && selected) void transact(`延后 ${itemLabel(selected.item, state.snapshot.mediaLibrary.assets)}`, [{ kind: "item.move", ids: [selected.item.id], delta: frameValue(1, state.snapshot.view.editRate) }]);
    if (action === "toggle-item" && selected) void transact(`${selected.item.enabled ? "停用" : "启用"} ${itemLabel(selected.item, state.snapshot.mediaLibrary.assets)}`, [{ kind: "item.replace", item: { ...selected.item, enabled: !selected.item.enabled } }]);
    if (action === "track-mute" && track) void transact(`${trackMuteLabel(track)} ${track.name}`, [{ kind: "track.update", id: track.id, muted: !track.muted }]);
    if (action === "track-lock" && track) void transactView([{ kind: "track-lock.set", track: track.id, locked: !trackLocked(track.id) }]);
  });
  app.addEventListener("change", event => {
    const control = event.target.closest("[data-inspector-section][data-inspector-field]");
    if (!control || !state.snapshot || state.busy || state.selection?.type !== "item") return;
    const value = control.dataset.inspectorControl === "number" ? Number(control.value)
      : control.dataset.inspectorControl === "boolean" ? control.checked : control.value;
    if (typeof value === "number" && !Number.isFinite(value)) {
      notify("请输入有效数字", true);
      renderInspector();
      return;
    }
    if (control.dataset.inspectorSection === "nle-picture-layout") {
      const layer = canvasLayer(state.selection.id);
      if (!layer?.layout) {
        notify("所选项目没有画面布局", true);
        renderInspector();
        return;
      }
      const field = control.dataset.inspectorField;
      const layout = { ...layer.layout, [field]: value };
      void updateSpatialLayout(layer.id, layout);
      return;
    }
    if (control.dataset.inspectorSection === "nle-occurrence"
      && control.dataset.inspectorField === "name") {
      const name = String(value).trim();
      void transact(name.length === 0 ? `恢复 ${state.selection.id} 默认名称` : `重命名 ${state.selection.id}`,
        [{ kind: "item.update", id: state.selection.id, name: name.length === 0 ? null : name }],
        name.length === 0 ? "已恢复默认名称" : "名称已更新");
      return;
    }
    void update("/api/nle/item-parameter", {
      revision: currentProject().revision,
      item: state.selection.id,
      section: control.dataset.inspectorSection,
      field: control.dataset.inspectorField,
      value,
    }, "参数已更新");
  });
  const transportScrubber = app.querySelector("#transport-scrubber");
  const beginTransportScrub = () => {
    if (state.previewScrubbing) return;
    state.previewScrubbing = true;
    stopPlayback();
  };
  const scrubTransport = () => {
    if (!state.previewScrubbing) stopPlayback();
    seek(Number(transportScrubber.value));
  };
  const finishTransportScrub = () => {
    if (!state.previewScrubbing) return;
    state.previewScrubbing = false;
    seekProgramme(true);
  };
  transportScrubber.addEventListener("pointerdown", beginTransportScrub);
  transportScrubber.addEventListener("input", scrubTransport);
  transportScrubber.addEventListener("change", finishTransportScrub);
  transportScrubber.addEventListener("pointerup", finishTransportScrub);
  transportScrubber.addEventListener("pointercancel", finishTransportScrub);

  let canvasPointer;
  const canvasPoint = event => {
    const rectangle = app.querySelector("#programme").getBoundingClientRect();
    const canvas = state.snapshot.canvasScene.canvas;
    return {
      x: (event.clientX - rectangle.left) / Math.max(1, rectangle.width) * canvas.width,
      y: (event.clientY - rectangle.top) / Math.max(1, rectangle.height) * canvas.height,
    };
  };
  const canvasDragLayout = (drag, point) => {
    const dx = Math.round(point.x - drag.point.x);
    const dy = Math.round(point.y - drag.point.y);
    const original = drag.layout;
    if (drag.handle === "move") return {
      ...original,
      x: original.x + dx,
      y: original.y + dy,
    };
    const right = original.x + original.width;
    const bottom = original.y + original.height;
    const west = drag.handle.includes("w");
    const north = drag.handle.includes("n");
    const x = west ? Math.min(right - 1, original.x + dx) : original.x;
    const y = north ? Math.min(bottom - 1, original.y + dy) : original.y;
    const nextRight = west ? right : Math.max(original.x + 1, right + dx);
    const nextBottom = north ? bottom : Math.max(original.y + 1, bottom + dy);
    return { ...original, x, y, width: nextRight - x, height: nextBottom - y };
  };

  app.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !state.snapshot || state.busy) return;
    const overlay = event.target.closest(".canvas-edit-overlay");
    if (!overlay) return;
    const box = event.target.closest("[data-canvas-layer]");
    if (!box) {
      select(undefined);
      return;
    }
    const layer = canvasLayer(box.dataset.canvasLayer);
    if (!layer?.layout) return;
    stopPlayback();
    const alreadySelected = state.selection?.type === "item" && state.selection.id === layer.id;
    if (!alreadySelected) {
      state.selection = { type: "item", id: layer.id };
      renderChrome();
      renderInspector();
      paintTimeline();
      return;
    }
    event.preventDefault();
    if (!layer.editing.transform) {
      renderCanvasScene();
      return;
    }
    canvasPointer = {
      pointerId: event.pointerId,
      item: layer.id,
      handle: event.target.closest("[data-canvas-handle]")?.dataset.canvasHandle ?? "move",
      point: canvasPoint(event),
      layout: structuredClone(layer.layout),
      node: box,
      moved: false,
    };
    box.classList.add("selected", "dragging");
  });

  addEventListener("pointermove", event => {
    if (!canvasPointer || canvasPointer.pointerId !== event.pointerId || event.buttons !== 1) return;
    const layout = canvasDragLayout(canvasPointer, canvasPoint(event));
    canvasPointer.moved ||= layout.x !== canvasPointer.layout.x || layout.y !== canvasPointer.layout.y
      || layout.width !== canvasPointer.layout.width || layout.height !== canvasPointer.layout.height;
    state.spatialDraft = { item: canvasPointer.item, layout };
    placeCanvasLayerBox(canvasPointer.node, layout);
  });

  const finishCanvasPointer = event => {
    if (!canvasPointer || canvasPointer.pointerId !== event.pointerId) return;
    const drag = canvasPointer;
    canvasPointer = undefined;
    if (event.type === "pointerup" && drag.moved && state.spatialDraft?.item === drag.item) {
      void updateSpatialLayout(drag.item, state.spatialDraft.layout, "画面位置已更新");
      return;
    }
    state.spatialDraft = undefined;
    renderCanvasScene();
  };
  addEventListener("pointerup", finishCanvasPointer);
  addEventListener("pointercancel", finishCanvasPointer);

  app.querySelector("#timeline-zoom").addEventListener("input", event => {
    const wanted = widestZoomWindow * Math.pow(
      narrowestZoomWindow() / widestZoomWindow,
      Number(event.target.value) / 100,
    );
    const current = state.zoomWindow.end - state.zoomWindow.start;
    pinchZoom(playheadFraction(), wanted / current);
  });

  const timelineScroll = app.querySelector("#timeline-scroll");
  timelineScroll.addEventListener("scroll", () => {
    if (!state.timelineVerticalReady) return;
    const tracks = app.querySelector("#tracks");
    const range = Math.max(0, tracks.scrollHeight - timelineScroll.clientHeight);
    if (range > 0) state.timelineScrollRatio = timelineScroll.scrollTop / range;
  }, { passive: true });

  timelineScroll.addEventListener("wheel", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      event.preventDefault();
      const scale = app.querySelector(".nle-ruler-scale");
      const rectangle = scale.getBoundingClientRect();
      const at = rectangle.width === 0 ? .5 : (event.clientX - rectangle.left) / rectangle.width;
      pinchZoom(at, Math.exp(event.deltaY * .004));
      return;
    }
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      event.preventDefault();
      const delta = event.shiftKey ? event.deltaY : event.deltaX;
      const scale = app.querySelector(".nle-ruler-scale");
      slideZoom(delta / Math.max(1, scale.clientWidth));
    }
  }, { passive: false });

  const timelineSurface = app.querySelector("#tracks");
  let timelinePointer;
  let trackResizePointer;
  let suppressTimelineClick = false;
  const timelineSnapPixels = 6;

  const timelineSceneEntry = id => {
    for (const track of state.snapshot.scene.tracks) {
      const item = track.items.find(candidate => candidate.id === id);
      if (item) return { track, item };
    }
    return undefined;
  };

  const itemOwnsTransition = id => currentProject().transitions.some(transition =>
    transition.incoming === id || transition.outgoing === id);

  const nextTrackIdentity = kind => {
    const ids = new Set(currentProject().tracks.map(track => track.id));
    let number = 1;
    while (ids.has(`${kind}-${number}`)) number += 1;
    return {
      id: `${kind}-${number}`,
      name: `${kind === "picture" ? "Picture" : "Audio"} ${number}`,
    };
  };

  const projectTrackInsertionAnchor = (kind, visualSlot) => {
    const projectTracks = currentProject().tracks;
    const sameKind = projectTracks.filter(track => track.kind === kind);
    const authoredSlot = kind === "picture" ? sameKind.length - visualSlot : visualSlot;
    const nextSameKind = sameKind[authoredSlot];
    if (nextSameKind) return nextSameKind.id;
    const lastSameKind = projectTracks.findLastIndex(track => track.kind === kind);
    return projectTracks[lastSameKind + 1]?.id;
  };

  const trackRows = kind => [...app.querySelectorAll(".nle-track[data-track-row]")].filter(row =>
    state.snapshot.scene.tracks.find(track => track.id === row.dataset.trackRow)?.kind === kind);

  const animateTrackRelayout = (stack, mutate) => {
    const rows = [...stack.querySelectorAll(":scope > .nle-track[data-track-row]")];
    const before = new Map(rows.map(row => [row, row.getBoundingClientRect().top]));
    mutate();
    for (const row of rows) {
      const delta = before.get(row) - row.getBoundingClientRect().top;
      if (Math.abs(delta) < .5) continue;
      row.getAnimations().forEach(animation => animation.cancel());
      row.animate([
        { transform: `translateY(${delta}px)` },
        { transform: "translateY(0)" },
      ], { duration: 120, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  };

  const removeNewTrackPlaceholder = drag => {
    if (!drag?.placeholder) return;
    const placeholder = drag.placeholder;
    const stack = placeholder.parentElement;
    drag.placeholder = undefined;
    drag.newTrackIntent = undefined;
    if (!stack) return;
    animateTrackRelayout(stack, () => placeholder.remove());
  };

  const placeNewTrackPlaceholder = (drag, intent) => {
    if (drag.newTrackIntent?.slot === intent.slot && drag.placeholder?.isConnected) return;
    const stack = app.querySelector(".nle-track-stack");
    if (!stack) return;
    let placeholder = drag.placeholder;
    const fresh = !placeholder;
    if (!placeholder) {
      placeholder = element("div", "nle-track nle-track-drop-placeholder");
      const height = defaultTrackHeight(intent.kind);
      placeholder.style.height = `${height}px`;
      placeholder.style.flexBasis = `${height}px`;
      const head = element("div", "nle-track-label");
      head.innerHTML = icon(intent.kind === "audio" ? "audio" : "image", 14);
      const lane = element("div", "nle-track-content");
      lane.innerHTML = `${icon("plus", 13)}<span>新建${intent.kind === "audio" ? "音频" : "画面"}轨道</span>`;
      placeholder.append(head, lane);
      drag.placeholder = placeholder;
    }
    const rows = trackRows(intent.kind);
    const allRows = [...app.querySelectorAll(".nle-track[data-track-row]")];
    const before = rows[intent.slot]
      ?? (intent.kind === "picture" ? allRows.find(row =>
        state.snapshot.scene.tracks.find(track => track.id === row.dataset.trackRow)?.kind === "audio") : null);
    animateTrackRelayout(stack, () => stack.insertBefore(placeholder, before));
    drag.newTrackIntent = intent;
    if (fresh) placeholder.animate([
      { opacity: 0, filter: "brightness(.7)" },
      { opacity: 1, filter: "brightness(1)" },
    ], { duration: 110, easing: "ease-out" });
  };

  const newTrackIntentAt = (drag, clientY) => {
    if (drag.gesture !== "move" || drag.transitionMember) return undefined;
    const scroll = app.querySelector("#timeline-scroll");
    const scrollDelta = (scroll?.scrollTop ?? 0) - drag.startScrollTop;
    const top = drag.sourceRect.top - scrollDelta;
    const bottom = drag.sourceRect.bottom - scrollDelta;
    if (clientY > top + 6 && clientY < bottom - 6) return undefined;
    if (!drag.newTrackIntent && Math.abs(clientY - drag.startY) < 10) return undefined;
    const slot = drag.trackCenters.reduce((count, center) =>
      count + (clientY > center - scrollDelta ? 1 : 0), 0);
    return { kind: drag.track.kind, slot };
  };

  const mountTimelineDragGhost = (drag, event) => {
    if (drag.ghost) return;
    const rectangle = drag.node.getBoundingClientRect();
    const ghost = drag.node.cloneNode(true);
    ghost.classList.add("timeline-item-drag-ghost", "editing");
    ghost.classList.remove("selected");
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.tabIndex = -1;
    ghost.style.width = `${rectangle.width}px`;
    ghost.style.height = `${rectangle.height}px`;
    ghost.style.left = `${rectangle.left}px`;
    ghost.style.top = `${rectangle.top}px`;
    document.body.append(ghost);
    drag.node.classList.add("timeline-item-drag-source");
    drag.ghost = ghost;
    drag.pointerOffsetY = event.clientY - rectangle.top;
  };

  const autoScrollTimelineTracks = clientY => {
    const scroll = app.querySelector("#timeline-scroll");
    if (!scroll) return;
    const rectangle = scroll.getBoundingClientRect();
    const edge = 30;
    if (clientY < rectangle.top + edge) scroll.scrollTop -= Math.ceil((rectangle.top + edge - clientY) / 4);
    else if (clientY > rectangle.bottom - edge) scroll.scrollTop += Math.ceil((clientY - rectangle.bottom + edge) / 4);
  };

  const timelineSnapCandidates = excluded => {
    const candidates = [state.frame];
    for (const track of state.snapshot.scene.tracks) {
      for (const item of track.items) {
        if (item.id === excluded) continue;
        candidates.push(item.startFrame, item.startFrame + item.durationFrames);
      }
    }
    return candidates;
  };

  const timelineSnapThresholdFrames = () => {
    const scale = app.querySelector(".nle-ruler-scale");
    const visibleFrames = (state.zoomWindow.end - state.zoomWindow.start) * maximumFrame();
    return visibleFrames / Math.max(1, scale.clientWidth) * timelineSnapPixels;
  };

  const wholeFrame = value => Math.abs(value - Math.round(value)) < 1e-6;

  const snappedTimelineGesture = (drag, pointerFrame) => {
    const threshold = timelineSnapThresholdFrames();
    const candidates = timelineSnapCandidates(drag.item.id);
    if (drag.gesture === "move") {
      const minimumDelta = Math.ceil(-drag.startFrame);
      const maximumDelta = Math.floor(timelineExtentFrame() - drag.endFrame);
      const delta = Math.max(minimumDelta, Math.min(maximumDelta,
        Math.round(pointerFrame - drag.pointerFrame)));
      let snapFrame;
      let distance = threshold + 1;
      let snapAdjustment = 0;
      for (const boundary of [drag.startFrame + delta, drag.endFrame + delta]) {
        for (const candidate of candidates) {
          const adjustment = candidate - boundary;
          if (!wholeFrame(adjustment) || Math.abs(adjustment) > threshold || Math.abs(adjustment) >= distance) continue;
          const adjusted = delta + Math.round(adjustment);
          if (adjusted < minimumDelta || adjusted > maximumDelta) continue;
          distance = Math.abs(adjustment);
          snapAdjustment = Math.round(adjustment);
          snapFrame = candidate;
        }
      }
      const snappedDelta = delta + snapAdjustment;
      return { startFrame: drag.startFrame + snappedDelta, endFrame: drag.endFrame + snappedDelta, snapFrame };
    }

    const minimum = drag.gesture === "trim-start" ? 0 : Math.floor(drag.startFrame) + 1;
    const maximum = drag.gesture === "trim-start"
      ? Math.ceil(drag.endFrame) - 1 : Math.floor(timelineExtentFrame());
    let at = Math.max(minimum, Math.min(maximum, Math.round(pointerFrame)));
    let snapFrame;
    let distance = threshold + 1;
    for (const candidate of candidates) {
      const candidateDistance = Math.abs(candidate - at);
      if (!wholeFrame(candidate) || candidate < minimum || candidate > maximum
        || candidateDistance > threshold || candidateDistance >= distance) continue;
      at = Math.round(candidate);
      distance = candidateDistance;
      snapFrame = candidate;
    }
    if (drag.gesture === "trim-start") {
      return { startFrame: at, endFrame: drag.endFrame, snapFrame };
    }
    return { startFrame: drag.startFrame, endFrame: at, snapFrame };
  };

  const paintTimelineGesture = (drag, preview, event) => {
    const from = placeFrame(preview.startFrame);
    const to = placeFrame(preview.endFrame);
    if (drag.ghost) {
      const scale = app.querySelector(".nle-ruler-scale").getBoundingClientRect();
      drag.ghost.style.left = `${scale.left + from * scale.width}px`;
      drag.ghost.style.top = `${event.clientY - drag.pointerOffsetY}px`;
      drag.ghost.style.width = `${Math.max(2, (to - from) * scale.width)}px`;
    } else {
      drag.node.style.left = `${from * 100}%`;
      drag.node.style.width = `max(2px, ${(to - from) * 100}%)`;
    }
    const guide = app.querySelector(".nle-timeline-snap-guide");
    if (preview.snapFrame === undefined) {
      guide?.classList.remove("visible");
    } else if (guide) {
      guide.style.left = `${placeFrame(preview.snapFrame) * 100}%`;
      guide.classList.add("visible");
    }
  };

  const clearTimelineGesture = drag => {
    drag?.node?.classList.remove("editing");
    drag?.node?.classList.remove("timeline-item-drag-source");
    drag?.ghost?.remove();
    if (drag) drag.ghost = undefined;
    removeNewTrackPlaceholder(drag);
    app.querySelector(".nle-timeline-snap-guide")?.classList.remove("visible");
  };

  const scrubTimeline = event => {
    const scale = app.querySelector(".nle-ruler-scale");
    const frame = Math.max(0, Math.min(Math.round(frameAtPointer(scale, event)), Math.ceil(timelineExtentFrame())));
    state.frame = frame;
    renderChrome();
    renderMonitor();
    paintTimeline();
  };

  timelineSurface.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !state.snapshot) return;
    const resize = event.target.closest("[data-track-resize]");
    if (resize) {
      if (state.busy) return;
      const track = state.snapshot.scene.tracks.find((candidate) => candidate.id === resize.dataset.trackResize);
      const row = resize.closest(".nle-track");
      const lane = row?.querySelector(".nle-track-content");
      if (!track || !row || !lane) return;
      event.preventDefault();
      trackResizePointer = {
        pointerId: event.pointerId,
        track: track.id,
        startY: event.clientY,
        startHeight: track.heightPx,
        height: track.heightPx,
        moved: false,
        row,
        lane,
        handle: resize,
      };
      row.classList.add("resizing");
      try { timelineSurface.setPointerCapture(event.pointerId); } catch { /* pointer remains local */ }
      return;
    }
    if (event.target.closest(".nle-track-label")) return;
    stopPlayback();
    const node = event.target.closest(".timeline-item");
    const entry = node === null ? undefined : timelineSceneEntry(node.dataset.item);
    const trim = event.target.closest("[data-timeline-trim]")?.dataset.timelineTrim;
    const gesture = state.tool !== "select" || entry === undefined ? undefined
      : trim === "start" && entry.item.editing.trimStart ? "trim-start"
        : trim === "end" && entry.item.editing.trimEnd ? "trim-end"
          : entry.item.editing.move ? "move" : undefined;
    if (node && entry && gesture) {
      if (state.busy) return;
      if (state.selection?.type !== "item" || state.selection.id !== entry.item.id) {
        state.selection = { type: "item", id: entry.item.id };
        renderChrome();
        renderInspector();
        renderCanvasScene();
        paintTimeline();
      }
      const scale = app.querySelector(".nle-ruler-scale");
      const sourceRow = node.closest(".nle-track");
      const sourceRect = sourceRow.getBoundingClientRect();
      const timelineScroll = app.querySelector("#timeline-scroll");
      timelinePointer = {
        kind: "item",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        pointerFrame: frameAtPointer(scale, event),
        track: entry.track,
        item: entry.item,
        gesture,
        startFrame: entry.item.startFrame,
        endFrame: entry.item.startFrame + entry.item.durationFrames,
        preview: { startFrame: entry.item.startFrame, endFrame: entry.item.startFrame + entry.item.durationFrames },
        sourceRect,
        startScrollTop: timelineScroll.scrollTop,
        trackCenters: trackRows(entry.track.kind).map(row => row.getBoundingClientRect().top
          + row.getBoundingClientRect().height / 2),
        transitionMember: itemOwnsTransition(entry.item.id),
        node,
        originalLeft: node.style.left,
        originalWidth: node.style.width,
        dragged: false,
      };
      node.classList.add("editing");
      return;
    }
    timelinePointer = { kind: node === null ? "scrub" : "idle", pointerId: event.pointerId,
      startX: event.clientX, dragged: false };
    if (node === null) {
      event.preventDefault();
      state.selection = undefined;
      renderInspector();
      try { timelineSurface.setPointerCapture(event.pointerId); } catch { /* pointer remains local */ }
      scrubTimeline(event);
    }
  });

  timelineSurface.addEventListener("pointermove", event => {
    if (trackResizePointer?.pointerId === event.pointerId && event.buttons === 1) {
      event.preventDefault();
      const height = Math.max(minimumTrackHeight, Math.min(maximumTrackHeight,
        Math.round(trackResizePointer.startHeight + event.clientY - trackResizePointer.startY)));
      trackResizePointer.height = height;
      trackResizePointer.moved ||= height !== trackResizePointer.startHeight;
      trackResizePointer.row.style.height = `${height}px`;
      trackResizePointer.row.style.flexBasis = `${height}px`;
      trackResizePointer.lane.style.setProperty("--lane-height", `${height}px`);
      trackResizePointer.handle.setAttribute("aria-valuenow", String(height));
      app.querySelector(".nle-timeline-hover")?.classList.remove("visible");
      return;
    }
    const scale = app.querySelector(".nle-ruler-scale");
    const rectangle = scale.getBoundingClientRect();
    const hover = app.querySelector(".nle-timeline-hover");
    if (!hover || event.clientX < rectangle.left || event.clientX > rectangle.right
      || event.target.closest(".nle-track-label")) {
      hover?.classList.remove("visible");
      return;
    }
    const frame = Math.max(0, Math.min(Math.floor(frameAtPointer(scale, event)), Math.floor(timelineExtentFrame())));
    hover.style.left = `${placeFrame(frame) * 100}%`;
    hover.querySelector(".nle-timeline-hover-time").textContent = timecode(frame, state.snapshot.view.editRate);
    hover.classList.add("visible");
    if (!timelinePointer || timelinePointer.pointerId !== event.pointerId || event.buttons !== 1) return;
    const movedX = Math.abs(event.clientX - timelinePointer.startX);
    const movedY = Math.abs(event.clientY - (timelinePointer.startY ?? event.clientY));
    if ((timelinePointer.gesture === "move" ? Math.max(movedX, movedY) : movedX) < 3) return;
    if (timelinePointer.kind === "item") {
      event.preventDefault();
      try { timelineSurface.setPointerCapture(event.pointerId); } catch { /* pointer remains local */ }
      if (timelinePointer.gesture === "move") {
        mountTimelineDragGhost(timelinePointer, event);
        hover.classList.remove("visible");
        autoScrollTimelineTracks(event.clientY);
        const intent = newTrackIntentAt(timelinePointer, event.clientY);
        if (intent) placeNewTrackPlaceholder(timelinePointer, intent);
        else removeNewTrackPlaceholder(timelinePointer);
      }
      const preview = snappedTimelineGesture(timelinePointer, frameAtPointer(scale, event));
      timelinePointer.preview = preview;
      timelinePointer.dragged = preview.startFrame !== timelinePointer.startFrame
        || preview.endFrame !== timelinePointer.endFrame || timelinePointer.newTrackIntent !== undefined;
      paintTimelineGesture(timelinePointer, preview, event);
      return;
    }
    if (timelinePointer.kind === "scrub") {
      timelinePointer.dragged = true;
      try { timelineSurface.setPointerCapture(event.pointerId); } catch { /* pointer remains local */ }
      scrubTimeline(event);
    }
  });
  const finishTimelinePointer = event => {
    if (trackResizePointer?.pointerId === event.pointerId) {
      const drag = trackResizePointer;
      trackResizePointer = undefined;
      drag.row.classList.remove("resizing");
      try { timelineSurface.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      if (event.type === "pointerup" && drag.moved) {
        void transactView([{ kind: "track-height.set", track: drag.track, heightPx: drag.height }], "轨道高度已更新");
      } else renderTimeline();
      return;
    }
    if (!timelinePointer || timelinePointer.pointerId !== event.pointerId) return;
    const drag = timelinePointer;
    timelinePointer = undefined;
    const newTrackIntent = drag.newTrackIntent;
    clearTimelineGesture(drag);
    const commit = event.type === "pointerup" && drag.kind === "item" && drag.dragged;
    suppressTimelineClick = event.type === "pointerup" && drag.dragged;
    if (suppressTimelineClick) setTimeout(() => { suppressTimelineClick = false; }, 0);
    try { timelineSurface.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (!commit) {
      if (drag.kind === "item") {
        drag.node.style.left = drag.originalLeft;
        drag.node.style.width = drag.originalWidth;
      }
      return;
    }
    const projectItem = currentProject().tracks.flatMap(track => track.items)
      .find(item => item.id === drag.item.id);
    if (!projectItem) {
      renderTimeline();
      return;
    }
    if (drag.gesture === "move") {
      const delta = Math.round(drag.preview.startFrame - drag.startFrame);
      if (newTrackIntent) {
        const identity = nextTrackIdentity(newTrackIntent.kind);
        const before = projectTrackInsertionAnchor(newTrackIntent.kind, newTrackIntent.slot);
        const track = {
          id: identity.id,
          name: identity.name,
          kind: newTrackIntent.kind,
          muted: false,
          items: [],
        };
        void transact(`新建轨道并移动 ${itemLabel(projectItem, state.snapshot.mediaLibrary.assets)}`, [{
          kind: "track.add", track, ...(before === undefined ? {} : { before }),
        }, {
          kind: "item.move", ids: [projectItem.id], delta: frameValue(delta, state.snapshot.view.editRate),
          track: track.id,
        }], "已移动到新轨道");
        return;
      }
      void transact(`移动 ${itemLabel(projectItem, state.snapshot.mediaLibrary.assets)}`, [{
        kind: "item.move", ids: [projectItem.id], delta: frameValue(delta, state.snapshot.view.editRate),
      }], "时间位置已更新");
      return;
    }
    const edge = drag.gesture === "trim-start" ? "start" : "end";
    const at = edge === "start" ? drag.preview.startFrame : drag.preview.endFrame;
    void transact(`裁剪 ${itemLabel(projectItem, state.snapshot.mediaLibrary.assets)} ${edge === "start" ? "左边沿" : "右边沿"}`, [{
      kind: "item.trim", id: projectItem.id, edge,
      at: frameValue(Math.round(at), state.snapshot.view.editRate),
    }], "媒体边沿已更新");
  };
  timelineSurface.addEventListener("pointerup", finishTimelinePointer);
  timelineSurface.addEventListener("pointercancel", finishTimelinePointer);
  timelineSurface.addEventListener("dblclick", event => {
    const resize = event.target.closest("[data-track-resize]");
    if (!resize || state.busy) return;
    event.preventDefault();
    void transactView([{ kind: "track-height.set", track: resize.dataset.trackResize, heightPx: null }],
      "已恢复默认轨道高度");
  });
  timelineSurface.addEventListener("click", event => {
    if (!suppressTimelineClick) return;
    suppressTimelineClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  timelineSurface.addEventListener("pointerleave", () => {
    app.querySelector(".nle-timeline-hover")?.classList.remove("visible");
  });
  const draggedMediaEntry = event => {
    const id = draggedProjectMediaId
      || event.dataTransfer?.getData("application/x-hypit-media-asset")
      || event.dataTransfer?.getData("text/plain");
    return state.snapshot?.mediaLibrary.assets.find(entry => entry.id === id);
  };
  const mediaFitsTrack = (entry, track) => track?.kind === "picture"
    ? entry.kind === "image" || entry.kind === "video"
    : track?.kind === "audio" && (entry.kind === "audio" || entry.hasAudio);
  timelineSurface.addEventListener("dragover", event => {
    const entry = draggedMediaEntry(event);
    const lane = event.target.closest("[data-lane]");
    const track = lane && currentProject().tracks.find(candidate => candidate.id === lane.dataset.lane);
    if (!entry || !mediaFitsTrack(entry, track) || trackLocked(track.id) || state.busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  timelineSurface.addEventListener("drop", event => {
    const entry = draggedMediaEntry(event);
    const lane = event.target.closest("[data-lane]");
    const track = lane && currentProject().tracks.find(candidate => candidate.id === lane.dataset.lane);
    if (!entry || !mediaFitsTrack(entry, track) || trackLocked(track.id) || state.busy) return;
    event.preventDefault();
    const scale = app.querySelector(".nle-ruler-scale");
    const frame = Math.max(0, Math.min(Math.round(frameAtPointer(scale, event)), Math.ceil(timelineExtentFrame())));
    void placeProjectMedia(entry, track.id, frame);
  });

  const zoomStrip = app.querySelector("#timeline-zoom-strip");
  let zoomDrag;
  const zoomStripFraction = event => {
    const rectangle = zoomStrip.getBoundingClientRect();
    return (rectangle.width === 0 ? 0 : Math.max(0, Math.min(1, (event.clientX - rectangle.left) / rectangle.width)))
      * widestZoomWindow;
  };
  zoomStrip.addEventListener("pointerdown", event => {
    event.preventDefault();
    zoomStrip.setPointerCapture(event.pointerId);
    const began = state.zoomWindow;
    const from = zoomStripFraction(event);
    const grip = event.target.closest("[data-zoom-grip]")?.dataset.zoomGrip;
    const windowHeld = event.target.closest("#timeline-zoom-window") !== null;
    if (!windowHeld) {
      const width = began.end - began.start;
      settleZoom(from - width / 2, from + width / 2);
      zoomDrag = { kind: "window", began: state.zoomWindow, from };
    } else {
      zoomDrag = { kind: grip ?? "window", began, from };
    }
  });
  zoomStrip.addEventListener("pointermove", event => {
    if (!zoomDrag || event.buttons !== 1) return;
    const at = zoomStripFraction(event);
    if (zoomDrag.kind === "start") settleZoom(Math.min(at, zoomDrag.began.end - narrowestZoomWindow()), zoomDrag.began.end);
    else if (zoomDrag.kind === "end") settleZoom(zoomDrag.began.start, Math.max(at, zoomDrag.began.start + narrowestZoomWindow()));
    else {
      const shift = at - zoomDrag.from;
      settleZoom(zoomDrag.began.start + shift, zoomDrag.began.end + shift);
    }
  });
  const finishZoomDrag = event => {
    zoomDrag = undefined;
    try { zoomStrip.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };
  zoomStrip.addEventListener("pointerup", finishZoomDrag);
  zoomStrip.addEventListener("pointercancel", finishZoomDrag);
  zoomStrip.addEventListener("dblclick", () => settleZoom(0, 1));

  const timelineResizeObserver = new ResizeObserver(() => {
    const scroll = app.querySelector("#timeline-scroll");
    const tracks = app.querySelector("#tracks");
    const range = Math.max(0, tracks.scrollHeight - scroll.clientHeight);
    if (state.timelineVerticalReady && range > 0) state.timelineScrollRatio = scroll.scrollTop / range;
    const ruler = app.querySelector(".nle-ruler");
    const stack = app.querySelector(".nle-track-stack");
    const availableHeight = Math.max(0, scroll.clientHeight - (ruler?.offsetHeight ?? 22));
    const sceneTracks = state.snapshot?.scene.tracks ?? [];
    const trackHeight = sceneTracks.reduce((total, track) => total + track.heightPx, 0);
    const edgeRoom = Math.min(12, Math.max(8, (sceneTracks[0]?.heightPx ?? 54) / 6));
    const scrollable = trackHeight + edgeRoom * 2 > availableHeight;
    tracks.style.setProperty("--timeline-track-area-height", `${availableHeight}px`);
    tracks.style.setProperty("--timeline-track-edge-room", `${edgeRoom}px`);
    stack?.classList.toggle("scrollable", scrollable);
    const nextRange = Math.max(0, tracks.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = nextRange * Math.max(0, Math.min(1, state.timelineScrollRatio));
    drawTimelineRuler(app.querySelector(".nle-ruler-scale"));
  });
  timelineResizeObserver.observe(app.querySelector(".nle-timeline-scroll"));

  addEventListener("keydown", event => {
    if (!state.snapshot || event.target.matches("input,textarea,select")) return;
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key.toLowerCase() === "z") { event.preventDefault(); app.querySelector(`[data-action="${event.shiftKey ? "redo" : "undo"}"]`).click(); return; }
    if (event.key === "F2" && state.renameEdit) { event.preventDefault(); state.renameEdit(); return; }
    if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); stopPlayback(); seek(state.frame - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); stopPlayback(); seek(state.frame + 1); }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); void removeSelected(); }
    if (event.key === "Escape" && state.selection) { select(undefined); }
    if (event.key.toLowerCase() === "v") { state.tool = "select"; renderChrome(); renderTimeline(); }
    if (event.key.toLowerCase() === "c") { state.tool = "cut"; renderChrome(); renderTimeline(); }
  });

  addEventListener("message", event => {
    const frame = app.querySelector("#programme iframe");
    if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
    if (event.data?.type === "hypit.html-document.error@1") {
      state.playing = false;
      if (state.animation !== undefined) cancelAnimationFrame(state.animation);
      state.animation = undefined;
      app.querySelector(".programme-loading")?.remove();
      renderChrome();
      notify(String(event.data.message ?? "画面预览失败"), true);
      return;
    }
    if (event.data?.type === "hypit.html-document.state@1") {
      app.querySelector(".programme-loading")?.remove();
    }
  });

  addEventListener("beforeunload", event => { if (state.snapshot?.dirty) event.preventDefault(); });
  request("/api/nle").then(value => { state.snapshot = value; render(); }).catch(error => {
    app.dataset.loading = "false";
    notify(error instanceof Error ? error.message : String(error), true);
  });
}
