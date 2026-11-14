import { bindWorkbenchTopbar, workbenchTopbar } from "/assets/topbar.js";
import { findOpenCanvasPosition, resolveCanvasSnap } from "/assets/canvas-snapping.js";
import {
  activeAuthoringPorts as declaredActiveAuthoringPorts,
  authoringBindingInputKeys,
  authoringVariantInputs,
  automaticAuthoringConnection,
  compatibleAuthoringConnections,
  replaceableAuthoringConnections,
} from "/assets/canvas-authoring.js";

const app = document.querySelector("#app");
const NODE_CAPTION_HEIGHT = 30;
const DEFAULT_NODE_WIDTH = 300;
const DEFAULT_MEDIA_HEIGHT = 170;
const DEFAULT_NODE_HEIGHT = NODE_CAPTION_HEIGHT + DEFAULT_MEDIA_HEIGHT;
const MIN_NODE_WIDTH = 160;
const MIN_NODE_HEIGHT = 72;
const MAX_NODE_SIZE = 960;
const PROJECT_MEDIA_DRAG_TYPE = "application/x-hypit-project-media";
const PRODUCT_DRAG_TYPE = "application/x-hypit-generation-product";

const icons = {
  canvas: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5M8 17h3"/>',
  timeline: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M8 5v4M14 10v4M18 15v4"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  select: '<path d="m5 3 12 9-6 1-3 6z"/>',
  hand: '<path d="M8.5 11V6.5a1.5 1.5 0 0 1 3 0V10m0-4.5a1.5 1.5 0 0 1 3 0V10m0-3a1.5 1.5 0 0 1 3 0v5m0-2a1.5 1.5 0 0 1 3 0v3.5c0 4.1-2.8 7-7 7h-1.2a7 7 0 0 1-5.1-2.2L3.8 15a1.6 1.6 0 0 1 2.1-2.4L8.5 14z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="3"/><path d="m17 10 4-2v8l-4-2z"/>',
  audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4"/>',
  text: '<path d="M5 5V3h14v2M12 3v18M8 21h8"/>',
  asset: '<path d="M4 8h6l2-3h8v14H4z"/>',
  product: '<path d="m12 3 8 4.5-8 4.5-8-4.5z"/><path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5"/>',
  upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5h14v-5"/>',
  align: '<path d="M5 4v16M9 7h10v4H9zM9 14h7v4H9z"/>',
  minimap: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 8h5v4H6zM14 13h4v3h-4z"/>',
  transcript: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
  component: '<path d="m12 2 4 2.3v4.6L12 11.2 8 8.9V4.3zM4 12l4 2.3v4.6L4 21.2 0 18.9v-4.6zM20 12l4 2.3v4.6L20 21.2l-4-2.3v-4.6z" transform="scale(.78) translate(3.4 1.7)"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  menu: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  spark: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  arrowUp: '<path d="M12 19V5m0 0-6 6m6-6 6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
};

function icon(name, size = 16) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ""}</svg>`;
}

function railLabel(label) {
  return `<span class="tool-rail-label" aria-hidden="true"><i>${escapeHtml(label)}</i></span>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

const rolePresentation = {
  asset: { key: "asset", label: "素材", color: "mint" },
  image: { key: "image", label: "图片", color: "violet" },
  video: { key: "video", label: "视频", color: "blue" },
  audio: { key: "audio", label: "音频", color: "amber" },
  text: { key: "text", label: "文本", color: "rose" },
  transcript: { key: "transcript", label: "转写", color: "cyan" },
  generic: { key: "component", label: "组件", color: "rose" },
};

const categoryRoles = {
  image: new Set(["image"]),
  video: new Set(["video"]),
  audio: new Set(["audio", "transcript"]),
  asset: new Set(["asset"]),
};

function typePresentation(presentation) {
  return rolePresentation[presentation?.role] ?? rolePresentation.generic;
}

function literalPreview(node, presentation) {
  const input = presentation.summaryInput === undefined ? undefined : node.inputs[presentation.summaryInput];
  if (!input || !("value" in input)) return "已配置的生成节点";
  if (typeof input.value === "string") return input.value;
  if (input.value && typeof input.value === "object" && typeof input.value.path === "string") return input.value.path;
  return compactValue(input.value);
}

function compactValue(value) {
  if (typeof value === "string") return value.length > 54 ? `${value.slice(0, 54)}…` : value;
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const mediaNodeRoles = new Set(["asset", "image", "video", "audio"]);

function connectorDefault(side) {
  return { x: side === "output" ? 52 : 8, y: 60 };
}

function placeConnector(element, x, y) {
  element.style.setProperty("--connector-x", `${Number(x.toFixed(2))}px`);
  element.style.setProperty("--connector-y", `${Number(y.toFixed(2))}px`);
}

function followConnector(element, side, clientX, clientY) {
  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const rawX = (clientX - bounds.left) / bounds.width * 60;
  const rawY = (clientY - bounds.top) / bounds.height * 120;
  placeConnector(
    element,
    side === "output" ? Math.min(Math.max(rawX, 30), 90) : Math.min(Math.max(rawX, -30), 30),
    Math.min(Math.max(rawY, 0), 120),
  );
}

function resetConnector(element, side) {
  const value = connectorDefault(side);
  placeConnector(element, value.x, value.y);
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

function renderUnavailableSurface() {
  const selected = location.pathname === "/nle" ? "timeline" : location.pathname === "/comments" ? "comments" : "scene";
  const label = selected === "timeline" ? "时间线" : selected === "comments" ? "评论" : "场景";
  document.title = `${label} · Hypit`;
  app.className = "unavailable-surface";
  app.innerHTML = `${topbar(label)}<main><div class="unavailable-card">${icon(selected === "scene" ? "cube" : selected === "comments" ? "transcript" : selected, 26)}<strong>${label}工作面未随当前文档打开</strong><span>当前 Host 打开的是生成画布。选择“画布”返回，或用对应工程文件启动 Workbench。</span><a href="/canvas">返回画布</a></div></main>`;
  bindWorkbenchTopbar(app);
  app.dataset.loading = "false";
}

function brand() {
  return `<div class="brand" aria-label="Hypit"><span class="brand-mark" aria-hidden="true">
    <svg class="brand-symbol" viewBox="50 180 262 234" preserveAspectRatio="xMidYMid meet"><path fill="currentColor" d="M303.78 277.82c-5.98-8.63-15.83-13.77-26.32-13.77h-93.41c-12.28 0-24.92 7.44-29.6 18.8l-28.26 75.82c-4.6 11.25-4.54 24.05 2.22 34.16 6.79 10.15 19.36 16.15 31.57 16.15h85.98c14.12 0 26.9-8.88 31.84-22.1l29.69-79.57c3.67-9.84 2.29-20.86-3.69-29.48Zm-51.76 99.43c-.94 2.52-3.39 4.22-6.08 4.22h-83.45c-4.34 0-6.68-2.8-7.49-3.99s-2.5-4.43-.84-8.44l23.85-66.24c2.29-6.35 8.08-10.87 14.82-11.22.33-.02.67-.02 1.02-.02h75.41s12.51 1.42 9.29 14.61l-26.53 71.09ZM106.85 361.73s-22.36-11.59-17.66-32.66l29.67-82.23c4.78-13.25 17.36-22.09 31.45-22.09h95.02c6.25 0 12.1 3.03 15.71 8.14l13.89 19.68H161.96c-8.7 0-16.49 5.41-19.52 13.57l-35.59 95.6Zm-33.55-38.46s-22.37-11.59-17.66-32.66l29.67-82.23c4.79-13.25 17.37-22.09 31.45-22.09h89.91c6.25 0 12.1 3.03 15.71 8.14l13.89 19.68H128.43c-8.7 0-16.49 5.41-19.52 13.57l-35.59 95.6Z"/></svg>
    <svg class="brand-wordmark" viewBox="370 228 422 180" preserveAspectRatio="xMinYMid meet"><g fill="currentColor"><rect x="692.47" y="276.19" width="19.22" height="90.09" rx="4.12"/><path d="M462.31 293.32c-4.51-11.11-12.93-15.68-28.26-17.66-15.52-2-31.17 1.58-36.41 2.96V240.2c0-2.22-1.8-4.02-4.02-4.02h-11.19c-2.22 0-4.02 1.8-4.02 4.02v123.26c0 2.22 1.8 4.02 4.02 4.02h11.19c2.22 0 4.02-1.8 4.02-4.02v-66.25c3.68-1.46 16.84-6.13 30.89-4.57 12.12 1.35 15.81 10.13 16.92 14.75.32 1.33.47 2.68.47 4.03v53.36c0 1.49 1.2 2.68 2.68 2.68h13.65c1.49 0 2.68-1.2 2.68-2.68V307.4c0-4.82-.82-9.63-2.63-14.09Z"/><path d="M568.55 346.34v-67.42c0-1.57-1.27-2.85-2.85-2.85h-14.66c-1.57 0-2.85 1.27-2.85 2.85v64.51c0 .58-.19 1.16-.58 1.6-1.62 1.88-7.33 6.23-25.19 5.92-2.22.05-6.37-.58-8.51-1.13-14.03-3.61-12.62-17.41-12.62-33.16v-37.73c0-1.57-1.27-2.85-2.85-2.85h-13.68c-1.57 0-2.85 1.27-2.85 2.85v57.63s-2.72 24.49 25.91 30.92c0 0 3.11.67 7.45 1.01 3.13.16 8.78.27 14.27-.42 6.97-.77 13.42-2.51 17.37-5.02 0 0-1.77 20.45-18.82 23.73-9.86 1.13-24.24-.46-31.62-1.65-2.22-.36-4.33 1.06-4.84 3.24l-2.55 10.92c-.49 2.08.99 4.09 3.1 4.28 7.44.63 23.6 1.84 34.54 1.37 14.62-.61 26.8-6.24 34.06-21.17 7.26-14.93 5.93-37.54 5.93-37.54Z"/><path d="M674.19 297.63c-8.46-21.2-28.09-21.76-37.64-22.58-7.78-.66-37.08.93-47.69 1.54-2.17.13-3.86 1.92-3.86 4.1v119.88c0 1.74 1.41 3.14 3.14 3.14h14.17c1.74 0 3.14-1.41 3.14-3.14v-34.16c45.01 4.23 52.91-1.5 60.82-8.86 8.8-8.2 15.13-37.91 7.91-59.92Zm-17.73 33.19c-.27 4.64-1.91 18-19.5 19.22-17.59 1.23-31.5-2.32-31.5-2.32v-54.21c4.62-.18 16.65-.61 25.09-.61 10.64 0 15.27 1.5 21.82 8.32s4.37 24.96 4.09 29.59Z"/><path d="M784.34 292.92c1.41 0 2.56-1.15 2.56-2.56v-11.6c0-1.41-1.15-2.56-2.56-2.56h-27.3v-19.11c0-1.32-1.07-2.38-2.38-2.38h-14.87c-1.32 0-2.38 1.07-2.38 2.38v19.11h-10.74c-1.41 0-2.56 1.15-2.56 2.56v11.6c0 1.41 1.15 2.56 2.56 2.56h10.74v48.61c0 14.46 11.72 26.19 26.19 26.19h19.46c2.13 0 3.86-1.73 3.86-3.86v-9.69c0-2.13-1.73-3.86-3.86-3.86h-13.53c-6.9 0-12.48-5.59-12.48-12.48v-44.92h27.3Z"/></g><circle fill="#e83f5f" cx="703.1" cy="250.37" r="14.18"/></svg>
  </span></div>`;
}

function topbar(title, environment) {
  return workbenchTopbar({ projectName: title, mode: "floating", environment });
}

if (location.pathname !== "/canvas") {
  renderUnavailableSurface();
} else {
  startCanvas();
}

async function startCanvas() {
  const state = {
    snapshot: undefined,
    selection: undefined,
    selected: new Set(),
    selectedEdges: new Set(),
    zoom: 0.82,
    filter: "",
    category: "image",
    libraryOpen: false,
    minimapOpen: false,
    busy: false,
    worldLeft: 0,
    worldTop: 0,
    worldWidth: 1,
    worldHeight: 1,
    camera: { x: 0, y: 0 },
    tool: "select",
    drag: undefined,
    resize: undefined,
    pan: undefined,
    marquee: undefined,
    connection: undefined,
    pendingConnection: undefined,
    connectionMenuOptions: [],
    receiving: undefined,
    panelNode: undefined,
    imports: [],
    generating: new Set(),
    environmentConnecting: false,
    resultTabs: new Set(),
    choiceMenu: undefined,
    suppressClick: false,
    suppressClickTimer: undefined,
    clipboard: undefined,
    pasteCount: 0,
    intrinsicSizes: new Map(),
  };

  app.className = "canvas-workbench";
  app.innerHTML = `
    <div id="topbar-slot"></div>
    <div class="workspace">
      <aside class="node-library graph-library">
        <header class="graph-library-heading"><div><span id="library-eyebrow" class="eyebrow">IMAGE</span><strong id="library-title">图片</strong></div><div><span id="node-count"></span><button id="library-refresh" type="button" data-action="library-refresh" aria-label="刷新项目素材" title="刷新项目素材">${icon("history", 14)}</button><button type="button" data-action="library-close" aria-label="关闭">×</button></div></header>
        <label class="search-field">${icon("search", 15)}<input id="node-search" type="search" placeholder="搜索组件或模型" autocomplete="off"></label>
        <div id="node-list" class="node-list"></div>
      </aside>
      <main class="canvas-area">
        <nav class="tool-rail graph-create-rail" aria-label="创建与素材">
          <button type="button" data-category="image" aria-label="添加图片" aria-pressed="false">${icon("image", 19)}${railLabel("图片")}</button>
          <button type="button" data-category="video" aria-label="添加视频" aria-pressed="false">${icon("video", 19)}${railLabel("视频")}</button>
          <button type="button" data-category="audio" aria-label="添加音频" aria-pressed="false">${icon("audio", 19)}${railLabel("音频")}</button>
          <div class="graph-rail-divider"></div>
          <button type="button" data-category="product" aria-label="产物" aria-pressed="false">${icon("product", 19)}${railLabel("产物")}</button>
          <button type="button" data-category="asset" aria-label="素材" aria-pressed="false">${icon("asset", 19)}${railLabel("素材")}</button>
          <button type="button" data-action="import" aria-label="导入">${icon("upload", 19)}${railLabel("导入")}</button>
          <div class="graph-rail-divider"></div>
          <button type="button" class="active" data-action="pointer-mode" aria-label="选择工具" aria-pressed="true">${icon("select", 19)}${railLabel("选择")}</button>
          <button type="button" data-action="align" aria-label="对齐到网格">${icon("align", 19)}${railLabel("对齐")}</button>
          <button type="button" data-action="minimap" aria-label="小地图" aria-pressed="false">${icon("minimap", 19)}${railLabel("小地图")}</button>
        </nav>
        <div id="viewport" class="viewport">
          <div id="world-space" class="world-space"><div id="world" class="world">
            <svg id="edges" class="edges" aria-hidden="true"></svg><div id="snap-guides" class="snap-guides" aria-hidden="true"></div><div id="nodes" class="nodes"></div>
          </div></div>
        </div>
        <div id="node-panel-host" class="node-panel-host" hidden></div>
        <div id="minimap" class="minimap" aria-hidden="true"><svg></svg></div>
        <div id="selection-marquee" class="selection-marquee" hidden></div>
        <input id="media-import" type="file" accept="image/*,video/*,audio/*" multiple hidden>
      </main>
    </div>
    <div id="connection-menu" class="connection-menu" hidden></div>
    <div id="node-context-menu" class="node-context-menu" hidden>
      <button type="button" data-node-action="duplicate">${icon("plus", 14)}<span>创建副本</span><kbd>⌘D</kbd></button>
      <button type="button" data-node-action="copy">${icon("copy", 14)}<span>复制</span><kbd>⌘C</kbd></button>
      <button type="button" class="danger" data-node-action="delete">${icon("close", 14)}<span>删除</span><kbd>⌫</kbd></button>
    </div>
    <div id="notice" class="notice" role="status" aria-live="polite"></div>`;

  const notice = app.querySelector("#notice");
  const notify = (message, error = false) => {
    notice.textContent = message;
    notice.dataset.error = String(error);
    notice.dataset.visible = "true";
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { notice.dataset.visible = "false"; }, error ? 5000 : 1800);
  };

  function graphNode(id) {
    return state.snapshot.graph.nodes.find(node => node.id === id);
  }

  function workspaceNode(id) {
    return state.snapshot.workspace.nodes.find(node => node.node === id);
  }

  function fitMediaSize(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
    const ratio = width / height;
    let fittedWidth = DEFAULT_NODE_WIDTH;
    let fittedHeight = fittedWidth / ratio;
    const maximum = 380;
    if (fittedHeight > maximum) {
      fittedHeight = maximum;
      fittedWidth = fittedHeight * ratio;
    }
    if (fittedWidth > maximum) {
      fittedWidth = maximum;
      fittedHeight = fittedWidth / ratio;
    }
    return {
      width: Math.max(MIN_NODE_WIDTH, Math.round(fittedWidth)),
      mediaHeight: Math.max(MIN_NODE_HEIGHT, Math.round(fittedHeight)),
    };
  }

  function automaticNodeSize(item) {
    const node = graphNode(item.node);
    const media = item.presentation.category === "asset" ? mediaForGraphNode(node) : undefined;
    const observation = displayedObservation(item);
    const intrinsic = media?.width !== undefined && media?.height !== undefined
      ? { width: media.width, height: media.height }
      : state.intrinsicSizes.get(nodeMediaKey(item, media));
    const fitted = intrinsic === undefined ? undefined : fitMediaSize(intrinsic.width, intrinsic.height);
    if (fitted !== undefined) return fitted;
    if (observation?.state === "ready" && observation.product?.representation === "file"
      && observation.product.mediaType.startsWith("audio/")) {
      return { width: DEFAULT_NODE_WIDTH, mediaHeight: 72 };
    }
    if (item.presentation.category !== "asset") {
      return { width: DEFAULT_NODE_WIDTH, mediaHeight: DEFAULT_NODE_WIDTH };
    }
    const role = media?.kind ?? item.presentation.role;
    if (role === "image") return { width: DEFAULT_NODE_WIDTH, mediaHeight: DEFAULT_NODE_WIDTH };
    if (role === "video") return { width: DEFAULT_NODE_WIDTH, mediaHeight: Math.round(DEFAULT_NODE_WIDTH * 9 / 16) };
    if (role === "audio") return { width: DEFAULT_NODE_WIDTH, mediaHeight: 72 };
    return { width: DEFAULT_NODE_WIDTH, mediaHeight: DEFAULT_MEDIA_HEIGHT };
  }

  function nodeMediaKey(item, media) {
    const observation = displayedObservation(item);
    if (observation?.state === "ready") return `result:${observation.build}/${observation.output}`;
    if (media?.id !== undefined) return `media:${media.id}`;
    return `node:${item.id}`;
  }

  function nodeGeometry(item) {
    const preview = state.resize?.id === item.id ? state.resize.preview : undefined;
    const saved = workspaceNode(item.node);
    const size = preview ?? (saved?.width !== undefined && saved?.height !== undefined
      ? { width: saved.width, mediaHeight: saved.height }
      : automaticNodeSize(item));
    return {
      width: size.width,
      mediaHeight: size.mediaHeight,
      height: NODE_CAPTION_HEIGHT + size.mediaHeight,
    };
  }

  function isSelected(id) {
    return state.selected.has(id);
  }

  function nodeReport(id) {
    return state.snapshot.nodes.find(node => node.node === id)
      ?? { node: id, readiness: "invalid", message: "节点没有分析结果" };
  }

  function sceneItem(id) {
    const item = state.snapshot.scene.items.find(candidate => candidate.id === id);
    const preview = state.drag?.positions?.get(id);
    return item === undefined || preview === undefined ? item : { ...item, ...preview };
  }

  function nodeType(nodeId) {
    return state.snapshot.scene.nodeTypes.find(item => item.node === nodeId)
      ?? { node: nodeId, displayName: graphNode(nodeId)?.using.name ?? "Missing node", role: "generic" };
  }

  function modelLabel(node, presentation) {
    return presentation.modelLabel ?? presentation.displayName;
  }

  function resultMediaUrl(observation) {
    const query = new URLSearchParams({ publication: observation.build, name: observation.output });
    return `/api/canvas/result-media?${query}`;
  }

  function audioPreviewMarkup(source) {
    return `<audio class="media-preview-element" data-media-preview-element="audio" src="${source}" preload="metadata"></audio><div class="media-preview-control audio" data-media-preview-state="audio"><button type="button" class="audio-preview-play" data-media-preview="audio" aria-label="播放音频预览"><span class="media-preview-icon">${icon("play", 13)}</span></button><span class="media-audio-wave" aria-hidden="true">${[4, 9, 6, 13, 8, 15, 10, 6, 14, 8, 5, 12, 7, 14, 6, 10, 4, 12, 8, 4].map(height => `<i style="height:${height}px"></i>`).join("")}</span><time>0:00</time></div>`;
  }

  function resultMedia(observation, role, thumbnail = false) {
    if (observation?.state !== "ready" || observation.product?.representation !== "file") {
      return icon(rolePresentation[role]?.key ?? "component", thumbnail ? 18 : 30);
    }
    const mediaType = observation.product.mediaType;
    const source = escapeHtml(resultMediaUrl(observation));
    if (mediaType.startsWith("image/")) return `<img src="${source}" alt="" loading="lazy">`;
    if (mediaType.startsWith("video/")) return `<video src="${source}" muted playsinline preload="metadata"></video>`;
    if (thumbnail) return `<span class="audio-result">${icon("audio", 18)}</span>`;
    return audioPreviewMarkup(source);
  }

  function displayedObservation(item) {
    if (item.selectedObservation?.state === "ready") return item.selectedObservation;
    return [...item.outputs].reverse().find(output => output.state === "ready");
  }

  function resultStateLabel(output) {
    return output.state === "ready" ? "已完成"
      : output.state === "pending" ? "正在提交"
        : output.state === "running" ? "生成中"
          : output.state === "finalizing" ? "正在保存"
            : output.state === "failed" ? "失败"
              : output.state === "cancelled" ? "已取消" : "不可用";
  }

  function resultHistoryMarkup(item) {
    if (item.outputs.length === 0) {
      return '<div class="generation-results-empty">生成结果会显示在这里</div>';
    }
    const failures = [...item.outputs].reverse().filter(output => output.state === "failed" || output.state === "cancelled");
    return `<div class="generation-results"><div class="generation-results-heading"><strong>生成结果</strong><span>${item.outputs.length}</span></div><div class="node-result-strip">${[...item.outputs].reverse().map((output, index) => {
      const selected = item.selected?.build === output.build && item.selected?.output === output.output;
      const ready = output.state === "ready";
      const label = `${selected ? "当前使用 · " : ""}${resultStateLabel(output)}${output.message ? ` · ${output.message}` : ""}`;
      const media = ready && output.product?.representation === "file"
        && /^(?:image|video|audio)\//u.test(output.product.mediaType);
      const canMaterialize = media && state.snapshot.materialization?.available === true;
      return `<div class="node-result-resource"><button type="button" class="result-select ${selected ? "selected" : ""} state-${output.state}" ${ready ? `data-result-build="${escapeHtml(output.build)}" data-result-output="${escapeHtml(output.output)}"` : "disabled"} aria-pressed="${selected}" title="${escapeHtml(label)}">${resultMedia(output, item.presentation.role, true)}<span>${index + 1}</span></button>${canMaterialize ? `<button type="button" class="result-materialize" data-materialize-build="${escapeHtml(output.build)}" data-materialize-output="${escapeHtml(output.output)}" title="作为素材添加到画布" aria-label="作为素材添加到画布">${icon("plus", 12)}</button>` : ""}</div>`;
    }).join("")}</div>${failures.length === 0 ? "" : `<div class="generation-result-errors">${failures.map(output => `<div><span>${icon("close", 12)}</span><p><strong>${escapeHtml(resultStateLabel(output))}</strong><small>${escapeHtml(output.message)}</small></p></div>`).join("")}<button type="button" data-generate-node="${escapeHtml(item.id)}">重新生成</button></div>`}<p class="generation-results-hint">最新生成结果会自动选用；再次点击可取消复用。</p></div>`;
  }

  function generationIssue(targetId) {
    if (!state.snapshot.generation.available) return state.snapshot.generation.issue ?? "生成服务不可用";
    const visited = new Set();
    const inspect = (id, target = false) => {
      if (visited.has(id)) return undefined;
      visited.add(id);
      const item = sceneItem(id);
      if (!target && item?.selected !== undefined) {
        return item.selectedObservation?.state === "ready"
          ? undefined
          : `${item.name} 选中的结果不可用`;
      }
      const report = nodeReport(id);
      if (report.readiness === "invalid") return report.message;
      if (report.readiness === "incomplete") return `${item?.name ?? id} 缺少 ${report.missing.join("、")}`;
      if (target && report.kind !== "operation") return "素材节点无需生成";
      if (report.kind === "value") return undefined;
      const node = graphNode(id);
      for (const input of Object.values(node?.inputs ?? {})) {
        if (!("node" in input)) continue;
        const issue = inspect(input.node);
        if (issue !== undefined) return issue;
      }
      return undefined;
    };
    return inspect(targetId, true);
  }

  function inlineSummaryEditor(node, presentation) {
    if (presentation.summaryInput === undefined) return `<p>${escapeHtml(literalPreview(node, presentation))}</p>`;
    const input = node.inputs[presentation.summaryInput];
    const control = presentation.editor?.controls.find(candidate => candidate.input === presentation.summaryInput);
    if (input === undefined && control?.value.kind === "text") {
      return `<textarea class="node-prompt-editor" data-graph-input="${escapeHtml(presentation.summaryInput)}" data-input-node="${escapeHtml(node.id)}" data-input-kind="string" rows="4" aria-label="${escapeHtml(presentation.summaryInput)}" placeholder="${escapeHtml(presentation.editor?.labels.controls?.find(item => item.id === control.id)?.placeholder ?? "")}"></textarea>`;
    }
    if (input === undefined || !("value" in input) || typeof input.value !== "string") {
      return `<p>${escapeHtml(literalPreview(node, presentation))}</p>`;
    }
    return `<textarea class="node-prompt-editor" data-graph-input="${escapeHtml(presentation.summaryInput)}" data-input-node="${escapeHtml(node.id)}" data-input-kind="string" rows="4" aria-label="${escapeHtml(presentation.summaryInput)}">${escapeHtml(input.value)}</textarea>`;
  }

  function graphNodeForItem(id) {
    const item = sceneItem(id);
    return item?.kind === "graph-node" ? graphNode(item.node) : undefined;
  }

  function isVisibleMediaEdge(edge) {
    if (edge.kind !== "recipe") return false;
    const source = graphNodeForItem(edge.from);
    return source !== undefined && mediaNodeRoles.has(nodeType(source.id).role);
  }

  function visibleMediaEdges() {
    return state.snapshot.scene.edges.filter(isVisibleMediaEdge);
  }

  function calculateWorld() {
    const items = [...state.snapshot.scene.items, ...state.imports];
    if (items.length === 0) {
      state.worldLeft = -600;
      state.worldTop = -500;
      state.worldWidth = 1200;
      state.worldHeight = 1000;
      return;
    }
    const padding = 640;
    state.worldLeft = Math.min(...items.map(item => item.x)) - padding;
    state.worldTop = Math.min(...items.map(item => item.y)) - padding;
    state.worldWidth = Math.max(1200, Math.max(...items.map(item => item.x
      + (item.kind === "graph-node" ? nodeGeometry(item).width : DEFAULT_NODE_WIDTH))) - state.worldLeft + padding);
    state.worldHeight = Math.max(1000, Math.max(...items.map(item => item.y
      + (item.kind === "graph-node" ? nodeGeometry(item).height : DEFAULT_NODE_HEIGHT))) - state.worldTop + padding);
  }

  function renderChrome() {
    const { workspace } = state.snapshot;
    const environment = state.snapshot.environment === undefined ? undefined : {
      ...state.snapshot.environment,
      connecting: state.environmentConnecting,
    };
    app.querySelector("#topbar-slot").innerHTML = topbar(workspace.name, environment);
    bindWorkbenchTopbar(app);
    app.classList.toggle("library-open", state.libraryOpen);
    app.classList.toggle("tool-select", state.tool === "select");
    app.classList.toggle("tool-pan", state.tool === "pan");
    for (const button of app.querySelectorAll("[data-category]")) {
      const active = state.libraryOpen && button.dataset.category === state.category;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    const pointerButton = app.querySelector('[data-action="pointer-mode"]');
    const selecting = state.tool === "select";
    pointerButton.classList.toggle("active", selecting);
    pointerButton.setAttribute("aria-pressed", String(selecting));
    pointerButton.setAttribute("aria-label", selecting ? "选择工具；点击切换到抓手工具" : "抓手工具；点击切换到选择工具");
    pointerButton.innerHTML = `${icon(selecting ? "select" : "hand", 19)}${railLabel(selecting ? "选择" : "拖动")}`;
    const categoryNames = {
      image: ["IMAGE", "图片"], video: ["VIDEO", "视频"],
      audio: ["AUDIO", "音频"], component: ["COMPONENTS", "组件"],
      product: ["OUTPUTS", "产物"], asset: ["PROJECT MEDIA", "素材"],
    };
    const [eyebrow, title] = categoryNames[state.category] ?? ["PROJECT NODES", "工程节点"];
    app.querySelector("#library-eyebrow").textContent = eyebrow;
    app.querySelector("#library-title").textContent = title;
    app.querySelector("#node-search").placeholder = state.category === "asset" ? "搜索素材"
      : state.category === "product" ? "搜索产物、模型或状态" : "搜索组件或模型";
    app.querySelector("#library-refresh").hidden = state.category !== "asset";
    const minimap = app.querySelector('[data-action="minimap"]');
    minimap.classList.toggle("active", state.minimapOpen);
    minimap.setAttribute("aria-pressed", String(state.minimapOpen));
  }

  function renderLibrary() {
    const filter = state.filter.toLowerCase();
    const visible = state.category === "asset"
      ? state.snapshot.mediaLibrary.assets.flatMap(media => {
          const haystack = `${media.name} ${media.kind} ${media.mediaType ?? ""} ${media.asset}`.toLowerCase();
          return haystack.includes(filter) ? [{ kind: "media", media }] : [];
        })
      : state.category === "product"
        ? [...state.snapshot.workspace.outputs].reverse().flatMap(address => {
            const item = state.snapshot.scene.items.find(candidate => candidate.node === address.node);
            const output = item?.outputs.find(candidate => candidate.build === address.build
              && candidate.output === address.output);
            if (!item || !output) return [];
            const haystack = `${item.name} ${item.presentation.displayName} ${item.presentation.modelLabel ?? ""} ${output.state} ${resultStateLabel(output)} ${output.build} ${output.output}`.toLowerCase();
            return haystack.includes(filter) ? [{ kind: "product", item, output }] : [];
          })
      : state.snapshot.catalog.flatMap((presentation, index) => {
          const category = presentation.category ?? presentation.role;
          const categoryMatches = categoryRoles[state.category]?.has(category);
          const haystack = `${presentation.displayName} ${presentation.modelLabel ?? ""} ${presentation.using.module.name} ${presentation.using.name}`.toLowerCase();
          return categoryMatches && haystack.includes(filter) ? [{ kind: "catalog", presentation, index }] : [];
        });
    app.querySelector("#node-count").textContent = String(visible.length).padStart(2, "0");
    const list = app.querySelector("#node-list");
    list.classList.toggle("project-media-grid", state.category === "asset" || state.category === "product");
    list.innerHTML = visible.length === 0
      ? `<div class="list-empty">${state.category === "asset" ? "还没有素材，请使用导入"
        : state.category === "product" ? "还没有画布产物" : "没有匹配的模型"}</div>`
      : visible.map(entry => {
        if (entry.kind === "media") {
          const media = entry.media;
          const existing = graphNodeForMedia(media);
          const preview = media.error !== undefined
            ? `<div class="project-media-fallback">${icon("asset", 22)}</div>`
            : media.kind === "image"
              ? `<img src="${escapeHtml(media.resource)}" alt="" loading="lazy" draggable="false">`
              : media.kind === "video"
                ? `<video src="${escapeHtml(media.resource)}" muted preload="metadata"></video>`
                : `<div class="project-media-fallback">${icon(media.kind === "audio" ? "audio" : "asset", 24)}</div>`;
          const dimensions = media.width !== undefined && media.height !== undefined
            ? `${media.width} × ${media.height}`
            : media.kind === "audio" ? "音频" : media.mediaType ?? "素材";
          return `<button type="button" class="project-media-card ${existing ? "placed" : ""} ${media.error ? "invalid" : ""}" data-media-id="${escapeHtml(media.id)}" ${media.error ? "disabled" : "draggable=\"true\""} title="${escapeHtml(media.error ?? (existing ? "定位画布上的素材" : "添加到画布"))}">
            <span class="project-media-preview">${preview}<i>${escapeHtml(media.kind)}</i>${existing ? `<b>${icon("check", 11)}</b>` : ""}</span>
            <strong>${escapeHtml(media.name)}</strong><small>${escapeHtml(dimensions)}</small>
          </button>`;
        }
        if (entry.kind === "product") {
          const { item, output } = entry;
          const readyMedia = output.state === "ready" && output.product?.representation === "file"
            && /^(?:image|video|audio)\//u.test(output.product.mediaType);
          const canMaterialize = readyMedia && state.snapshot.materialization?.available === true;
          const mediaKind = readyMedia ? output.product.mediaType.split("/", 1)[0] : item.presentation.role;
          const status = resultStateLabel(output);
          const title = canMaterialize
            ? "拖到画布：发布为素材并创建节点；点击定位生成节点"
            : `${status}${output.message ? ` · ${output.message}` : ""} · 点击定位生成节点`;
          return `<button type="button" class="project-media-card product-card state-${escapeHtml(output.state)}" data-product-source="${escapeHtml(item.node)}" data-product-build="${escapeHtml(output.build)}" data-product-output="${escapeHtml(output.output)}" ${canMaterialize ? "draggable=\"true\"" : ""} title="${escapeHtml(title)}">
            <span class="project-media-preview">${resultMedia(output, item.presentation.role)}<i>${escapeHtml(status)}</i>${canMaterialize ? `<b>${icon("plus", 11)}</b>` : ""}</span>
            <strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(output.message ?? `${modelLabel(graphNode(item.node), item.presentation)} · ${mediaKind}`)}</small>
          </button>`;
        }
        const type = typePresentation(entry.presentation);
        const selected = entry.kind === "node" && isSelected(entry.item?.id);
        const attributes = entry.kind === "node" ? `data-node="${escapeHtml(entry.node.id)}"` : `data-catalog-index="${entry.index}"`;
        const name = entry.kind === "node" ? (entry.item?.name ?? entry.presentation.displayName) : (entry.presentation.modelLabel ?? entry.presentation.displayName);
        return `<button type="button" class="library-node ${selected ? "selected" : ""}" ${attributes}>
          <i class="node-type ${type.color}">${icon(type.key)}</i><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(entry.presentation.displayName)}</small></span>${icon(entry.kind === "node" ? "chevron" : "plus", 14)}
        </button>`;
      }).join("");
  }

  function catalogCategory(presentation) {
    const category = presentation.category ?? presentation.role;
    return Object.entries(categoryRoles).find(([, roles]) => roles.has(category))?.[0];
  }

  function normalizedAssetPath(value) {
    return String(value).replaceAll("\\", "/").replace(/^\.\//u, "");
  }

  function mediaForGraphNode(node) {
    const input = node?.inputs.asset;
    if (!input || !("value" in input) || !input.value || typeof input.value !== "object"
      || typeof input.value.path !== "string") return undefined;
    const asset = normalizedAssetPath(input.value.path);
    return state.snapshot.mediaLibrary.assets.find(media => normalizedAssetPath(media.asset) === asset);
  }

  function mediaNodePreview(media, role) {
    if (media?.error !== undefined || media?.resource === undefined) {
      return icon(rolePresentation[role]?.key ?? "asset", 30);
    }
    const source = escapeHtml(media.resource);
    if (media.kind === "image") return `<img src="${source}" alt="" loading="lazy" draggable="false">`;
    if (media.kind === "video") {
      return `<video class="media-preview-element" data-media-preview-element="video" src="${source}" muted playsinline preload="metadata"></video><button type="button" class="media-preview-control video" data-media-preview="video" aria-label="播放视频预览"><span class="media-preview-icon">${icon("play", 18)}</span></button>`;
    }
    return audioPreviewMarkup(source);
  }

  function mediaTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const value = Math.floor(seconds);
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  }

  function syncMediaPreview(element) {
    const control = element.parentElement?.querySelector(`[data-media-preview-state="${element.dataset.mediaPreviewElement}"]`)
      ?? element.parentElement?.querySelector(`[data-media-preview="${element.dataset.mediaPreviewElement}"]`);
    if (!control) return;
    const playing = !element.paused && !element.ended;
    control.classList.toggle("playing", playing);
    const action = control.matches("button") ? control : control.querySelector("[data-media-preview]");
    action?.setAttribute("aria-label", `${playing ? "暂停" : "播放"}${element instanceof HTMLVideoElement ? "视频" : "音频"}预览`);
    const iconTarget = control.querySelector(".media-preview-icon");
    if (iconTarget) iconTarget.innerHTML = icon(playing ? "pause" : "play", element instanceof HTMLVideoElement ? 18 : 16);
    if (element instanceof HTMLAudioElement) {
      const progress = Number.isFinite(element.duration) && element.duration > 0
        ? Math.max(0, Math.min(1, element.currentTime / element.duration)) : 0;
      control.style.setProperty("--media-preview-progress", `${progress * 100}%`);
      const time = control.querySelector("time");
      if (time) time.textContent = playing || element.currentTime > 0
        ? `${mediaTime(element.currentTime)} / ${mediaTime(element.duration)}`
        : mediaTime(element.duration);
    }
  }

  function bindMediaPreviews() {
    for (const element of app.querySelectorAll("[data-media-preview-element]")) {
      for (const event of ["loadedmetadata", "durationchange", "timeupdate", "play", "pause", "ended"]) {
        element.addEventListener(event, () => syncMediaPreview(element));
      }
      syncMediaPreview(element);
    }
    for (const media of app.querySelectorAll(".node-media-surface > img, .node-media-surface > video")) {
      const settle = () => {
        const node = media.closest("[data-item]");
        const item = node === null ? undefined : sceneItem(node.dataset.item);
        if (item === undefined || workspaceNode(item.node)?.width !== undefined) return;
        const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
        const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
        if (width <= 0 || height <= 0) return;
        const key = node.dataset.mediaKey;
        const previous = state.intrinsicSizes.get(key);
        if (previous?.width === width && previous?.height === height) return;
        state.intrinsicSizes.set(key, { width, height });
        const geometry = nodeGeometry(item);
        node.style.width = `${geometry.width}px`;
        node.style.setProperty("--node-media-height", `${geometry.mediaHeight}px`);
        node.style.setProperty("--node-port-y", `${NODE_CAPTION_HEIGHT + geometry.mediaHeight / 2}px`);
        calculateWorld();
        applyCamera();
        renderEdges();
        renderMinimap();
        scheduleNodeEditorPosition();
      };
      media.addEventListener(media instanceof HTMLVideoElement ? "loadedmetadata" : "load", settle, { once: true });
      if ((media instanceof HTMLVideoElement && media.readyState >= 1)
        || (media instanceof HTMLImageElement && media.complete)) settle();
    }
  }

  function toggleMediaPreview(control) {
    const node = control.closest("[data-item]");
    const element = node?.querySelector(`[data-media-preview-element="${control.dataset.mediaPreview}"]`);
    if (!element) return;
    for (const other of app.querySelectorAll("[data-media-preview-element]")) {
      if (other !== element && !other.paused) other.pause();
    }
    if (element.paused || element.ended) {
      if (element.ended) element.currentTime = 0;
      void element.play().catch(error => notify(error instanceof Error ? error.message : String(error), true));
    } else element.pause();
  }

  function graphNodeForMedia(media) {
    const asset = normalizedAssetPath(media.asset);
    return state.snapshot.graph.nodes.find(node => {
      const input = node.inputs.asset;
      return input && "value" in input && input.value && typeof input.value === "object"
        && typeof input.value.path === "string" && normalizedAssetPath(input.value.path) === asset;
    });
  }

  function choiceControlMarkup({ node, key, label, value, options, action, input, inputKind }) {
    const open = state.choiceMenu?.node === node && state.choiceMenu?.key === key;
    const current = options.find(option => Object.is(option.value, value));
    const display = current?.label ?? (value === undefined ? "未设置" : String(value));
    return `<span class="generation-choice ${open ? "open" : ""}">
      <button type="button" class="generation-parameter-trigger ${open ? "active" : ""}" data-choice-trigger="${escapeHtml(key)}" data-choice-node="${escapeHtml(node)}" aria-label="${escapeHtml(label)}：${escapeHtml(display)}" aria-expanded="${open}"><span class="generation-parameter-value">${escapeHtml(display)}</span>${icon("chevronDown", 12)}</button>
      <span class="generation-choice-menu" data-choice-menu ${open ? "" : "hidden"}><em>${escapeHtml(label)}</em>${options.map(option => {
        const selected = Object.is(option.value, value);
        return `<button type="button" class="${selected ? "selected" : ""}" data-choice-option data-choice-action="${escapeHtml(action)}" data-choice-node="${escapeHtml(node)}" data-choice-value="${escapeHtml(option.value)}"${input === undefined ? "" : ` data-choice-input="${escapeHtml(input)}"`}${inputKind === undefined ? "" : ` data-choice-input-kind="${escapeHtml(inputKind)}"`}><span>${escapeHtml(option.label)}</span>${selected ? icon("check", 12) : ""}</button>`;
      }).join("")}</span>
    </span>`;
  }

  function compactControlMarkup(nodeId, parameter) {
    const { control, label, value } = parameter;
    if (control.value.kind === "enum") {
      const kind = typeof control.value.values[0] === "number" ? "number" : "string";
      const options = [
        ...(control.required ? [] : [{ value: "", label: "未设置" }]),
        ...control.value.values.map(option => ({ value: String(option), label: String(option) })),
      ];
      return choiceControlMarkup({ node: nodeId, key: `input:${control.input}`, label,
        value: value === undefined ? "" : String(value), options, action: "input",
        input: control.input, inputKind: kind });
    }
    if (control.value.kind === "boolean") {
      return choiceControlMarkup({ node: nodeId, key: `input:${control.input}`, label,
        value: value === undefined ? "" : String(value), action: "input", input: control.input,
        inputKind: "boolean", options: [
          ...(control.required ? [] : [{ value: "", label: "未设置" }]),
          { value: "true", label: "开启" }, { value: "false", label: "关闭" },
        ] });
    }
    if (control.value.kind === "number" && control.value.integer
      && control.value.minimum !== undefined && control.value.maximum !== undefined
      && control.value.maximum - control.value.minimum <= 20) {
      const values = Array.from({ length: control.value.maximum - control.value.minimum + 1 },
        (_, index) => control.value.minimum + index);
      return choiceControlMarkup({ node: nodeId, key: `input:${control.input}`, label,
        value: value === undefined ? "" : String(value), action: "input", input: control.input,
        inputKind: "number", options: [
          ...(control.required ? [] : [{ value: "", label: "未设置" }]),
          ...values.map(option => ({ value: String(option), label: String(option) })),
        ] });
    }
    return `<label class="generation-inline-field" title="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><input data-graph-input="${escapeHtml(control.input)}" data-input-node="${escapeHtml(nodeId)}" data-input-kind="${control.value.kind === "number" ? "number" : "string"}"${control.required ? "" : ' data-input-optional="true"'} ${control.value.kind === "number" ? `type="number" ${control.value.integer ? 'step="1"' : 'step="any"'}${control.value.minimum === undefined ? "" : ` min="${control.value.minimum}"`}${control.value.maximum === undefined ? "" : ` max="${control.value.maximum}"`}` : 'type="text"'} value="${value === undefined ? "" : escapeHtml(value)}"></label>`;
  }

  function nodeMarkup(item) {
    const geometry = nodeGeometry(item);
    const node = graphNode(item.node);
    if (!node) {
      return `<article class="canvas-node missing ${isSelected(item.id) ? "selected" : ""}" data-item="${escapeHtml(item.id)}" style="left:${item.x - state.worldLeft}px;top:${item.y - state.worldTop}px;width:${geometry.width}px;--node-media-height:${geometry.mediaHeight}px;--node-port-y:${NODE_CAPTION_HEIGHT + geometry.mediaHeight / 2}px"><header><strong>缺失节点</strong></header><p>${escapeHtml(item.node)}</p></article>`;
    }
    const presentation = item.presentation;
    const type = typePresentation(presentation);
    const inputs = Object.entries(node.inputs);
    const linkedInputs = inputs.filter(([, input]) => "node" in input);
    const acceptsInput = activeAuthoringPorts(presentation, node).length > 0;
    const providesOutput = presentation.editor?.output.connectable === true;
    const labels = new Map((presentation.editor?.labels.controls ?? []).map(item => [item.id, item]));
    const compactControls = (presentation.editor?.controls ?? []).filter(control => labels.get(control.id)?.placement === "compact");
    const parameters = compactControls.map(control => {
      const input = node.inputs[control.input];
      return {
        control,
        label: labels.get(control.id)?.label ?? control.id,
        value: input && "value" in input ? input.value : control.default,
      };
    });
    const report = nodeReport(item.node);
    const media = presentation.category === "asset" ? mediaForGraphNode(node) : undefined;
    const displayed = displayedObservation(item);
    const latest = item.outputs.at(-1);
    const previewIsSelected = displayed !== undefined && item.selected?.build === displayed.build
      && item.selected?.output === displayed.output;
    const showingResults = state.resultTabs.has(item.id);
    const issue = generationIssue(item.id);
    const environmentActionable = issue !== undefined
      && state.snapshot.environment?.status === "action-required";
    const generating = state.generating.has(item.id);
    const currentModel = modelLabel(node, presentation);
    const usingKey = JSON.stringify(node.using);
    const modelAlternatives = presentation.modelGroup === undefined ? [] : state.snapshot.catalog.filter(candidate =>
      candidate.modelGroup === presentation.modelGroup);
    const modelControl = modelAlternatives.length > 1
      ? choiceControlMarkup({ node: item.id, key: "model", label: "模型", value: usingKey,
          action: "model", options: modelAlternatives.map(candidate => ({
            value: JSON.stringify(candidate.using), label: candidate.modelLabel ?? candidate.displayName,
          })) })
      : "";
    const variant = presentation.editor?.variant;
    const variantInput = variant === undefined ? undefined : node.inputs[variant.input];
    const variantValue = variantInput && "value" in variantInput && typeof variantInput.value === "string"
      ? variantInput.value : variant?.default;
    const variantLabels = new Map((presentation.editor?.labels.variants ?? []).map(item => [item.value, item.label]));
    const variantControl = variant === undefined ? "" : choiceControlMarkup({
      node: item.id, key: "variant", label: "生成模式", value: variantValue, action: "variant",
      input: variant.input, inputKind: "string", options: variant.variants.map(choice => ({
        value: choice.value, label: variantLabels.get(choice.value) ?? choice.value,
      })),
    });
    const parameterControls = parameters.map(parameter => compactControlMarkup(item.id, parameter)).join("");
    const latestState = latest === undefined || latest.state === "ready" ? "" : `<span class="node-output-state state-${escapeHtml(latest.state)}" title="${escapeHtml(latest.message ?? resultStateLabel(latest))}">${escapeHtml(resultStateLabel(latest))}</span>`;
    const nodePreview = displayed === undefined
      ? mediaNodePreview(media, presentation.role)
      : resultMedia(displayed, presentation.role);
    const editorMarkup = presentation.category === "asset" ? "" : `<section class="node-editor generation-composer" aria-label="${escapeHtml(presentation.displayName)} 编辑器">
        <div class="generation-composer-scroll">${showingResults ? resultHistoryMarkup(item) : `<div class="generation-compose-form">
        ${linkedInputs.length === 0 ? "" : `<div class="generation-reference-groups"><div class="node-editor-references generation-reference-strip">${linkedInputs.map(([key, input], index) => {
          const upstream = sceneItem(input.node);
          const upstreamType = typePresentation(nodeType(input.node));
          const selected = upstream?.selectedObservation?.state === "ready";
          return `<div class="generation-reference-card"><button type="button" class="generation-reference-tile" data-focus-node="${escapeHtml(input.node)}" title="${escapeHtml(upstream?.name ?? input.node)} · ${escapeHtml(key)}">${selected ? `<span class="reference-thumbnail reference-thumbnail-fallback">${icon(upstreamType.key, 18)}</span>` : icon("plus", 18)}</button><button type="button" class="generation-reference-name" data-focus-node="${escapeHtml(input.node)}" title="${escapeHtml(upstream?.name ?? input.node)}">${escapeHtml(selected ? (upstream?.name ?? input.node) : key)}</button><span class="generation-reference-order" aria-hidden="true">${index + 1}</span></div>`;
        }).join("")}</div></div>`}
        <div class="generation-prompt primary">${inlineSummaryEditor(node, presentation)}</div>
        </div>`}</div>
        ${showingResults ? "" : `<footer><div class="generation-parameters">${modelControl}${variantControl}${parameterControls}</div><span class="generation-footer-spacer"></span><button type="button" class="generation-submit ${generating ? "working" : ""}" data-generate-node="${escapeHtml(item.id)}" ${environmentActionable ? "data-environment-required" : ""} title="${escapeHtml(issue ?? "生成当前节点")}" ${issue !== undefined && !environmentActionable || generating ? "disabled" : ""}>${icon("arrowUp", 17)}</button></footer>`}
      </section>`;
    const mediaRole = media?.kind ?? presentation.role;
    return `<article class="canvas-node graph-node media-${escapeHtml(mediaRole)} type-${type.color} readiness-${report.readiness} ${isSelected(item.id) ? "selected" : ""}" data-item="${escapeHtml(item.id)}" data-media-key="${escapeHtml(nodeMediaKey(item, media))}" style="left:${item.x - state.worldLeft}px;top:${item.y - state.worldTop}px;width:${geometry.width}px;--node-media-height:${geometry.mediaHeight}px;--node-port-y:${NODE_CAPTION_HEIGHT + geometry.mediaHeight / 2}px">
      <header class="node-caption" title="${escapeHtml(presentation.displayName)}">${icon(type.key, 15)}<input data-node-name="${escapeHtml(item.id)}" value="${escapeHtml(item.name)}" maxlength="160" aria-label="${escapeHtml(item.name)} 节点名称"></header>
      <div class="node-media-frame"><div class="node-media-surface">${nodePreview}${displayed !== undefined && !previewIsSelected ? '<span class="node-preview-state">未选用</span>' : ""}${latestState}</div>${item.outputs.length === 0 ? "" : `<button type="button" class="node-result-toggle" data-history-node="${escapeHtml(item.id)}" title="${showingResults ? "隐藏结果" : `查看 ${item.outputs.length} 个结果`}" aria-label="${showingResults ? "隐藏结果" : `查看 ${item.outputs.length} 个结果`}" aria-expanded="${showingResults}"><span>${item.outputs.length}</span>${icon("chevronDown", 11)}</button>`}</div>
      ${editorMarkup}
      ${acceptsInput ? '<i class="port input-port"><span class="port-hitbox" data-port-side="input" aria-label="连接上游"></span></i>' : ""}
      ${providesOutput ? '<i class="port output-port"><span class="port-hitbox" data-port-side="output" aria-label="连接下游"></span></i>' : ""}
      <i class="node-resize-handle" data-resize-node="${escapeHtml(item.id)}" role="button" aria-label="调整节点尺寸" title="拖动等比调整；按住 Shift 自由调整；双击恢复自适应"></i>
    </article>`;
  }

  function importMarkup(item) {
    return `<article class="canvas-node import-ghost" style="left:${item.x - state.worldLeft}px;top:${item.y - state.worldTop}px">
      <header class="node-caption">${icon("upload", 15)}<span>${escapeHtml(item.name)}</span></header>
      <div class="node-media-frame"><div class="node-media-surface">${icon("upload", 28)}<span>正在导入素材</span></div></div>
    </article>`;
  }

  function portCenter(itemId, selector) {
    const node = [...app.querySelectorAll("[data-item]")].find(element => element.dataset.item === itemId);
    const port = node?.querySelector(selector);
    if (!node || !port) return undefined;
    let x = port.offsetWidth / 2;
    let y = port.offsetHeight / 2;
    let current = port;
    while (current && current !== node) {
      x += current.offsetLeft;
      y += current.offsetTop;
      current = current.offsetParent;
    }
    return { x: node.offsetLeft + x, y: node.offsetTop + y };
  }

  function edgePath(edge, lane = 0) {
    const from = sceneItem(edge.from);
    const to = sceneItem(edge.to);
    if (!from || !to) return "";
    const fromGeometry = nodeGeometry(from);
    const toGeometry = nodeGeometry(to);
    const source = portCenter(edge.from, ".output-port") ?? { x: from.x - state.worldLeft + fromGeometry.width, y: from.y - state.worldTop + NODE_CAPTION_HEIGHT + fromGeometry.mediaHeight / 2 };
    const target = portCenter(edge.to, ".input-port") ?? { x: to.x - state.worldLeft, y: to.y - state.worldTop + NODE_CAPTION_HEIGHT + toGeometry.mediaHeight / 2 };
    const startX = source.x;
    const startY = source.y;
    const endX = target.x;
    const endY = target.y;
    const distance = Math.max(80, Math.abs(endX - startX) * .45);
    return `M ${startX} ${startY} C ${startX + distance} ${startY + lane}, ${endX - distance} ${endY + lane}, ${endX} ${endY}`;
  }

  function edgeIdentity(edge) {
    return `${edge.from}\u0000${edge.to}\u0000${edge.input}`;
  }

  function edgeIsSelected(edge) {
    return state.selectedEdges.has(edgeIdentity(edge));
  }

  function renderEdges() {
    const edges = app.querySelector("#edges");
    edges.setAttribute("viewBox", `0 0 ${state.worldWidth} ${state.worldHeight}`);
    const visible = visibleMediaEdges();
    const visibleIds = new Set(visible.map(edgeIdentity));
    state.selectedEdges = new Set([...state.selectedEdges].filter(id => visibleIds.has(id)));
    const groups = new Map();
    for (const edge of visible) {
      const key = `${edge.from}\u0000${edge.to}`;
      const group = groups.get(key) ?? [];
      group.push(edge);
      groups.set(key, group);
    }
    for (const group of groups.values()) group.sort((left, right) => left.input.localeCompare(right.input));
    edges.innerHTML = visible.map(edge => {
      const group = groups.get(`${edge.from}\u0000${edge.to}`);
      const lane = (group.indexOf(edge) - (group.length - 1) / 2) * 18;
      const path = edgePath(edge, lane);
      const selected = edgeIsSelected(edge);
      return `<g class="edge ${edge.kind} ${selected ? "selected" : ""}" data-edge-from="${escapeHtml(edge.from)}" data-edge-to="${escapeHtml(edge.to)}" data-edge-input="${escapeHtml(edge.input)}"><title>${escapeHtml(edge.input)}</title><path class="edge-line" d="${path}"/><path class="edge-pulse edge-pulse-haze" pathLength="100" d="${path}"/><path class="edge-pulse edge-pulse-tail" pathLength="100" d="${path}"/><path class="edge-pulse edge-pulse-tail-strong" pathLength="100" d="${path}"/><path class="edge-pulse edge-pulse-body" pathLength="100" d="${path}"/><path class="edge-pulse edge-pulse-body-strong" pathLength="100" d="${path}"/><path class="edge-pulse edge-pulse-core" pathLength="100" d="${path}"/><path class="edge-pulse edge-pulse-head" pathLength="100" d="${path}"/><path class="edge-hit" d="${path}"/></g>`;
    }).join("");
    renderConnectionPreview();
  }

  function dependsOn(nodeId, dependencyId, visited = new Set()) {
    if (nodeId === dependencyId) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    const node = graphNode(nodeId);
    return node !== undefined && Object.values(node.inputs).some(input =>
      "node" in input && dependsOn(input.node, dependencyId, visited));
  }

  function connectionOptions(anchorId, side, otherId) {
    const sourceId = side === "output" ? anchorId : otherId;
    const targetId = side === "output" ? otherId : anchorId;
    if (sourceId === targetId || dependsOn(sourceId, targetId) || nodesAlreadyConnected(sourceId, targetId)) return [];
    const source = nodeType(sourceId);
    const target = nodeType(targetId);
    const sourceRoles = outputMediaRoles(source);
    if (sourceRoles.length === 0) return [];
    const targetNode = graphNode(targetId);
    const targetPorts = targetNode === undefined ? [] : activeAuthoringPorts(target, targetNode);
    const declared = targetNode === undefined ? [] : [
      ...compatibleAuthoringConnections(targetNode, targetPorts, sourceRoles),
      ...replaceableAuthoringConnections(targetNode, targetPorts, sourceRoles),
    ].filter(option => !(option.replacement
      && targetNode.inputs[option.port.input]?.node === sourceId));
    if (declared.length > 0) return declared.map(option => ({
      kind: "connect", sourceId, targetId, ...option,
      input: { label: connectionOptionLabel(target, option) },
    }));
    return [];
  }

  function catalogConnectionOptions(anchorId, side) {
    const anchor = nodeType(anchorId);
    return state.snapshot.catalog.flatMap(presentation => {
      const candidateNode = { inputs: initialAuthoringInputs(presentation) };
      if (side === "output") {
        const sourceRoles = outputMediaRoles(anchor);
        const option = automaticAuthoringConnection(presentation.editor, candidateNode, sourceRoles);
        return option === undefined ? [] : [{ kind: "create", anchorId, side, presentation, ...option,
          input: { label: connectionOptionLabel(presentation, option) } }];
      }
      const targetNode = graphNode(anchorId);
      if (targetNode === undefined) return [];
      const targetPorts = targetNode === undefined ? [] : activeAuthoringPorts(anchor, targetNode);
      const sourceRoles = outputMediaRoles(presentation);
      return [
        ...compatibleAuthoringConnections(targetNode, targetPorts, sourceRoles),
        ...replaceableAuthoringConnections(targetNode, targetPorts, sourceRoles),
      ]
        .map(option => ({ kind: "create", anchorId, side, presentation, ...option,
          input: { label: connectionOptionLabel(anchor, option) } }));
    });
  }

  function outputMediaRoles(presentation) {
    return presentation.editor?.output.connectable === true ? (presentation.editor.output.media ?? []) : [];
  }

  function nodesAlreadyConnected(sourceId, targetId) {
    const target = graphNode(targetId);
    return target !== undefined && Object.values(target.inputs).some(input =>
      "node" in input && input.node === sourceId);
  }

  function activeAuthoringPorts(presentation, node) {
    return declaredActiveAuthoringPorts(presentation.editor, node);
  }

  function authoringPortLabel(presentation, id) {
    return presentation.editor?.labels.ports?.find(item => item.id === id)?.label ?? id;
  }

  function connectionOptionLabel(presentation, option) {
    const roles = { image: "图片", video: "视频", audio: "音频" };
    const port = authoringPortLabel(presentation, option.port.id);
    return `${port} · ${roles[option.role] ?? option.role}${option.replacement ? "（替换）" : ""}`;
  }

  function automaticConnectionOption(sourceId, targetId) {
    if (sourceId === targetId || dependsOn(sourceId, targetId) || nodesAlreadyConnected(sourceId, targetId)) return undefined;
    const sourceRoles = outputMediaRoles(nodeType(sourceId));
    if (sourceRoles.length === 0) return undefined;
    const presentation = nodeType(targetId);
    const targetNode = graphNode(targetId);
    const editor = presentation.editor;
    if (!targetNode || !editor) return undefined;
    const option = automaticAuthoringConnection(editor, targetNode, sourceRoles);
    return option === undefined ? undefined : {
      kind: "connect", sourceId, targetId, ...option,
      input: { label: connectionOptionLabel(presentation, option) },
    };
  }

  function initialAuthoringInputs(presentation) {
    const editor = presentation.editor;
    if (!editor) return {};
    const inputs = {};
    if (editor.variant) inputs[editor.variant.input] = { value: editor.variant.default };
    const active = editor.variant?.variants.find(variant => variant.value === editor.variant.default)?.active;
    for (const control of editor.controls.filter(candidate => active === undefined || active.includes(candidate.id))) {
      if (control.default !== undefined) {
        inputs[control.input] = { value: structuredClone(control.default) };
      } else if (control.required && control.value.kind === "enum") {
        inputs[control.input] = { value: structuredClone(control.value.values[0]) };
      } else if (control.required && control.value.kind === "number") {
        inputs[control.input] = { value: control.value.minimum ?? 0 };
      } else if (control.required && control.value.kind === "boolean") {
        inputs[control.input] = { value: false };
      }
    }
    return inputs;
  }

  function nextAuthoringConnectionKey(node, port, entry) {
    if (port.kind === "slot") return port.input;
    const prefix = entry.prefix;
    const expression = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)$`, "u");
    const used = new Set(Object.keys(node.inputs).flatMap(name => {
      const matched = expression.exec(name);
      return matched === null ? [] : [Number(matched[1])];
    }));
    let index = 1;
    while (used.has(index)) index += 1;
    return `${prefix}.${index}`;
  }

  function connectionPath(start, end, side) {
    const source = side === "output" ? start : end;
    const target = side === "output" ? end : start;
    const distance = Math.max(80, Math.abs(target.x - source.x) * .45);
    return `M ${source.x} ${source.y} C ${source.x + distance} ${source.y}, ${target.x - distance} ${target.y}, ${target.x} ${target.y}`;
  }

  function clientToWorld(clientX, clientY) {
    const bounds = app.querySelector("#viewport").getBoundingClientRect();
    return {
      x: (clientX - bounds.left - state.camera.x) / state.zoom - state.worldLeft,
      y: (clientY - bounds.top - state.camera.y) / state.zoom - state.worldTop,
    };
  }

  function renderConnectionPreview() {
    const connection = state.connection;
    if (!connection) return;
    const anchor = portCenter(connection.anchorId, connection.side === "output" ? ".output-port" : ".input-port");
    if (!anchor) return;
    let end = connection.point;
    if (connection.otherId !== undefined) {
      const target = portCenter(connection.otherId, connection.side === "output" ? ".input-port" : ".output-port");
      if (target) end = target;
    }
    app.querySelector("#edges").insertAdjacentHTML("beforeend",
      `<path class="connection-preview" d="${connectionPath(anchor, end, connection.side)}"/>`);
  }

  function receivingElement(id) {
    return [...app.querySelectorAll("[data-item]")].find(element => element.dataset.item === id)
      ?.querySelector(".node-media-frame");
  }

  function trackReceiving(id, compatible = true) {
    if (state.receiving?.id !== id) clearReceiving();
    const surface = receivingElement(id);
    if (!surface) return;
    surface.classList.add("connection-receiving");
    surface.classList.toggle("connection-rejected", !compatible);
    state.receiving = { id, surface, compatible };
  }

  function clearReceiving(result) {
    const receiving = state.receiving;
    state.receiving = undefined;
    if (!receiving?.surface.isConnected) return;
    const surface = receiving.surface;
    surface.classList.remove("connection-receiving");
    surface.classList.remove("connection-rejected");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof surface.animate !== "function") return;
    const frames = result === "accept"
      ? [{ transform: "none" }, { offset: .3, transform: "translateY(5px) scale(.98)" }, { offset: .6, transform: "none" }, { transform: "none" }]
      : result === "reject"
        ? [{ transform: "none" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }]
        : [{ opacity: .98 }, { opacity: 1 }];
    surface.animate(frames, { duration: result === "reject" ? 280 : result === "accept" ? 260 : 120, easing: "cubic-bezier(.4,0,.2,1)" });
  }

  function closeConnectionMenu() {
    const menu = app.querySelector("#connection-menu");
    menu.hidden = true;
    menu.innerHTML = "";
    state.connectionMenuOptions = [];
    state.pendingConnection = undefined;
    renderEdges();
  }

  function closeNodeContextMenu() {
    app.querySelector("#node-context-menu").hidden = true;
  }

  function openNodeContextMenu(clientX, clientY) {
    const menu = app.querySelector("#node-context-menu");
    menu.hidden = false;
    const width = 220;
    const height = 112;
    menu.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, clientX))}px`;
    menu.style.top = `${Math.max(12, Math.min(innerHeight - height - 12, clientY))}px`;
  }

  function openConnectionMenu(anchorId, side, clientX, clientY, otherId) {
    const options = otherId === undefined
      ? catalogConnectionOptions(anchorId, side)
      : connectionOptions(anchorId, side, otherId);
    const menu = app.querySelector("#connection-menu");
    state.connectionMenuOptions = options;
    state.pendingConnection = {
      anchorId,
      side,
      point: clientToWorld(clientX, clientY),
      ...(otherId === undefined ? {} : { otherId }),
    };
    menu.innerHTML = options.length === 0
      ? '<p class="connection-menu-empty">没有可连接的节点</p>'
      : `<header>${otherId === undefined ? "添加节点" : side === "output" ? "连接到下游" : "连接上游"}</header>${options.map((option, index) => {
          const presentation = option.kind === "create"
            ? option.presentation
            : nodeType(side === "output" ? option.targetId : option.sourceId);
          const other = option.kind === "create"
            ? { name: presentation.modelLabel ?? presentation.displayName }
            : sceneItem(side === "output" ? option.targetId : option.sourceId);
          const otherType = typePresentation(presentation);
          return `<button type="button" data-connection-option="${index}">${icon(otherType.key, 16)}<span><strong>${escapeHtml(other.name)}</strong><small>${escapeHtml(option.input.label)}</small></span>${icon("chevron", 14)}</button>`;
        }).join("")}`;
    menu.hidden = false;
    const width = 244;
    const height = Math.min(320, 42 + Math.max(1, options.length) * 48);
    menu.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, clientX + 12))}px`;
    menu.style.top = `${Math.max(12, Math.min(innerHeight - height - 12, clientY - 18))}px`;
    renderEdges();
  }

  function renderSnapGuides(guides) {
    const target = app.querySelector("#snap-guides");
    const width = 1 / state.zoom;
    const dash = 2 / state.zoom;
    target.innerHTML = guides.map((guide, index) => guide.axis === "x"
      ? `<i data-guide="${index}" style="left:${guide.coordinate - state.worldLeft - width / 2}px;top:${guide.start - state.worldTop}px;width:${width}px;height:${guide.end - guide.start}px;background-size:${width}px ${dash * 2}px"></i>`
      : `<i data-guide="${index}" class="horizontal" style="left:${guide.start - state.worldLeft}px;top:${guide.coordinate - state.worldTop - width / 2}px;width:${guide.end - guide.start}px;height:${width}px;background-size:${dash * 2}px ${width}px"></i>`).join("");
  }

  function applyCamera() {
    const world = app.querySelector("#world");
    const viewport = app.querySelector("#viewport");
    world.style.width = `${state.worldWidth}px`;
    world.style.height = `${state.worldHeight}px`;
    world.style.transform = `translate(${state.camera.x + state.worldLeft * state.zoom}px, ${state.camera.y + state.worldTop * state.zoom}px) scale(${state.zoom})`;
    world.style.setProperty("--canvas-counter-scale", String(1 / state.zoom));
    world.style.setProperty("--canvas-zoom", String(state.zoom));
    world.style.setProperty("--canvas-stroke-world", String(1 / state.zoom));
    world.style.setProperty("--canvas-shadow-world", String(5 / state.zoom));
    viewport.style.setProperty("--grid-size", `${18 * state.zoom}px`);
    viewport.style.setProperty("--grid-x", `${state.camera.x}px`);
    viewport.style.setProperty("--grid-y", `${state.camera.y}px`);
    const gridVisibility = Math.max(0, Math.min(1, (state.zoom - .42) / .28));
    viewport.style.setProperty("--grid-alpha", String(.1 * gridVisibility));
    viewport.style.setProperty("--grid-dot", `${.46 + .12 * gridVisibility}px`);
    scheduleNodeEditorPosition();
  }

  function renderNodePanel() {
    const host = app.querySelector("#node-panel-host");
    const id = state.panelNode;
    const source = id === undefined ? undefined : [...app.querySelectorAll(".canvas-node")]
      .find(element => element.dataset.item === id)?.querySelector(".node-editor");
    if (!source) {
      host.hidden = true;
      host.innerHTML = "";
      delete host.dataset.node;
      return;
    }
    const refreshing = !host.hidden && host.dataset.node === id;
    host.classList.toggle("stable", refreshing);
    host.innerHTML = source.outerHTML;
    host.dataset.node = id;
    host.hidden = false;
    positionNodePanel();
    if (!refreshing) setTimeout(() => {
      if (!host.hidden && host.dataset.node === id) host.classList.add("stable");
    }, 190);
  }

  function syncChoiceMenus() {
    for (const trigger of app.querySelectorAll("[data-choice-trigger]")) {
      const open = state.choiceMenu?.node === trigger.dataset.choiceNode
        && state.choiceMenu?.key === trigger.dataset.choiceTrigger;
      trigger.classList.toggle("active", open);
      trigger.setAttribute("aria-expanded", String(open));
      const wrapper = trigger.closest(".generation-choice");
      wrapper?.classList.toggle("open", open);
      const menu = wrapper?.querySelector("[data-choice-menu]");
      if (menu) menu.hidden = !open;
    }
  }

  function positionNodePanel() {
    const viewport = app.querySelector("#viewport");
    const host = app.querySelector("#node-panel-host");
    const id = state.panelNode;
    const element = id === undefined ? undefined : [...app.querySelectorAll(".canvas-node")]
      .find(candidate => candidate.dataset.item === id);
    const frame = element?.querySelector(".node-media-frame");
    if (!viewport || host.hidden || !frame) return;
    const viewportBounds = viewport.getBoundingClientRect();
    const areaBounds = app.querySelector(".canvas-area").getBoundingClientRect();
    const frameBounds = frame.getBoundingClientRect();
    const panelWidth = Math.max(340, Math.min(620, viewportBounds.width - 84, frameBounds.width * 2.5));
    const center = frameBounds.left + frameBounds.width / 2;
    const left = Math.min(Math.max(center - panelWidth / 2, viewportBounds.left + 72),
      viewportBounds.right - panelWidth - 12);
    const below = viewportBounds.bottom - frameBounds.bottom - 32;
    const above = frameBounds.top - viewportBounds.top - 32;
    const preferredHeight = Math.min(252, Math.max(140, host.scrollHeight));
    const showAbove = below < preferredHeight && above > below;
    host.dataset.position = showAbove ? "above" : "below";
    host.style.width = `${panelWidth}px`;
    host.style.maxHeight = `${Math.max(140, Math.min(420, showAbove ? above : below))}px`;
    host.style.left = `${left - areaBounds.left}px`;
    host.style.top = showAbove ? "auto" : `${frameBounds.bottom - areaBounds.top + 18}px`;
    host.style.bottom = showAbove ? `${areaBounds.bottom - frameBounds.top + 18}px` : "auto";
    host.style.setProperty("--node-panel-origin", `${center - left}px ${showAbove ? "100%" : "0%"}`);
  }

  function scheduleNodeEditorPosition() {
    if (state.nodeEditorFrame !== undefined) cancelAnimationFrame(state.nodeEditorFrame);
    state.nodeEditorFrame = requestAnimationFrame(() => {
      state.nodeEditorFrame = undefined;
      positionNodePanel();
    });
  }

  function closeNodePanel() {
    state.choiceMenu = undefined;
    state.panelNode = undefined;
    renderNodePanel();
  }

  function openNodePanelForElement(element) {
    const id = element?.dataset.item;
    if (id === undefined || !isSelected(id) || !element.querySelector(":scope > .node-editor")) {
      closeNodePanel();
      return;
    }
    if (state.panelNode !== id) state.choiceMenu = undefined;
    state.panelNode = id;
    renderNodePanel();
  }

  function minimapBounds() {
    const items = state.snapshot.scene.items;
    if (items.length === 0) return { left: -100, top: -100, width: 200, height: 200 };
    const left = Math.min(...items.map(item => item.x)) - 120;
    const top = Math.min(...items.map(item => item.y)) - 120;
    const right = Math.max(...items.map(item => item.x + nodeGeometry(item).width)) + 120;
    const bottom = Math.max(...items.map(item => item.y + nodeGeometry(item).height)) + 120;
    return { left, top, width: Math.max(400, right - left), height: Math.max(280, bottom - top) };
  }

  function renderMinimap() {
    const minimap = app.querySelector("#minimap");
    minimap.classList.toggle("visible", state.minimapOpen);
    minimap.setAttribute("aria-hidden", String(!state.minimapOpen));
    if (!state.minimapOpen) return;
    const viewport = app.querySelector("#viewport");
    const visible = {
      x: -state.camera.x / state.zoom,
      y: -state.camera.y / state.zoom,
      width: viewport.clientWidth / state.zoom,
      height: viewport.clientHeight / state.zoom,
    };
    const content = minimapBounds();
    const left = Math.min(content.left, visible.x) - 40;
    const top = Math.min(content.top, visible.y) - 40;
    const right = Math.max(content.left + content.width, visible.x + visible.width) + 40;
    const bottom = Math.max(content.top + content.height, visible.y + visible.height) + 40;
    const bounds = { left, top, width: right - left, height: bottom - top };
    const minimapAspect = 160 / 112;
    if (bounds.width / bounds.height > minimapAspect) {
      const height = bounds.width / minimapAspect;
      bounds.top -= (height - bounds.height) / 2;
      bounds.height = height;
    } else {
      const width = bounds.height * minimapAspect;
      bounds.left -= (width - bounds.width) / 2;
      bounds.width = width;
    }
    state.minimapBounds = bounds;
    const svg = minimap.querySelector("svg");
    svg.setAttribute("viewBox", `${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = `${state.snapshot.scene.items.map(item => { const positioned = sceneItem(item.id) ?? item; const geometry = nodeGeometry(positioned); return `<rect class="minimap-node ${isSelected(item.id) ? "selected" : ""}" x="${positioned.x}" y="${positioned.y}" width="${geometry.width}" height="${geometry.height}" rx="5"/>`; }).join("")}<rect class="minimap-viewport" x="${visible.x}" y="${visible.y}" width="${visible.width}" height="${visible.height}"/>`;
  }

  function renderWorld() {
    calculateWorld();
    applyCamera();
    app.querySelector("#nodes").innerHTML = state.snapshot.scene.items.map(nodeMarkup).join("")
      + state.imports.map(importMarkup).join("");
    bindMediaPreviews();
    renderNodePanel();
    renderEdges();
    renderSnapGuides([]);
    renderMinimap();
  }

  function render() {
    renderChrome();
    renderLibrary();
    renderWorld();
  }

  function setSelection(ids, primary = ids.at(-1), edgeIds = []) {
    const available = new Set(state.snapshot.scene.items.map(item => item.id));
    state.selected = new Set(ids.filter(id => available.has(id)));
    const availableEdges = new Set(visibleMediaEdges().map(edgeIdentity));
    state.selectedEdges = new Set([...edgeIds].filter(id => availableEdges.has(id)));
    state.selection = primary !== undefined && state.selected.has(primary)
      ? primary
      : [...state.selected].at(-1);
  }

  // A pointer gesture is committed on pointerup. Browsers may synthesize a click
  // immediately afterwards; consume only that click, then expire the guard so a
  // missing synthetic click cannot swallow the user's next real interaction.
  function suppressGestureClick() {
    state.suppressClick = true;
    if (state.suppressClickTimer !== undefined) clearTimeout(state.suppressClickTimer);
    state.suppressClickTimer = setTimeout(() => {
      state.suppressClick = false;
      state.suppressClickTimer = undefined;
    }, 0);
  }

  function consumeSuppressedClick() {
    if (!state.suppressClick) return false;
    state.suppressClick = false;
    if (state.suppressClickTimer !== undefined) clearTimeout(state.suppressClickTimer);
    state.suppressClickTimer = undefined;
    return true;
  }

  function syncSelectionClasses(selectedIds = state.selected, selectedEdges = state.selectedEdges) {
    const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
    const edgeIds = selectedEdges instanceof Set ? selectedEdges : new Set(selectedEdges);
    for (const node of app.querySelectorAll(".canvas-node[data-item]")) {
      node.classList.toggle("selected", ids.has(node.dataset.item));
    }
    for (const edge of app.querySelectorAll(".edge")) {
      const candidate = {
        kind: "recipe",
        from: edge.dataset.edgeFrom,
        to: edge.dataset.edgeTo,
        input: edge.dataset.edgeInput,
      };
      edge.classList.remove("active");
      edge.classList.toggle("selected", edgeIds.has(edgeIdentity(candidate)));
    }
  }

  function renderSelection() {
    syncSelectionClasses();
    renderChrome();
    renderLibrary();
    renderMinimap();
  }

  function select(id, options = {}) {
    if (id === undefined) setSelection([]);
    else if (options.toggle) {
      const next = new Set(state.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelection([...next], next.has(id) ? id : undefined, state.selectedEdges);
    } else if (options.additive) {
      setSelection([...state.selected, id], id, state.selectedEdges);
    } else setSelection([id], id);
    renderSelection();
  }

  function selectEdge(edge, options = {}) {
    const id = edgeIdentity(edge);
    if (options.toggle) {
      const next = new Set(state.selectedEdges);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelection([...state.selected], state.selection, next);
    } else setSelection([], undefined, [id]);
    renderSelection();
  }

  function focusItem(id) {
    const item = sceneItem(id);
    if (!item) return;
    select(id);
    const viewport = app.querySelector("#viewport");
    const geometry = nodeGeometry(item);
    state.camera.x = viewport.clientWidth / 2 - (item.x + geometry.width / 2) * state.zoom;
    state.camera.y = viewport.clientHeight / 2 - (item.y + geometry.height / 2) * state.zoom;
    applyCamera();
    renderMinimap();
    scheduleViewportSave();
  }

  function setZoom(value, anchorX, anchorY) {
    const viewport = app.querySelector("#viewport");
    const old = state.zoom;
    const screenX = anchorX ?? viewport.clientWidth / 2;
    const screenY = anchorY ?? viewport.clientHeight / 2;
    const graphX = (screenX - state.camera.x) / old;
    const graphY = (screenY - state.camera.y) / old;
    state.zoom = Math.max(.25, Math.min(2, Math.round(value * 100) / 100));
    state.camera.x = screenX - graphX * state.zoom;
    state.camera.y = screenY - graphY * state.zoom;
    applyCamera();
    renderMinimap();
    scheduleViewportSave();
  }

  function viewportState() {
    const viewport = app.querySelector("#viewport");
    return {
      centerX: (viewport.clientWidth / 2 - state.camera.x) / state.zoom,
      centerY: (viewport.clientHeight / 2 - state.camera.y) / state.zoom,
      left: -state.camera.x / state.zoom,
      right: (viewport.clientWidth - state.camera.x) / state.zoom,
      top: -state.camera.y / state.zoom,
      bottom: (viewport.clientHeight - state.camera.y) / state.zoom,
      zoom: state.zoom,
    };
  }

  function openPositionNear(x, y) {
    return findOpenCanvasPosition(
      { x, y, width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT },
      state.snapshot.scene.items.map(item => {
        const positioned = sceneItem(item.id) ?? item;
        const geometry = nodeGeometry(positioned);
        return { id: item.id, x: positioned.x, y: positioned.y, width: geometry.width, height: geometry.height };
      }),
      viewportState(),
    );
  }

  function restoreViewport() {
    const viewport = app.querySelector("#viewport");
    const saved = state.snapshot.workspace.viewport;
    state.zoom = saved.zoom;
    state.camera.x = viewport.clientWidth / 2 - saved.centerX * saved.zoom;
    state.camera.y = viewport.clientHeight / 2 - saved.centerY * saved.zoom;
    applyCamera();
    renderMinimap();
  }

  function scheduleViewportSave() {
    clearTimeout(state.viewportSaveTimer);
    state.viewportSaveTimer = setTimeout(() => void saveViewport(), 420);
  }

  async function saveViewport() {
    if (state.busy) { scheduleViewportSave(); return; }
    const next = viewportState();
    const saved = state.snapshot.workspace.viewport;
    if (Math.abs(next.centerX - saved.centerX) < .05
      && Math.abs(next.centerY - saved.centerY) < .05
      && Math.abs(next.zoom - saved.zoom) < .001) return;
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/transaction", {
        transaction: {
          revision: state.snapshot.workspace.revision,
          commands: [{ kind: "viewport.set", ...next }],
        },
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
    }
  }

  async function moveItems(positions) {
    if (state.busy || positions.length === 0) return;
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/transaction", {
        transaction: {
          revision: state.snapshot.workspace.revision,
          commands: positions.map(position => ({ kind: "node.move", node: position.id,
            x: Math.round(position.x), y: Math.round(position.y) })),
        },
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function moveItem(id, x, y) {
    await moveItems([{ id, x, y }]);
  }

  async function resizeItem(id, size) {
    if (state.busy) return;
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/transaction", {
        transaction: {
          revision: state.snapshot.workspace.revision,
          commands: [{ kind: "node.resize", node: id, ...(size ?? {}) }],
        },
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  const canvasClipboardFormat = "hypit.generation-canvas-clipboard@1";

  function canvasClipboard(ids = [...state.selected]) {
    const selected = new Set(ids);
    const nodes = state.snapshot.workspace.nodes.flatMap(item => {
      if (!selected.has(item.node)) return [];
      const node = graphNode(item.node);
      return node === undefined ? [] : [{ graph: structuredClone(node), workspace: {
        name: item.name, x: item.x, y: item.y,
        ...(item.width === undefined ? {} : { width: item.width, height: item.height }),
      } }];
    });
    return nodes.length === 0 ? undefined : {
      format: canvasClipboardFormat,
      sourceGraph: state.snapshot.graph.id,
      sourceGraphFile: state.snapshot.graphFile,
      nodes,
    };
  }

  function parseCanvasClipboard(value) {
    if (typeof value !== "object" || value === null || value.format !== canvasClipboardFormat
      || typeof value.sourceGraph !== "string" || typeof value.sourceGraphFile !== "string" || !Array.isArray(value.nodes)
      || value.nodes.length === 0 || value.nodes.length > 200) return undefined;
    const valid = value.nodes.every(entry => entry && typeof entry === "object"
      && entry.graph && typeof entry.graph === "object" && typeof entry.graph.id === "string"
      && entry.graph.using && typeof entry.graph.using === "object"
      && entry.graph.inputs && typeof entry.graph.inputs === "object"
      && Object.values(entry.graph.inputs).every(input => typeof input === "object" && input !== null)
      && entry.workspace && typeof entry.workspace === "object"
      && typeof entry.workspace.name === "string"
      && Number.isFinite(entry.workspace.x) && Number.isFinite(entry.workspace.y)
      && ((entry.workspace.width === undefined && entry.workspace.height === undefined)
        || (Number.isFinite(entry.workspace.width) && Number.isFinite(entry.workspace.height))));
    const ids = valid ? value.nodes.map(entry => entry.graph.id) : [];
    return valid && new Set(ids).size === ids.length ? value : undefined;
  }

  async function copySelectedNodes() {
    const payload = canvasClipboard();
    if (payload === undefined) { notify("先选择要复制的节点"); return; }
    state.clipboard = payload;
    try { await navigator.clipboard.writeText(JSON.stringify(payload)); } catch { /* In-memory fallback. */ }
    notify(`已复制 ${payload.nodes.length} 个节点`);
  }

  function uniquePastedId(source, reserved) {
    const stem = `${source}_copy`;
    let candidate = stem;
    let suffix = 2;
    while (graphNode(candidate) !== undefined || reserved.has(candidate)) {
      candidate = `${stem}_${suffix}`;
      suffix += 1;
    }
    reserved.add(candidate);
    return candidate;
  }

  async function pasteCanvasClipboard(payload, options = {}) {
    const clipboard = parseCanvasClipboard(payload);
    if (clipboard === undefined || state.busy) {
      if (clipboard === undefined) notify("剪贴板里没有可用的画布节点", true);
      return;
    }
    const reserved = new Set();
    const ids = new Map(clipboard.nodes.map(entry => [entry.graph.id, uniquePastedId(entry.graph.id, reserved)]));
    const sameGraph = clipboard.sourceGraph === state.snapshot.graph.id
      && clipboard.sourceGraphFile === state.snapshot.graphFile;
    const containsPortableFileReference = clipboard.nodes.some(entry => Object.values(entry.graph.inputs)
      .some(input => "value" in input && typeof input.value === "object" && input.value !== null
        && "path" in input.value && typeof input.value.path === "string"));
    if (!sameGraph && containsPortableFileReference) {
      notify("包含工程文件引用的节点不能直接跨画布粘贴，请先通过项目素材导入", true);
      return;
    }
    const minX = Math.min(...clipboard.nodes.map(entry => entry.workspace.x));
    const minY = Math.min(...clipboard.nodes.map(entry => entry.workspace.y));
    const maxX = Math.max(...clipboard.nodes.map(entry => entry.workspace.x
      + (entry.workspace.width ?? DEFAULT_NODE_WIDTH)));
    const maxY = Math.max(...clipboard.nodes.map(entry => entry.workspace.y + NODE_CAPTION_HEIGHT
      + (entry.workspace.height ?? DEFAULT_MEDIA_HEIGHT)));
    const viewport = viewportState();
    const stagger = options.duplicate ? 32 : 24 * ((state.pasteCount % 6) + 1);
    const deltaX = options.duplicate ? 32 : viewport.centerX - (maxX - minX) / 2 - minX + stagger;
    const deltaY = options.duplicate ? 32 : viewport.centerY - (maxY - minY) / 2 - minY + stagger;
    const graphCommands = clipboard.nodes.map(entry => {
      const inputs = Object.fromEntries(Object.entries(entry.graph.inputs).flatMap(([name, input]) => {
        if (!("node" in input)) return [[name, structuredClone(input)]];
        const mapped = ids.get(input.node);
        if (mapped !== undefined) return [[name, { ...structuredClone(input), node: mapped }]];
        return sameGraph && graphNode(input.node) !== undefined ? [[name, structuredClone(input)]] : [];
      }));
      return { kind: "node.add", node: { ...structuredClone(entry.graph), id: ids.get(entry.graph.id), inputs } };
    });
    const workspaceCommands = clipboard.nodes.map(entry => ({ kind: "node.add", node: {
      node: ids.get(entry.graph.id),
      name: options.duplicate ? `${entry.workspace.name} 副本` : entry.workspace.name,
      x: Math.round(entry.workspace.x + deltaX),
      y: Math.round(entry.workspace.y + deltaY),
      ...(entry.workspace.width === undefined ? {} : {
        width: entry.workspace.width,
        height: entry.workspace.height,
      }),
    } }));
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/edit", {
        graph: { revision: state.snapshot.graph.revision, commands: graphCommands },
        workspace: { revision: state.snapshot.workspace.revision, commands: workspaceCommands },
      });
      const pasted = [...ids.values()];
      setSelection(pasted, pasted.at(-1));
      state.pasteCount += 1;
      notify(`${options.duplicate ? "已创建" : "已粘贴"} ${pasted.length} 个节点`);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function duplicateSelectedNodes() {
    const payload = canvasClipboard();
    if (payload === undefined) { notify("先选择要复制的节点"); return; }
    await pasteCanvasClipboard(payload, { duplicate: true });
  }

  async function deleteSelection() {
    if (state.busy || (state.selected.size === 0 && state.selectedEdges.size === 0)) return;
    const removing = new Set(state.selected);
    const removingEdges = new Set(state.selectedEdges);
    const graphIds = [...removing].filter(id => graphNode(id) !== undefined);
    const selectedEdges = visibleMediaEdges().filter(edge => removingEdges.has(edgeIdentity(edge)));
    const graphCommands = state.snapshot.graph.nodes.flatMap(node => {
      if (removing.has(node.id)) return [];
      const next = structuredClone(node);
      let changed = false;
      for (const [key, input] of Object.entries(next.inputs)) {
        if ("node" in input && removing.has(input.node)) {
          delete next.inputs[key];
          changed = true;
        }
      }
      for (const edge of selectedEdges.filter(candidate => candidate.to === node.id)) {
        for (const key of authoringBindingInputKeys(nodeType(node.id).editor, next, edge.input)) {
          if (key in next.inputs) {
            delete next.inputs[key];
            changed = true;
          }
        }
      }
      return changed ? [{ kind: "node.replace", node: next }] : [];
    });
    graphCommands.push(...graphIds.map(id => ({ kind: "node.remove", id })));
    const workspaceCommands = [...removing]
      .filter(id => state.snapshot.workspace.nodes.some(node => node.node === id))
      .map(node => ({ kind: "node.remove", node }));
    state.busy = true;
    try {
      state.snapshot = graphCommands.length === 0
        ? await request("/api/canvas/transaction", {
            transaction: { revision: state.snapshot.workspace.revision, commands: workspaceCommands },
          })
        : workspaceCommands.length === 0
          ? await request("/api/canvas/graph-transaction", {
              transaction: { revision: state.snapshot.graph.revision, commands: graphCommands },
            })
        : await request("/api/canvas/edit", {
            graph: { revision: state.snapshot.graph.revision, commands: graphCommands },
            workspace: { revision: state.snapshot.workspace.revision, commands: workspaceCommands },
          });
      for (const id of removing) state.resultTabs.delete(id);
      setSelection([]);
      state.panelNode = undefined;
      const parts = [];
      if (removing.size > 0) parts.push(`${removing.size} 个节点`);
      if (selectedEdges.length > 0) parts.push(`${selectedEdges.length} 条连线`);
      notify(`已删除 ${parts.join("、")}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function renameItem(id, name) {
    const nextName = name.trim();
    const item = sceneItem(id);
    if (nextName.length === 0) { notify("节点名称不能为空", true); renderWorld(); return; }
    if (item?.name === nextName || state.busy) return;
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/transaction", {
        transaction: {
          revision: state.snapshot.workspace.revision,
          commands: [{ kind: "node.rename", node: id, name: nextName }],
        },
      });
      notify("节点名称已保存");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function selectOutput(node, build, output) {
    if (state.busy) return;
    const selected = sceneItem(node)?.selected;
    const clear = selected?.build === build && selected?.output === output;
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/transaction", {
        transaction: {
          revision: state.snapshot.workspace.revision,
          commands: [{
            kind: "node.select-output",
            node,
            ...(clear ? {} : { output: { build, output } }),
          }],
        },
      });
      notify(clear ? "已取消使用这个结果" : "已选择这个结果");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  function materializedPlacement(source) {
    const occupied = state.snapshot.workspace.nodes.map(item => ({ x: item.x, y: item.y }));
    const sourceGeometry = nodeGeometry(source);
    let x = source.x + sourceGeometry.width + 56;
    let y = source.y;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (!occupied.some(item => Math.abs(item.x - x) < DEFAULT_NODE_WIDTH
        && Math.abs(item.y - y) < DEFAULT_NODE_HEIGHT)) {
        return { x, y };
      }
      y += DEFAULT_NODE_HEIGHT + 28;
      if (attempt === 5) { x += DEFAULT_NODE_WIDTH + 56; y = source.y; }
    }
    return { x, y };
  }

  async function materializeProduct(sourceNode, build, output, placement) {
    if (state.busy) return;
    const source = sceneItem(sourceNode);
    if (!source) return;
    if (state.snapshot.materialization?.available !== true) {
      notify(state.snapshot.materialization?.issue ?? "当前无法把产物添加为素材", true);
      return;
    }
    state.busy = true;
    try {
      const response = await request("/api/canvas/materialize-product", {
        graphRevision: state.snapshot.graph.revision,
        workspaceRevision: state.snapshot.workspace.revision,
        sourceNode,
        product: { build, output },
        placement: placement ?? materializedPlacement(source),
      });
      state.snapshot = response.snapshot;
      setSelection([response.materialized.node]);
      state.resultTabs.delete(sourceNode);
      notify("已发布为素材并创建节点");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  function hasActiveOutputs() {
    return state.snapshot.scene.items.some(item => item.outputs.some(output =>
      ["pending", "running", "finalizing"].includes(output.state)));
  }

  function scheduleObservationPoll() {
    clearTimeout(state.observationTimer);
    if (!hasActiveOutputs()) return;
    state.observationTimer = setTimeout(async () => {
      if (state.busy || state.generating.size > 0 || state.drag || state.pan || state.marquee || state.connection) {
        scheduleObservationPoll();
        return;
      }
      try {
        state.snapshot = await request("/api/canvas");
        render();
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), true);
      } finally {
        scheduleObservationPoll();
      }
    }, 1200);
  }

  async function generateNode(node) {
    if (state.generating.has(node)) return;
    const issue = generationIssue(node);
    if (issue !== undefined) { notify(issue, true); return; }
    state.generating.add(node);
    render();
    try {
      const response = await request("/api/canvas/builds", {
        graphRevision: state.snapshot.graph.revision,
        workspaceRevision: state.snapshot.workspace.revision,
        node,
      });
      state.snapshot = response.snapshot;
      state.resultTabs.add(node);
      const attachment = response.unattached.length === 0
        ? ""
        : `；${response.unattached.length} 个已删除节点的输出未附加`;
      notify(`已提交 ${response.generated.length} 个节点${attachment}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.generating.delete(node);
      render();
      scheduleObservationPoll();
    }
  }

  function openEnvironmentPopover() {
    const popover = app.querySelector("#workbench-environment-popover");
    if (popover && !popover.matches(":popover-open")) popover.showPopover();
  }

  async function connectEnvironment() {
    if (state.environmentConnecting) return;
    state.environmentConnecting = true;
    renderChrome();
    openEnvironmentPopover();
    try {
      state.snapshot = await request("/api/canvas/environment/connect", {});
      notify("生成服务已连接");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.environmentConnecting = false;
      render();
    }
  }

  async function replaceGraphNode(id, change, message) {
    if (state.busy) return false;
    const node = graphNode(id);
    if (!node) return false;
    let accepted = false;
    state.busy = true;
    try {
      const next = change(structuredClone(node));
      state.snapshot = await request("/api/canvas/graph-transaction", {
        transaction: {
          revision: state.snapshot.graph.revision,
          commands: [{ kind: "node.replace", node: next }],
        },
      });
      accepted = true;
      notify(message);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
    return accepted;
  }

  async function switchUsing(id, raw, message) {
    let using;
    try { using = JSON.parse(raw); } catch { notify("模型标识无效", true); return; }
    await replaceGraphNode(id, node => ({ ...node, using }), message);
  }

  async function updateGraphInput(id, key, kind, raw) {
    let value = raw;
    if (kind === "number") {
      value = Number(raw);
      if (!Number.isFinite(value)) { notify(`${key} 必须是数字`, true); renderWorld(); return; }
    }
    if (kind === "boolean") value = raw === "true";
    await replaceGraphNode(id, node => ({
      ...node,
      inputs: { ...node.inputs, [key]: { value } },
    }), `${key} 已保存`);
  }

  async function updateGraphVariant(id, raw) {
    await replaceGraphNode(id, node => ({
      ...node,
      inputs: authoringVariantInputs(nodeType(id).editor, node, raw),
    }), "生成模式已切换");
  }

  async function removeGraphInput(id, key) {
    await replaceGraphNode(id, node => {
      const inputs = { ...node.inputs };
      for (const owned of authoringBindingInputKeys(nodeType(id).editor, node, key)) delete inputs[owned];
      return { ...node, inputs };
    }, `${key} 已移除`);
  }

  function animateConnectionResult(id, result) {
    const surface = receivingElement(id);
    if (!surface || matchMedia("(prefers-reduced-motion: reduce)").matches || typeof surface.animate !== "function") return;
    surface.animate(result === "accept"
      ? [{ transform: "none" }, { transform: "translateY(3px) scale(.985)" }, { transform: "none" }]
      : [{ transform: "none" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }],
    { duration: result === "accept" ? 240 : 280, easing: "cubic-bezier(.4,0,.2,1)" });
  }

  async function connectOption(option, feedbackId = option.targetId) {
    closeConnectionMenu();
    const accepted = await replaceGraphNode(option.targetId,
      node => connectedNode(node, option.sourceId, option),
      `已连接到 ${option.input.label}`);
    animateConnectionResult(feedbackId, accepted ? "accept" : "reject");
  }

  function connectedNode(node, sourceId, option) {
    const editor = option.presentation?.editor ?? nodeType(node.id).editor;
    const inputs = option.variant === undefined ? { ...node.inputs }
      : editor?.variant === undefined
        ? { ...node.inputs, [option.variant.input]: { value: option.variant.value } }
        : authoringVariantInputs(editor, node, option.variant.value);
    const key = nextAuthoringConnectionKey({ ...node, inputs }, option.port, option.entry);
    if (option.replacement) {
      for (const owned of authoringBindingInputKeys(editor, node, key)) delete inputs[owned];
    }
    inputs[key] = { node: sourceId };
    const fields = option.port.kind === "slot" ? (option.port.itemFields ?? []) : (option.entry.itemFields ?? []);
    for (const field of fields) {
      if (field.default === undefined) continue;
      const fieldInput = field.input.kind === "sibling" ? field.input.name : `${key}.${field.name}`;
      inputs[fieldInput] = { value: structuredClone(field.default) };
    }
    if (option.port.kind === "list"
      && option.port.entries.filter(entry => entry.prefix === option.entry.prefix).length > 1) {
      inputs[`${key}.role`] = { value: option.role };
    }
    return { ...node, inputs };
  }

  async function createConnectedNode(option) {
    const anchor = sceneItem(option.anchorId);
    if (!anchor || state.busy) return;
    const id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const point = state.pendingConnection?.point;
    const anchorGeometry = nodeGeometry(anchor);
    const draggedAway = point !== undefined && Math.hypot(
      point.x + state.worldLeft - (anchor.x + (option.side === "output" ? anchorGeometry.width : 0)),
      point.y + state.worldTop - (anchor.y + anchorGeometry.height / 2),
    ) >= 80;
    const x = draggedAway
      ? Math.round(point.x + state.worldLeft - (option.side === "output" ? 0 : DEFAULT_NODE_WIDTH))
      : option.side === "output" ? anchor.x + anchorGeometry.width + 80 : anchor.x - DEFAULT_NODE_WIDTH - 80;
    const y = draggedAway ? Math.round(point.y + state.worldTop - DEFAULT_NODE_HEIGHT / 2) : anchor.y;
    let created = { id, using: structuredClone(option.presentation.using),
      inputs: initialAuthoringInputs(option.presentation) };
    const graphCommands = [];
    if (option.side === "output") {
      created = connectedNode(created, option.anchorId, option);
      graphCommands.push({ kind: "node.add", node: created });
    } else {
      graphCommands.push({ kind: "node.add", node: created });
      graphCommands.push({ kind: "node.replace", node: connectedNode(graphNode(option.anchorId), id, option) });
    }
    closeConnectionMenu();
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/edit", {
        graph: { revision: state.snapshot.graph.revision, commands: graphCommands },
        workspace: {
          revision: state.snapshot.workspace.revision,
          commands: [{ kind: "node.add", node: {
            node: id,
            name: option.presentation.modelLabel ?? option.presentation.displayName,
            x,
            y,
          } }],
        },
      });
      setSelection([id]);
      notify("节点已创建并连接");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function createCatalogNode(presentation) {
    if (state.busy || presentation?.editor === undefined) return;
    const id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const viewport = viewportState();
    const position = openPositionNear(
      Math.round(viewport.centerX - DEFAULT_NODE_WIDTH / 2),
      Math.round(viewport.centerY - DEFAULT_NODE_HEIGHT / 2),
    );
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/edit", {
        graph: { revision: state.snapshot.graph.revision, commands: [{ kind: "node.add", node: {
          id,
          using: structuredClone(presentation.using),
          inputs: initialAuthoringInputs(presentation),
        } }] },
        workspace: { revision: state.snapshot.workspace.revision, commands: [{ kind: "node.add", node: {
          node: id,
          name: presentation.modelLabel ?? presentation.displayName,
          x,
          y,
        } }] },
      });
      setSelection([id]);
      state.libraryOpen = false;
      notify("节点已创建");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function refreshProjectMedia(announce = true) {
    if (state.busy) return;
    state.busy = true;
    try {
      state.snapshot = await request("/api/canvas/media-library/refresh", {});
      if (announce) notify("项目素材已刷新");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function placeProjectMedia(mediaId, point, targetId) {
    if (state.busy) return;
    const media = state.snapshot.mediaLibrary.assets.find(candidate => candidate.id === mediaId);
    if (!media || media.error) return;
    const existingNode = graphNodeForMedia(media);
    const existingItem = existingNode === undefined ? undefined : sceneItem(existingNode.id);
    if (existingItem !== undefined && targetId === undefined) {
      focusItem(existingItem.id);
      notify("已定位画布上的素材");
      return;
    }
    state.busy = true;
    try {
      const response = await request("/api/canvas/media-assets/place", {
        graphRevision: state.snapshot.graph.revision,
        workspaceRevision: state.snapshot.workspace.revision,
        media: mediaId,
        placement: {
          x: Math.round(point.x),
          y: Math.round(point.y),
        },
      });
      state.snapshot = response.snapshot;
      setSelection([response.placed.node]);
      let connected = false;
      if (targetId !== undefined && targetId !== response.placed.node) {
        const option = automaticConnectionOption(response.placed.node, targetId);
        if (option !== undefined) {
          const targetNode = graphNode(targetId);
          state.snapshot = await request("/api/canvas/graph-transaction", {
            transaction: {
              revision: state.snapshot.graph.revision,
              commands: [{ kind: "node.replace", node: connectedNode(targetNode, response.placed.node, option) }],
            },
          });
          connected = true;
        }
      }
      notify(response.placed.existing
        ? connected ? "已定位并接入现有素材" : "已定位画布上的素材"
        : connected ? "素材已添加并接入节点" : "素材已添加到画布");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function uploadMediaFile(file, x, y) {
    const query = new URLSearchParams({ name: file.name, x: String(x), y: String(y) });
    const response = await fetch(`/api/canvas/import?${query}`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message ?? `素材导入失败 (${response.status})`);
    return value;
  }

  async function importMediaFiles(files, point, targetId) {
    if (state.busy || files.length === 0) return;
    state.busy = true;
    let importedCount = 0;
    let connectedCount = 0;
    try {
      for (const [index, file] of [...files].entries()) {
        const target = targetId === undefined ? undefined : sceneItem(targetId);
        const x = target === undefined
          ? Math.round(point.x + index * 28 - DEFAULT_NODE_WIDTH / 2)
          : Math.round(target.x - DEFAULT_NODE_WIDTH - 80);
        const y = target === undefined
          ? Math.round(point.y + index * 28 - DEFAULT_NODE_HEIGHT / 2)
          : Math.round(target.y + index * (DEFAULT_NODE_HEIGHT + 34));
        const ghost = { id: `import-${Date.now()}-${index}`, name: file.name, x, y };
        state.imports.push(ghost);
        renderWorld();
        try {
          const result = await uploadMediaFile(file, x, y);
          state.snapshot = result.snapshot;
          importedCount += 1;
          if (targetId !== undefined) {
            const option = automaticConnectionOption(result.imported.node, targetId);
            if (option !== undefined) {
              const targetNode = graphNode(targetId);
              state.snapshot = await request("/api/canvas/graph-transaction", {
                transaction: {
                  revision: state.snapshot.graph.revision,
                  commands: [{ kind: "node.replace", node: connectedNode(targetNode, result.imported.node, option) }],
                },
              });
              connectedCount += 1;
            }
          }
          setSelection([result.imported.node]);
        } catch (error) {
          notify(error instanceof Error ? error.message : String(error), true);
        } finally {
          state.imports = state.imports.filter(item => item !== ghost);
          render();
        }
      }
      if (importedCount > 0) {
        const connection = targetId === undefined ? ""
          : connectedCount === importedCount ? "，已接入节点"
            : connectedCount > 0 ? `，${connectedCount} 个已接入节点`
              : "；目标节点没有可用端口，素材保留在画布上";
        notify(`已导入 ${importedCount} 个素材${connection}`);
      }
    } finally {
      state.busy = false;
      render();
    }
  }

  app.addEventListener("pointerdown", event => {
    if (!state.libraryOpen
      || event.target.closest(".node-library")
      || event.target.closest("[data-category]")) return;
    state.libraryOpen = false;
    renderChrome();
  }, true);

  app.addEventListener("pointerdown", event => {
    if (state.choiceMenu === undefined
      || event.target.closest("[data-choice-trigger], [data-choice-menu]")) return;
    state.choiceMenu = undefined;
    syncChoiceMenus();
  }, true);

  app.addEventListener("pointerdown", event => {
    if (state.panelNode === undefined
      || event.target.closest(".canvas-node, #node-panel-host")) return;
    closeNodePanel();
  }, true);

  app.addEventListener("click", event => {
    const nodeAction = event.target.closest("[data-node-action]")?.dataset.nodeAction;
    if (nodeAction !== undefined) {
      closeNodeContextMenu();
      if (nodeAction === "copy") void copySelectedNodes();
      if (nodeAction === "duplicate") void duplicateSelectedNodes();
      if (nodeAction === "delete") void deleteSelection();
      return;
    }
    if (consumeSuppressedClick()) return;
    if (event.target.closest("[data-environment-connect]")) {
      void connectEnvironment();
      return;
    }
    const mediaPreview = event.target.closest("[data-media-preview]");
    if (mediaPreview) {
      toggleMediaPreview(mediaPreview);
      return;
    }
    const choice = event.target.closest("[data-choice-option]");
    if (choice) {
      state.panelNode = choice.dataset.choiceNode;
      state.choiceMenu = undefined;
      syncChoiceMenus();
      const action = choice.dataset.choiceAction;
      if (action === "model") void switchUsing(choice.dataset.choiceNode, choice.dataset.choiceValue, "模型已切换");
      if (action === "variant") void updateGraphVariant(choice.dataset.choiceNode, choice.dataset.choiceValue);
      if (action === "input") {
        if (choice.dataset.choiceValue === "") void removeGraphInput(choice.dataset.choiceNode, choice.dataset.choiceInput);
        else void updateGraphInput(choice.dataset.choiceNode, choice.dataset.choiceInput,
          choice.dataset.choiceInputKind, choice.dataset.choiceValue);
      }
      return;
    }
    const choiceTrigger = event.target.closest("[data-choice-trigger]");
    if (choiceTrigger) {
      const node = choiceTrigger.dataset.choiceNode;
      const key = choiceTrigger.dataset.choiceTrigger;
      state.choiceMenu = state.choiceMenu?.node === node && state.choiceMenu?.key === key
        ? undefined : { node, key };
      state.panelNode = node;
      syncChoiceMenus();
      return;
    }
    const selectedEdge = event.target.closest(".edge");
    if (selectedEdge) {
      closeNodePanel();
      closeConnectionMenu();
      closeNodeContextMenu();
      selectEdge({ kind: "recipe", from: selectedEdge.dataset.edgeFrom, to: selectedEdge.dataset.edgeTo,
        input: selectedEdge.dataset.edgeInput }, { toggle: event.shiftKey || event.metaKey || event.ctrlKey });
      return;
    }
    const connectionOption = event.target.closest("[data-connection-option]");
    if (connectionOption) {
      const option = state.connectionMenuOptions[Number(connectionOption.dataset.connectionOption)];
      if (option?.kind === "create") void createConnectedNode(option);
      else if (option) void connectOption(option, state.pendingConnection?.otherId);
      return;
    }
    if (!event.target.closest("#connection-menu") && !app.querySelector("#connection-menu").hidden) {
      closeConnectionMenu();
    }
    if (!event.target.closest("#node-context-menu")) closeNodeContextMenu();
    if (event.target.closest("[data-node-name]")) {
      const titledNode = event.target.closest("[data-item]");
      if (titledNode?.querySelector(":scope > .node-editor")) {
        select(titledNode.dataset.item);
        state.panelNode = titledNode.dataset.item;
        renderNodePanel();
      }
      return;
    }
    const materialize = event.target.closest("[data-materialize-build]");
    if (materialize) {
      const node = materialize.closest("[data-item]");
      if (node) void materializeProduct(node.dataset.item,
        materialize.dataset.materializeBuild, materialize.dataset.materializeOutput);
      return;
    }
    const result = event.target.closest("[data-result-build]");
    if (result) {
      const node = result.closest("[data-item]");
      if (node) void selectOutput(node.dataset.item, result.dataset.resultBuild, result.dataset.resultOutput);
      return;
    }
    const history = event.target.closest("[data-history-node]");
    if (history) {
      const node = history.dataset.historyNode;
      if (state.resultTabs.has(node)) state.resultTabs.delete(node);
      else state.resultTabs.add(node);
      render();
      return;
    }
    const generate = event.target.closest("[data-generate-node]");
    if (generate) {
      if (generate.hasAttribute("data-environment-required")) {
        openEnvironmentPopover();
        return;
      }
      void generateNode(generate.dataset.generateNode);
      return;
    }
    const focusNode = event.target.closest("[data-focus-node]");
    if (focusNode) { focusItem(focusNode.dataset.focusNode); return; }
    const node = event.target.closest("[data-item]");
    if (node) {
      const id = node.dataset.item;
      select(id, { toggle: event.shiftKey || event.metaKey || event.ctrlKey });
      openNodePanelForElement(node);
      return;
    }
    const catalog = event.target.closest("[data-catalog-index]");
    if (catalog) {
      const presentation = state.snapshot.catalog[Number(catalog.dataset.catalogIndex)];
      if (presentation) void createCatalogNode(presentation);
      return;
    }
    const media = event.target.closest("[data-media-id]");
    if (media) {
      const viewport = viewportState();
      void placeProjectMedia(media.dataset.mediaId, {
        x: viewport.centerX - DEFAULT_NODE_WIDTH / 2,
        y: viewport.centerY - DEFAULT_NODE_HEIGHT / 2,
      });
      return;
    }
    const product = event.target.closest("[data-product-source]");
    if (product) {
      focusItem(product.dataset.productSource);
      return;
    }
    const library = event.target.closest("[data-node]");
    if (library) {
      const item = state.snapshot.scene.items.find(candidate => candidate.kind === "graph-node" && candidate.node === library.dataset.node);
      if (item) focusItem(item.id);
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "library-close") { state.libraryOpen = false; renderChrome(); }
    if (action === "library-refresh") void refreshProjectMedia();
    if (action === "import") app.querySelector("#media-import").click();
    if (action === "pointer-mode") {
      state.tool = state.tool === "select" ? "pan" : "select";
      state.libraryOpen = false;
      renderChrome();
      return;
    }
    if (action === "align") {
      const positions = [...state.selected].flatMap(id => {
        const item = sceneItem(id);
        return item === undefined ? [] : [{ id, x: Math.round(item.x / 16) * 16, y: Math.round(item.y / 16) * 16 }];
      });
      if (positions.length > 0) void moveItems(positions);
      else notify("先选择一个节点");
    }
    if (action === "minimap") {
      state.minimapOpen = !state.minimapOpen;
      renderChrome();
      renderMinimap();
    }
    const category = event.target.closest("[data-category]")?.dataset.category;
    if (category) {
      if (category === "asset") {
        state.libraryOpen = !(state.libraryOpen && state.category === category);
        state.category = category;
        state.filter = "";
        app.querySelector("#node-search").value = "";
        renderChrome();
        renderLibrary();
        if (state.libraryOpen) {
          void refreshProjectMedia(false);
          requestAnimationFrame(() => app.querySelector("#node-search").focus());
        }
      } else {
        state.libraryOpen = !(state.libraryOpen && state.category === category);
        state.category = category;
        state.filter = "";
        app.querySelector("#node-search").value = "";
        renderChrome();
        renderLibrary();
        if (state.libraryOpen) requestAnimationFrame(() => app.querySelector("#node-search").focus());
      }
      return;
    }
    if (event.target.closest("#viewport")) {
      closeNodePanel();
      setSelection([]);
      renderChrome();
      renderLibrary();
      renderWorld();
    }
  });

  app.querySelector("#node-search").addEventListener("input", event => {
    state.filter = event.target.value;
    renderLibrary();
  });

  app.querySelector("#media-import").addEventListener("change", event => {
    const files = event.target.files;
    const viewport = viewportState();
    event.target.value = "";
    if (files?.length) void importMediaFiles(files, { x: viewport.centerX, y: viewport.centerY });
  });

  app.querySelector("#node-list").addEventListener("dragstart", event => {
    const product = event.target.closest("[data-product-source]");
    if (product?.draggable && event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(PRODUCT_DRAG_TYPE, JSON.stringify({
        sourceNode: product.dataset.productSource,
        build: product.dataset.productBuild,
        output: product.dataset.productOutput,
      }));
      event.dataTransfer.setData("text/plain", `${product.dataset.productBuild}/${product.dataset.productOutput}`);
      return;
    }
    const media = event.target.closest("[data-media-id]");
    if (!media || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(PROJECT_MEDIA_DRAG_TYPE, media.dataset.mediaId);
    event.dataTransfer.setData("text/plain", media.dataset.mediaId);
  });

  app.addEventListener("change", event => {
    const input = event.target.closest("[data-node-name]");
    if (input) { void renameItem(input.dataset.nodeName, input.value); return; }
    const variant = event.target.closest("[data-variant-node]");
    if (variant) {
      void updateGraphVariant(variant.dataset.variantNode, variant.value);
      return;
    }
    const graphInput = event.target.closest("[data-graph-input]");
    if (graphInput) {
      if (graphInput.dataset.inputOptional === "true" && graphInput.value === "") {
        void removeGraphInput(graphInput.dataset.inputNode, graphInput.dataset.graphInput);
        return;
      }
      void updateGraphInput(graphInput.dataset.inputNode, graphInput.dataset.graphInput,
        graphInput.dataset.inputKind, graphInput.value);
    }
  });

  app.addEventListener("keydown", event => {
    if (event.key === "Escape" && !app.querySelector("#connection-menu").hidden) {
      closeConnectionMenu();
      return;
    }
    const input = event.target.closest("[data-node-name]");
    if (!input) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void renameItem(input.dataset.nodeName, input.value);
      input.blur();
    }
    if (event.key === "Escape") {
      input.value = sceneItem(input.dataset.nodeName)?.name ?? input.value;
      input.blur();
    }
  });

  function editableTarget(target) {
    return target instanceof Element && target.closest("input, textarea, select, [contenteditable=true]") !== null;
  }

  document.addEventListener("keydown", event => {
    if (editableTarget(event.target)) return;
    const command = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") {
      closeConnectionMenu();
      closeNodeContextMenu();
      closeNodePanel();
      if (state.selected.size > 0 || state.selectedEdges.size > 0) select(undefined);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace")
      && (state.selected.size > 0 || state.selectedEdges.size > 0)) {
      event.preventDefault();
      void deleteSelection();
      return;
    }
    if (command && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void duplicateSelectedNodes();
      return;
    }
    if (command && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const ids = state.snapshot.scene.items.map(item => item.id);
      setSelection(ids, ids.at(-1), visibleMediaEdges().map(edgeIdentity));
      render();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      && state.selected.size > 0) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      const positions = [...state.selected].flatMap(id => {
        const item = sceneItem(id);
        return item === undefined ? [] : [{ id, x: item.x + dx, y: item.y + dy }];
      });
      void moveItems(positions);
    }
  });

  document.addEventListener("copy", event => {
    if (editableTarget(event.target)) return;
    const payload = canvasClipboard();
    if (payload === undefined || event.clipboardData === null) return;
    event.preventDefault();
    state.clipboard = payload;
    event.clipboardData.setData("application/json", JSON.stringify(payload));
    event.clipboardData.setData("text/plain", JSON.stringify(payload));
    notify(`已复制 ${payload.nodes.length} 个节点`);
  });

  document.addEventListener("paste", event => {
    if (editableTarget(event.target)) return;
    let payload;
    const text = event.clipboardData?.getData("application/json")
      || event.clipboardData?.getData("text/plain");
    if (text) {
      try { payload = parseCanvasClipboard(JSON.parse(text)); } catch { payload = undefined; }
    }
    payload ??= state.clipboard;
    if (parseCanvasClipboard(payload) === undefined) return;
    event.preventDefault();
    void pasteCanvasClipboard(payload);
  });

  app.querySelector("#nodes").addEventListener("contextmenu", event => {
    const node = event.target.closest("[data-item]");
    if (!node) return;
    event.preventDefault();
    if (!isSelected(node.dataset.item)) select(node.dataset.item);
    closeConnectionMenu();
    openNodeContextMenu(event.clientX, event.clientY);
  });

  app.querySelector("#nodes").addEventListener("pointerdown", event => {
    const hitbox = event.target.closest(".port-hitbox");
    if (state.tool !== "select" || !hitbox || state.busy || event.button !== 0) return;
    const element = hitbox.closest("[data-item]");
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    closeConnectionMenu();
    const side = hitbox.dataset.portSide;
    state.connection = {
      anchorId: element.dataset.item,
      side,
      point: clientToWorld(event.clientX, event.clientY),
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
      hitbox,
    };
    app.classList.add("is-connecting");
    hitbox.setPointerCapture(event.pointerId);
    renderEdges();
  });

  app.querySelector("#nodes").addEventListener("pointerdown", event => {
    const handle = event.target.closest(".node-resize-handle");
    if (state.tool !== "select" || !handle || state.busy || event.button !== 0) return;
    const element = handle.closest("[data-item]");
    const item = element === null ? undefined : sceneItem(element.dataset.item);
    if (item === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (!isSelected(item.id)) {
      setSelection([item.id], item.id);
      renderSelection();
    }
    const geometry = nodeGeometry(item);
    state.resize = {
      id: item.id,
      element,
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      start: { width: geometry.width, mediaHeight: geometry.mediaHeight },
      preview: { width: geometry.width, mediaHeight: geometry.mediaHeight },
    };
    element.classList.add("resizing");
    handle.setPointerCapture(event.pointerId);
  });

  app.querySelector("#nodes").addEventListener("dblclick", event => {
    const handle = event.target.closest(".node-resize-handle");
    if (!handle || state.busy) return;
    event.preventDefault();
    event.stopPropagation();
    void resizeItem(handle.dataset.resizeNode);
  });

  app.querySelector("#nodes").addEventListener("pointerdown", event => {
    if (state.tool !== "select" || state.busy || event.button !== 0
      || event.target.closest("button, input, .node-editor, .port-hitbox, .node-resize-handle")) return;
    const element = event.target.closest("[data-item]");
    if (!element) return;
    const item = sceneItem(element.dataset.item);
    if (!item) return;
    event.preventDefault();
    const modifier = event.shiftKey || event.metaKey || event.ctrlKey;
    const wasSelected = isSelected(item.id);
    if (!wasSelected) {
      setSelection(modifier ? [...state.selected, item.id] : [item.id], item.id,
        modifier ? state.selectedEdges : []);
      renderSelection();
    }
    const ids = [...state.selected];
    const origins = new Map(ids.flatMap(id => {
      const candidate = state.snapshot.scene.items.find(entry => entry.id === id);
      return candidate === undefined ? [] : [[id, { x: candidate.x, y: candidate.y }]];
    }));
    const elements = new Map(ids.flatMap(id => {
      const candidate = app.querySelector(`.canvas-node[data-item="${CSS.escape(id)}"]`);
      return candidate === null ? [] : [[id, candidate]];
    }));
    state.drag = {
      id: item.id,
      element,
      ids,
      elements,
      origins,
      positions: new Map(origins),
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      cameraX: state.camera.x,
      cameraY: state.camera.y,
      x: item.x,
      y: item.y,
      nextX: item.x,
      nextY: item.y,
      moved: false,
      snapState: {},
      bypassSnap: event.ctrlKey || event.metaKey,
      modifier,
      wasSelected,
      collapseOnClick: !modifier && wasSelected && (state.selected.size > 1 || state.selectedEdges.size > 0),
      pointerId: event.pointerId,
    };
    for (const candidate of elements.values()) candidate.classList.add("dragging");
    element.setPointerCapture(event.pointerId);
    startDragAutopan();
  });

  function updateDraggedItem(clientX, clientY, bypassSnap = state.drag?.bypassSnap ?? false) {
    if (!state.drag) return;
    state.drag.lastX = clientX;
    state.drag.lastY = clientY;
    state.drag.bypassSnap = bypassSnap;
    const rawX = Math.round(state.drag.x + (clientX - state.drag.startX - (state.camera.x - state.drag.cameraX)) / state.zoom);
    const rawY = Math.round(state.drag.y + (clientY - state.drag.startY - (state.camera.y - state.drag.cameraY)) / state.zoom);
    const targets = state.snapshot.scene.items.filter(item => !state.drag.origins.has(item.id))
      .map(item => { const geometry = nodeGeometry(item); return { id: item.id, x: item.x,
        y: item.y + NODE_CAPTION_HEIGHT, width: geometry.width, height: geometry.mediaHeight }; });
    const dragged = sceneItem(state.drag.id);
    const draggedGeometry = dragged === undefined
      ? { width: DEFAULT_NODE_WIDTH, mediaHeight: DEFAULT_MEDIA_HEIGHT }
      : nodeGeometry(dragged);
    const snapped = bypassSnap
      ? { x: rawX, y: rawY + NODE_CAPTION_HEIGHT, guides: [], state: {} }
      : resolveCanvasSnap({ id: state.drag.id, x: rawX, y: rawY + NODE_CAPTION_HEIGHT,
        width: draggedGeometry.width, height: draggedGeometry.mediaHeight }, targets, state.zoom, state.drag.snapState);
    const x = Math.round(snapped.x);
    const y = Math.round(snapped.y - NODE_CAPTION_HEIGHT);
    state.drag.snapState = snapped.state;
    state.drag.moved ||= Math.abs(clientX - state.drag.startX) > 2 || Math.abs(clientY - state.drag.startY) > 2;
    const deltaX = x - state.drag.x;
    const deltaY = y - state.drag.y;
    state.drag.positions = new Map([...state.drag.origins].map(([id, origin]) => [id, {
      x: origin.x + deltaX,
      y: origin.y + deltaY,
    }]));
    for (const [id, position] of state.drag.positions) {
      const element = state.drag.elements.get(id);
      if (element === undefined) continue;
      element.style.left = `${position.x - state.worldLeft}px`;
      element.style.top = `${position.y - state.worldTop}px`;
    }
    state.drag.nextX = x;
    state.drag.nextY = y;
    renderEdges();
    renderMinimap();
    scheduleNodeEditorPosition();
    renderSnapGuides(snapped.guides);
  }

  function dragAutopanVelocity(value, start, end) {
    const margin = 72;
    if (value < start + margin) return 14 * (1 - Math.max(0, value - start) / margin);
    if (value > end - margin) return -14 * (1 - Math.max(0, end - value) / margin);
    return 0;
  }

  function startDragAutopan() {
    if (state.dragFrame !== undefined) cancelAnimationFrame(state.dragFrame);
    const tick = () => {
      if (!state.drag) { state.dragFrame = undefined; return; }
      const rect = app.querySelector("#viewport").getBoundingClientRect();
      const dx = dragAutopanVelocity(state.drag.lastX, rect.left, rect.right);
      const dy = dragAutopanVelocity(state.drag.lastY, rect.top, rect.bottom);
      if (dx !== 0 || dy !== 0) {
        state.camera.x += dx;
        state.camera.y += dy;
        applyCamera();
        updateDraggedItem(state.drag.lastX, state.drag.lastY, state.drag.bypassSnap);
      }
      state.dragFrame = requestAnimationFrame(tick);
    };
    state.dragFrame = requestAnimationFrame(tick);
  }

  app.querySelector("#nodes").addEventListener("pointermove", event => {
    if (state.resize?.pointerId === event.pointerId) {
      event.preventDefault();
      const resize = state.resize;
      const dx = (event.clientX - resize.startX) / state.zoom;
      const dy = (event.clientY - resize.startY) / state.zoom;
      let width;
      let mediaHeight;
      if (event.shiftKey) {
        width = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_SIZE, resize.start.width + dx));
        mediaHeight = Math.max(MIN_NODE_HEIGHT, Math.min(MAX_NODE_SIZE, resize.start.mediaHeight + dy));
      } else {
        const xScale = (resize.start.width + dx) / resize.start.width;
        const yScale = (resize.start.mediaHeight + dy) / resize.start.mediaHeight;
        const scale = dx + dy >= 0 ? Math.max(xScale, yScale) : Math.min(xScale, yScale);
        width = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_SIZE, resize.start.width * scale));
        mediaHeight = Math.max(MIN_NODE_HEIGHT, Math.min(MAX_NODE_SIZE, resize.start.mediaHeight * scale));
      }
      resize.preview = { width: Math.round(width), mediaHeight: Math.round(mediaHeight) };
      resize.element.style.width = `${resize.preview.width}px`;
      resize.element.style.setProperty("--node-media-height", `${resize.preview.mediaHeight}px`);
      resize.element.style.setProperty("--node-port-y", `${NODE_CAPTION_HEIGHT + resize.preview.mediaHeight / 2}px`);
      calculateWorld();
      applyCamera();
      renderEdges();
      renderMinimap();
      scheduleNodeEditorPosition();
      return;
    }
    const hitbox = event.target.closest(".port-hitbox");
    if (hitbox) followConnector(hitbox, hitbox.dataset.portSide, event.clientX, event.clientY);
    if (state.connection) {
      const connection = state.connection;
      connection.moved ||= Math.hypot(event.clientX - connection.startX, event.clientY - connection.startY) > 3;
      connection.point = clientToWorld(event.clientX, event.clientY);
      const hovered = document.elementsFromPoint(event.clientX, event.clientY)
        .map(element => element.closest?.("[data-item]"))
        .find(element => element && element.dataset.item !== connection.anchorId);
      connection.hoveredId = hovered?.dataset.item;
      connection.otherId = connection.hoveredId !== undefined
        && connectionOptions(connection.anchorId, connection.side, connection.hoveredId).length > 0
        ? connection.hoveredId : undefined;
      if (connection.hoveredId === undefined) clearReceiving();
      else trackReceiving(connection.hoveredId, connection.otherId !== undefined);
      renderEdges();
    }
    if (state.drag) updateDraggedItem(event.clientX, event.clientY, event.ctrlKey || event.metaKey);
  });

  app.querySelector("#nodes").addEventListener("pointerout", event => {
    const hitbox = event.target.closest(".port-hitbox");
    if (hitbox && !hitbox.contains(event.relatedTarget)) {
      resetConnector(hitbox, hitbox.dataset.portSide);
    }
  });

  const finishConnection = event => {
    if (!state.connection || state.connection.pointerId !== event.pointerId) return;
    const connection = state.connection;
    state.connection = undefined;
    app.classList.remove("is-connecting");
    if (connection.hitbox.hasPointerCapture(event.pointerId)) connection.hitbox.releasePointerCapture(event.pointerId);
    const rejectedTarget = connection.moved && connection.hoveredId !== undefined && connection.otherId === undefined;
    clearReceiving(rejectedTarget ? "reject" : undefined);
    suppressGestureClick();
    const options = connection.otherId === undefined
      ? []
      : connectionOptions(connection.anchorId, connection.side, connection.otherId);
    if (connection.moved && options.length === 1) {
      renderEdges();
      void connectOption(options[0], connection.otherId);
      return;
    }
    if (rejectedTarget) {
      renderEdges();
      notify("这个节点没有可接收该媒体的端口", true);
      return;
    }
    openConnectionMenu(connection.anchorId, connection.side, event.clientX, event.clientY,
      connection.moved ? connection.otherId : undefined);
  };
  app.querySelector("#nodes").addEventListener("pointerup", finishConnection);
  app.querySelector("#nodes").addEventListener("pointercancel", event => {
    if (!state.connection || state.connection.pointerId !== event.pointerId) return;
    const connection = state.connection;
    state.connection = undefined;
    app.classList.remove("is-connecting");
    clearReceiving();
    renderEdges();
  });

  app.querySelector("#edges").addEventListener("pointerover", event => {
    event.target.closest(".edge")?.classList.add("hovered");
  });
  app.querySelector("#edges").addEventListener("pointerout", event => {
    const edge = event.target.closest(".edge");
    if (edge && !edge.contains(event.relatedTarget)) edge.classList.remove("hovered");
  });
  const finishResize = event => {
    if (!state.resize || state.resize.pointerId !== event.pointerId) return;
    const resize = state.resize;
    state.resize = undefined;
    if (resize.handle.hasPointerCapture(event.pointerId)) resize.handle.releasePointerCapture(event.pointerId);
    resize.element.classList.remove("resizing");
    suppressGestureClick();
    void resizeItem(resize.id, { width: resize.preview.width, height: resize.preview.mediaHeight });
  };
  const cancelResize = event => {
    if (!state.resize || state.resize.pointerId !== event.pointerId) return;
    state.resize.element.classList.remove("resizing");
    state.resize = undefined;
    renderWorld();
  };
  app.querySelector("#nodes").addEventListener("pointerup", finishResize);
  app.querySelector("#nodes").addEventListener("pointercancel", cancelResize);
  const finishDrag = event => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const drag = state.drag;
    state.drag = undefined;
    if (state.dragFrame !== undefined) cancelAnimationFrame(state.dragFrame);
    state.dragFrame = undefined;
    if (drag.element.hasPointerCapture(event.pointerId)) drag.element.releasePointerCapture(event.pointerId);
    for (const candidate of drag.elements.values()) candidate.classList.remove("dragging");
    renderSnapGuides([]);
    suppressGestureClick();
    if (drag.moved) {
      void moveItems([...drag.positions].map(([id, position]) => ({ id, ...position })));
    } else {
      if (drag.modifier && drag.wasSelected) select(drag.id, { toggle: true });
      else if (drag.collapseOnClick) select(drag.id);
      openNodePanelForElement(drag.element);
    }
    scheduleViewportSave();
  };
  const cancelDrag = event => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const drag = state.drag;
    state.drag = undefined;
    if (state.dragFrame !== undefined) cancelAnimationFrame(state.dragFrame);
    state.dragFrame = undefined;
    for (const candidate of drag.elements.values()) candidate.classList.remove("dragging");
    renderSnapGuides([]);
    renderWorld();
    renderMinimap();
  };
  app.querySelector("#nodes").addEventListener("pointerup", finishDrag);
  app.querySelector("#nodes").addEventListener("pointercancel", cancelDrag);

  const viewport = app.querySelector("#viewport");

  function segmentIntersectsRect(start, end, rect) {
    if ((start.x >= rect.left && start.x <= rect.right && start.y >= rect.top && start.y <= rect.bottom)
      || (end.x >= rect.left && end.x <= rect.right && end.y >= rect.top && end.y <= rect.bottom)) return true;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let minimum = 0;
    let maximum = 1;
    for (const [direction, distance] of [
      [-dx, start.x - rect.left],
      [dx, rect.right - start.x],
      [-dy, start.y - rect.top],
      [dy, rect.bottom - start.y],
    ]) {
      if (direction === 0) {
        if (distance < 0) return false;
        continue;
      }
      const ratio = distance / direction;
      if (direction < 0) {
        if (ratio > maximum) return false;
        minimum = Math.max(minimum, ratio);
      } else {
        if (ratio < minimum) return false;
        maximum = Math.min(maximum, ratio);
      }
    }
    return minimum <= maximum;
  }

  function edgesIntersectingWorldRect(rect) {
    const padding = 2 / state.zoom;
    const local = {
      left: rect.left - state.worldLeft - padding,
      right: rect.right - state.worldLeft + padding,
      top: rect.top - state.worldTop - padding,
      bottom: rect.bottom - state.worldTop + padding,
    };
    const matches = new Set();
    for (const edge of app.querySelectorAll("#edges .edge")) {
      const path = edge.querySelector(".edge-line");
      if (!path) continue;
      const bounds = path.getBBox();
      if (bounds.x > local.right || bounds.x + bounds.width < local.left
        || bounds.y > local.bottom || bounds.y + bounds.height < local.top) continue;
      const length = path.getTotalLength();
      const steps = Math.max(1, Math.ceil(length / (8 / state.zoom)));
      let previous = path.getPointAtLength(0);
      let intersects = false;
      for (let index = 1; index <= steps; index += 1) {
        const point = path.getPointAtLength(length * index / steps);
        if (segmentIntersectsRect(previous, point, local)) {
          intersects = true;
          break;
        }
        previous = point;
      }
      if (intersects) matches.add(edgeIdentity({
        from: edge.dataset.edgeFrom,
        to: edge.dataset.edgeTo,
        input: edge.dataset.edgeInput,
      }));
    }
    return matches;
  }

  function marqueeSelection(marquee, endX, endY) {
    const rect = {
      left: Math.min(marquee.startWorldX, endX),
      right: Math.max(marquee.startWorldX, endX),
      top: Math.min(marquee.startWorldY, endY),
      bottom: Math.max(marquee.startWorldY, endY),
    };
    const matchedNodes = state.snapshot.scene.items.filter(item => {
      const geometry = nodeGeometry(item);
      return item.x < rect.right && item.x + geometry.width > rect.left
        && item.y + NODE_CAPTION_HEIGHT < rect.bottom
        && item.y + NODE_CAPTION_HEIGHT + geometry.mediaHeight > rect.top;
    }).map(item => item.id);
    const matchedEdges = edgesIntersectingWorldRect(rect);
    return {
      nodes: marquee.additive ? [...new Set([...state.selected, ...matchedNodes])] : matchedNodes,
      edges: marquee.additive ? new Set([...state.selectedEdges, ...matchedEdges]) : matchedEdges,
      primary: matchedNodes.at(-1),
    };
  }

  function sameMarqueePreview(preview, next) {
    return preview !== undefined
      && preview.nodes.length === next.nodes.length
      && preview.nodes.every((id, index) => id === next.nodes[index])
      && preview.edges.size === next.edges.size
      && [...preview.edges].every(id => next.edges.has(id));
  }

  viewport.addEventListener("dragover", event => {
    const types = Array.from(event.dataTransfer?.types ?? []);
    if (!types.includes("Files") && !types.includes(PROJECT_MEDIA_DRAG_TYPE)
      && !types.includes(PRODUCT_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    viewport.classList.add("file-dragging");
  });
  viewport.addEventListener("dragleave", event => {
    if (!viewport.contains(event.relatedTarget)) viewport.classList.remove("file-dragging");
  });
  viewport.addEventListener("drop", event => {
    const files = event.dataTransfer?.files;
    const mediaId = event.dataTransfer?.getData(PROJECT_MEDIA_DRAG_TYPE);
    const productValue = event.dataTransfer?.getData(PRODUCT_DRAG_TYPE);
    if (!files?.length && !mediaId && !productValue) return;
    event.preventDefault();
    viewport.classList.remove("file-dragging");
    const local = clientToWorld(event.clientX, event.clientY);
    const target = event.target.closest("[data-item]")?.dataset.item;
    const point = {
      x: local.x + state.worldLeft,
      y: local.y + state.worldTop,
    };
    if (files?.length) void importMediaFiles(files, point, target);
    else if (mediaId) void placeProjectMedia(mediaId, {
      x: point.x - DEFAULT_NODE_WIDTH / 2,
      y: point.y - DEFAULT_NODE_HEIGHT / 2,
    }, target);
    else if (productValue) {
      try {
        const product = JSON.parse(productValue);
        if (typeof product.sourceNode !== "string" || typeof product.build !== "string"
          || typeof product.output !== "string") throw new Error("无效的产物拖拽数据");
        void materializeProduct(product.sourceNode, product.build, product.output, {
          x: point.x - DEFAULT_NODE_WIDTH / 2,
          y: point.y - DEFAULT_NODE_HEIGHT / 2,
        });
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), true);
      }
    }
  });
  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.button !== 1) return;
    const overCanvasObject = event.target.closest("[data-item], .edge") !== null;
    const selecting = event.button === 0 && state.tool === "select";
    const panning = event.button === 1 || (event.button === 0 && state.tool === "pan");
    if ((selecting && overCanvasObject) || (!selecting && !panning)) return;
    event.preventDefault();
    if (selecting) {
      const point = clientToWorld(event.clientX, event.clientY);
      state.marquee = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWorldX: point.x + state.worldLeft,
        startWorldY: point.y + state.worldTop,
        additive: event.shiftKey || event.metaKey || event.ctrlKey,
        preview: undefined,
      };
      const marquee = app.querySelector("#selection-marquee");
      marquee.hidden = false;
      const bounds = viewport.getBoundingClientRect();
      marquee.style.left = `${event.clientX - bounds.left}px`;
      marquee.style.top = `${event.clientY - bounds.top}px`;
      marquee.style.width = "0px";
      marquee.style.height = "0px";
      viewport.setPointerCapture(event.pointerId);
      return;
    }
    state.pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: state.camera.x,
      cameraY: state.camera.y,
      moved: false,
    };
    viewport.classList.add("panning");
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", event => {
    if (state.marquee?.pointerId === event.pointerId) {
      const bounds = viewport.getBoundingClientRect();
      const left = Math.min(state.marquee.startX, event.clientX) - bounds.left;
      const top = Math.min(state.marquee.startY, event.clientY) - bounds.top;
      const marquee = app.querySelector("#selection-marquee");
      marquee.style.left = `${left}px`;
      marquee.style.top = `${top}px`;
      marquee.style.width = `${Math.abs(event.clientX - state.marquee.startX)}px`;
      marquee.style.height = `${Math.abs(event.clientY - state.marquee.startY)}px`;
      const end = clientToWorld(event.clientX, event.clientY);
      const endX = end.x + state.worldLeft;
      const endY = end.y + state.worldTop;
      const preview = marqueeSelection(state.marquee, endX, endY);
      if (!sameMarqueePreview(state.marquee.preview, preview)) {
        state.marquee.preview = preview;
        syncSelectionClasses(preview.nodes, preview.edges);
      }
      return;
    }
    if (!state.pan) return;
    const dx = event.clientX - state.pan.startX;
    const dy = event.clientY - state.pan.startY;
    state.pan.moved ||= Math.abs(dx) > 2 || Math.abs(dy) > 2;
    state.camera.x = state.pan.cameraX + dx;
    state.camera.y = state.pan.cameraY + dy;
    applyCamera();
    renderMinimap();
  });
  const finishPan = event => {
    if (state.pan?.pointerId !== event.pointerId) return;
    // The hand tool owns the entire gesture, including a click without movement.
    // Otherwise releasing over a node would fall through and select it.
    suppressGestureClick();
    state.pan = undefined;
    viewport.classList.remove("panning");
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    scheduleViewportSave();
  };
  viewport.addEventListener("pointerup", finishPan);
  viewport.addEventListener("pointercancel", event => {
    if (state.pan?.pointerId !== event.pointerId) return;
    state.pan = undefined;
    viewport.classList.remove("panning");
  });
  const finishMarquee = event => {
    if (state.marquee?.pointerId !== event.pointerId) return;
    const marquee = state.marquee;
    state.marquee = undefined;
    app.querySelector("#selection-marquee").hidden = true;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    const end = clientToWorld(event.clientX, event.clientY);
    const endX = end.x + state.worldLeft;
    const endY = end.y + state.worldTop;
    const next = marqueeSelection(marquee, endX, endY);
    setSelection(next.nodes, next.primary, next.edges);
    suppressGestureClick();
    renderSelection();
  };
  viewport.addEventListener("pointerup", finishMarquee);
  viewport.addEventListener("pointercancel", event => {
    if (state.marquee?.pointerId !== event.pointerId) return;
    state.marquee = undefined;
    app.querySelector("#selection-marquee").hidden = true;
    renderSelection();
  });
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = viewport.getBoundingClientRect();
      setZoom(state.zoom * Math.exp(-event.deltaY * .008), event.clientX - rect.left, event.clientY - rect.top);
      return;
    }
    state.camera.x -= event.deltaX;
    state.camera.y -= event.deltaY;
    applyCamera();
    renderMinimap();
    scheduleViewportSave();
  }, { passive: false });

  app.querySelector("#minimap").addEventListener("click", event => {
    if (!state.minimapBounds) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const graphX = state.minimapBounds.left + (event.clientX - rect.left) / rect.width * state.minimapBounds.width;
    const graphY = state.minimapBounds.top + (event.clientY - rect.top) / rect.height * state.minimapBounds.height;
    state.camera.x = viewport.clientWidth / 2 - graphX * state.zoom;
    state.camera.y = viewport.clientHeight / 2 - graphY * state.zoom;
    applyCamera();
    renderMinimap();
    scheduleViewportSave();
  });

  try {
    state.snapshot = await request("/api/canvas");
    document.title = `${state.snapshot.workspace.name} · Hypit Canvas`;
    render();
    app.dataset.loading = "false";
    requestAnimationFrame(restoreViewport);
    scheduleObservationPoll();
  } catch (error) {
    app.dataset.loading = "false";
    app.innerHTML = `<div class="fatal-error"><strong>画布无法打开</strong><span>${escapeHtml(error instanceof Error ? error.message : String(error))}</span></div>`;
  }
}
