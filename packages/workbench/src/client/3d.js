import * as THREE from "/assets/three.module.js";
import { OrbitControls } from "/assets/OrbitControls.js";
import { TransformControls } from "/assets/TransformControls.js";
import { GLTFLoader } from "/assets/GLTFLoader.js";
import { bindWorkbenchTopbar, workbenchTopbar } from "/assets/topbar.js";

const app = document.querySelector("#app");
const sceneQuery = new URLSearchParams(location.search);
const outputMode = sceneQuery.get("output") === "1";
const requestedPerformance = sceneQuery.get("performance");
const requestedCamera = sceneQuery.get("camera");
const requestedStart = Number(sceneQuery.get("start") ?? "0");
const requestedEnd = Number(sceneQuery.get("end") ?? "NaN");
document.body.dataset.sceneOutput = String(outputMode);
const icons = {
  scene: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
  person: '<circle cx="12" cy="5.5" r="2.3"/><path d="M8.5 21v-5.5l-2-5.5h11l-2 5.5V21M8 10l-3 5M16 10l3 5M12 8v7"/>',
  object: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 3-4 5 6"/>',
  camera: '<path d="M5 7h3l1.2-2h5.6L16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.3"/>',
  cameraView: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  select: '<path d="m5 3 12 9-6 1.4L9 20z"/>',
  move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M22 12l-3-3M22 12l-3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  scale: '<path d="M4 9V4h5M20 15v5h-5M9 20H4v-5M15 4h5v5"/>',
  ground: '<path d="M4 18h16M12 4v11M8 11l4 4 4-4"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.3"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.5-2"/>',
  focus: '<path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/><circle cx="12" cy="12" r="2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  panel: '<path d="M4 5h16v14H4zM14 5v14"/>',
  sidebarLeftClose: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M7 9l-2 3 2 3"/>',
  sidebarLeftOpen: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M5 9l2 3-2 3"/>',
  sidebarRightClose: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m2-11 2 3-2 3"/>',
  sidebarRightOpen: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16m4-11-2 3 2 3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  play: '<path d="m9 6 9 6-9 6z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  previous: '<path d="M7 5v14M18 6l-8 6 8 6z"/>',
  next: '<path d="M17 5v14M6 6l8 6-8 6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bulb: '<path d="M9 18h6M10 21h4M8.4 14.5a6 6 0 1 1 7.2 0c-.8.6-1.1 1.3-1.1 2.5h-5c0-1.2-.3-1.9-1.1-2.5Z"/>',
  grid: '<path d="M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5M8 11h6"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5M8 11h6M11 8v6"/>',
  zoomFit: '<path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4"/><path d="M8 12h8"/>',
  reset: '<path d="M4 8V4h4M5 5a8 8 0 1 1-1 9"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const escapeHtml = value => String(value).replace(/[&<>"']/gu, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

app.innerHTML = `${workbenchTopbar({ projectName: "3D Scene" })}
<main class="scene-shell" data-preview="closed" data-assets-collapsed="false" data-inspector-collapsed="false">
  <canvas id="viewport" aria-label="3D Scene viewport"></canvas>
  <div class="viewport-vignette"></div><div class="scene-noise"></div>
  <div class="camera-target-prompt" data-camera-target-prompt hidden>
    <span>${icon("focus")}<strong data-camera-target-title>点击要拍摄的对象</strong></span>
    <button type="button" data-camera-target-cancel>${icon("close")}取消</button>
  </div>

  <div class="scene-workbar">
    <div class="scene-workbar-right">
      <button class="chrome-action" type="button" data-create-camera title="从当前自由视角创建相机">${icon("cameraView")}创建相机</button>
    </div>
  </div>

  <aside class="workspace-panel asset-panel" data-collapsed="false">
    <div class="panel-head"><strong>${icon("scene")}<span data-library-title>资产</span></strong><button class="icon-button" type="button" data-collapse="assets" title="收起资产" aria-label="收起左侧资产栏" aria-expanded="true">${icon("sidebarLeftClose")}</button></div>
    <nav class="asset-tabs" aria-label="资产类型" data-library-tabs><span class="asset-tabs-loading">读取中</span></nav>
    <label class="panel-search">${icon("search")}<input type="search" placeholder="搜索素材" autocomplete="off" spellcheck="false" data-library-search></label>
    <div class="asset-scroll" data-library-content><div class="asset-library-empty">正在读取场景资产库…</div></div>
  </aside>

  <aside class="workspace-panel inspector-panel" data-collapsed="false">
    <section class="hierarchy-section">
      <div class="panel-head"><strong>${icon("object")}对象</strong><button class="icon-button" type="button" data-collapse="inspector" title="收起对象与属性" aria-label="收起右侧对象与属性栏" aria-expanded="true">${icon("sidebarRightClose")}</button></div>
      <div class="hierarchy-body"><label class="panel-search object-search">${icon("search")}<input type="search" placeholder="搜索对象" autocomplete="off" spellcheck="false" data-object-search></label><div data-hierarchy></div></div>
    </section>
    <div class="panel-divider"></div>
    <section class="properties-section">
      <div class="panel-head"><strong>${icon("bulb")}属性</strong><span data-property-mode>对象</span></div>
      <div class="properties-body" data-properties></div>
    </section>
  </aside>

  <div class="scene-object-labels" data-object-labels aria-hidden="true"></div>
  <div class="toolrail" aria-label="对象工具">
    <button type="button" data-tool="select" aria-pressed="true" title="选择对象 · 0" aria-label="选择对象">${icon("select")}<span class="tool-label">选择 · 0</span></button>
    <button type="button" data-tool="translate" aria-pressed="false" title="移动对象 · 1" aria-label="移动对象">${icon("move")}<span class="tool-label">移动 · 1</span></button>
    <button type="button" data-tool="rotate" aria-pressed="false" title="旋转对象 · 2" aria-label="旋转对象">${icon("rotate")}<span class="tool-label">旋转 · 2</span></button>
    <button type="button" data-tool="scale" aria-pressed="false" title="缩放对象 · 3" aria-label="缩放对象">${icon("scale")}<span class="tool-label">缩放 · 3</span></button>
    <button type="button" data-ground-tool disabled title="落到地面 · G" aria-label="落到地面">${icon("ground")}<span class="tool-label">落到地面 · G</span></button>
    <button type="button" data-display-tools aria-expanded="false" title="显示辅助" aria-label="显示辅助">${icon("eye")}<span class="tool-label">显示</span></button>
    <div class="scene-display-menu" data-display-menu hidden>
      <label><span>地面</span><input type="checkbox" data-display-ground checked></label>
      <label><span>网格</span><input type="checkbox" data-display-grid checked></label>
      <label><span>对象名称</span><input type="checkbox" data-display-labels></label>
      <label><span>视角指示器</span><input type="checkbox" data-display-gizmo checked></label>
      <div class="scene-navigation-help"><strong>观察空间</strong><span><kbd>单击</kbd> 选择对象</span><span><kbd>双击 / F</kbd> 聚焦对象</span><span><kbd>左拖</kbd> 环绕当前视点</span><span><kbd>右拖</kbd> / <kbd>Shift+左拖</kbd> 平移</span><span><kbd>滚轮</kbd> 推进</span><span><kbd>WASD</kbd> 前后左右</span><span><kbd>Q / E</kbd> 下沉 / 上升</span><span><kbd>Shift</kbd> 加速漫游</span></div>
    </div>
  </div>

  <div class="scene-bottom-controls">
    <button class="preview-trigger" type="button" data-toggle-preview aria-pressed="false">${icon("play")}<strong data-preview-label>预演</strong></button>
  </div>
  <div class="orientation-gizmo" aria-label="视角方向">
    <i class="gizmo-origin"></i>
    <i class="gizmo-line gizmo-line--x" data-gizmo-line="x"></i><button class="gizmo-axis gizmo-axis--x" type="button" data-gizmo-axis="x" title="切换到 X 轴视图">X</button>
    <i class="gizmo-line gizmo-line--y" data-gizmo-line="y"></i><button class="gizmo-axis gizmo-axis--y" type="button" data-gizmo-axis="y" title="切换到顶部视图">Y</button>
    <i class="gizmo-line gizmo-line--z" data-gizmo-line="z"></i><button class="gizmo-axis gizmo-axis--z" type="button" data-gizmo-axis="z" title="切换到 Z 轴视图">Z</button>
  </div>

  <section id="scene-timeline" class="timeline-panel nle-timeline scene-nle-timeline" aria-label="动态预演时间线" inert>
    <footer class="nle-transport scene-preview-transport">
      <span class="transport-time" data-preview-transport-time>0:00.00 / 0:00.00</span>
      <div class="transport-center">
        <button class="icon-button" type="button" data-preview-previous title="上一帧">${icon("previous")}</button>
        <button class="transport-play" type="button" data-preview-play title="播放" aria-label="播放">${icon("play")}</button>
        <button class="icon-button" type="button" data-preview-next title="下一帧">${icon("next")}</button>
      </div>
      <div class="scene-transport-right">
        <div class="scene-view-select"><span>视角</span><div class="scene-select" data-scene-select="monitor"><button class="scene-select-trigger" type="button" data-scene-select-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="选择预演视角"><strong data-scene-select-label>跟随切镜</strong>${icon("chevron")}</button><div class="scene-select-menu" data-scene-select-menu role="listbox" aria-label="预演视角" hidden></div></div></div>
        <button class="icon-button timeline-collapse" type="button" data-collapse-timeline title="收起时间线" aria-label="收起时间线" aria-controls="scene-timeline" aria-expanded="true">${icon("chevron")}</button>
        <button class="icon-button" type="button" data-close-preview title="退出预演" aria-label="退出预演">${icon("close")}</button>
      </div>
    </footer>
    <header class="nle-timeline-toolbar">
      <div class="tool-trigger scene-performance-trigger"><span>动作</span><div class="scene-select" data-scene-select="performance"><button class="scene-select-trigger" type="button" data-scene-select-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="选择 Performance"><strong data-scene-select-label>—</strong>${icon("chevron")}</button><div class="scene-select-menu" data-scene-select-menu role="listbox" aria-label="Performance" hidden></div></div></div>
      <output class="timeline-timecode" data-preview-timecode>00:00:00:00</output>
      <div class="toolbar-space"></div>
      <div class="nle-zoom"><button class="icon-button" type="button" data-timeline-zoom-action="fit" title="适应内容">${icon("zoomFit")}</button><button class="icon-button" type="button" data-timeline-zoom-action="out" title="缩小">${icon("zoomOut")}</button><input type="range" min="0" max="100" step="1" value="0" data-timeline-zoom aria-label="时间线缩放"><button class="icon-button" type="button" data-timeline-zoom-action="in" title="放大">${icon("zoomIn")}</button></div>
      <span class="toolbar-separator"></span>
      <button class="export-button" type="button" data-scene-export-open>${icon("export")}<span>导出</span></button>
    </header>
    <div class="nle-timeline-scroll"><div class="nle-tracks" data-timeline></div></div>
    <div class="nle-timeline-zoom-strip" aria-label="时间线可视范围"><div class="nle-timeline-zoom-window" data-timeline-zoom-window><span class="nle-timeline-zoom-grip start" data-timeline-zoom-grip="start"></span><span class="nle-timeline-zoom-grip end" data-timeline-zoom-grip="end"></span></div></div>
    <dialog class="nle-export-dialog scene-export-dialog" data-scene-export-dialog>
      <form class="nle-export-form scene-export-form" data-scene-export-form>
        <header><div>${icon("export")}<strong>导出 3D 预演</strong></div><button type="button" data-scene-export-close aria-label="关闭">×</button></header>
        <div class="nle-export-fields scene-export-fields">
          <label><span>文件名</span><input name="fileName" type="text" maxlength="192" required data-scene-export-name></label>
          <label><span>输出视角</span><div class="scene-select" data-scene-select="export-view"><button class="scene-select-trigger" type="button" data-scene-select-trigger aria-haspopup="listbox" aria-expanded="false"><strong data-scene-select-label>跟随切镜</strong>${icon("chevron")}</button><div class="scene-select-menu" data-scene-select-menu role="listbox" aria-label="输出视角" hidden></div></div></label>
          <label><span>时间范围</span><div class="scene-select" data-scene-select="export-range"><button class="scene-select-trigger" type="button" data-scene-select-trigger aria-haspopup="listbox" aria-expanded="false"><strong data-scene-select-label>整个动作</strong>${icon("chevron")}</button><div class="scene-select-menu" data-scene-select-menu role="listbox" aria-label="时间范围" hidden></div></div></label>
          <fieldset><legend>输出尺寸</legend><label><span>宽度</span><input name="width" type="number" min="1" step="1" value="1920" required data-scene-export-width></label><b>×</b><label><span>高度</span><input name="height" type="number" min="1" step="1" value="1080" required data-scene-export-height></label></fieldset>
          <label><span>帧率</span><div class="scene-select" data-scene-select="export-rate"><button class="scene-select-trigger" type="button" data-scene-select-trigger aria-haspopup="listbox" aria-expanded="false"><strong data-scene-select-label>24 fps</strong>${icon("chevron")}</button><div class="scene-select-menu" data-scene-select-menu role="listbox" aria-label="输出帧率" hidden></div></div></label>
        </div>
        <section class="nle-export-status scene-export-status" data-scene-export-status hidden><div><span data-scene-export-status-label></span><strong data-scene-export-status-value></strong></div><progress data-scene-export-progress max="1" value="0"></progress><p data-scene-export-output></p></section>
        <footer><button class="secondary-button" type="button" data-scene-export-close>关闭</button><button class="secondary-button" type="button" data-scene-export-cancel hidden>取消导出</button><button class="export-button" type="submit" data-scene-export-start>${icon("export")}<span>开始导出</span></button></footer>
      </form>
    </dialog>
  </section>

  <button class="preview-trigger timeline-reveal" type="button" data-reveal-timeline aria-controls="scene-timeline" aria-expanded="false" hidden>${icon("chevron")}展开时间线</button>
  <button class="panel-launcher panel-launcher--assets" type="button" data-reveal="assets" title="打开资产" aria-label="打开左侧资产栏">${icon("sidebarLeftOpen")}</button>
  <button class="panel-launcher panel-launcher--inspector" type="button" data-reveal="inspector" title="打开对象与属性" aria-label="打开右侧对象与属性栏">${icon("sidebarRightOpen")}</button>
  <div class="scene-toast" data-toast-view></div>
  <div class="webgl-failure" hidden></div>
</main>`;
bindWorkbenchTopbar(app);

const shell = app.querySelector(".scene-shell");
const timelinePanel = app.querySelector("#scene-timeline");
const collapseTimeline = app.querySelector("[data-collapse-timeline]");
const revealTimeline = app.querySelector("[data-reveal-timeline]");
const canvas = app.querySelector("#viewport");
const hierarchy = app.querySelector("[data-hierarchy]");
const properties = app.querySelector("[data-properties]");
const toast = app.querySelector("[data-toast-view]");
const objectLabels = app.querySelector("[data-object-labels]");
const orientationGizmo = app.querySelector(".orientation-gizmo");
let renderer;
let thumbnailRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  thumbnailRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
} catch (error) {
  const failure = app.querySelector(".webgl-failure");
  failure.textContent = `Unable to create WebGL scene: ${error instanceof Error ? error.message : String(error)}`;
  failure.hidden = false;
  throw error;
}

for (const value of [renderer]) {
  value.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  value.shadowMap.enabled = true;
  value.shadowMap.type = THREE.PCFSoftShadowMap;
  value.outputColorSpace = THREE.SRGBColorSpace;
  value.toneMapping = THREE.ACESFilmicToneMapping;
  value.toneMappingExposure = 1.05;
}
thumbnailRenderer.setPixelRatio(1);
thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
thumbnailRenderer.toneMapping = THREE.ACESFilmicToneMapping;
thumbnailRenderer.toneMappingExposure = 1.12;
thumbnailRenderer.setClearColor(0x141519, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090a0c);
scene.fog = new THREE.FogExp2(0x090a0c, 0.009);
const authoredRoot = new THREE.Group();
scene.add(authoredRoot);

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1400);
camera.position.set(5.8, 3.4, 8.4);
const previewCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 1400);
previewCamera.position.set(0, 2.2, 7);
previewCamera.lookAt(0, 1, 0);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = .075;
orbit.enablePan = true;
orbit.screenSpacePanning = true;
orbit.zoomToCursor = true;
orbit.target.set(0, 1.25, 0);
orbit.minDistance = .3;
orbit.maxDistance = 800;
orbit.maxPolarAngle = Math.PI * .495;

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x151619, roughness: .96, metalness: 0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.012;
floor.receiveShadow = true;
scene.add(floor);
const gridFine = new THREE.GridHelper(1200, 1200, 0x777a82, 0x45484f);
gridFine.material.opacity = .68;
gridFine.material.transparent = true;
gridFine.material.depthWrite = false;
gridFine.material.fog = true;
scene.add(gridFine);
const gridMajor = new THREE.GridHelper(1200, 120, 0xa2a5ad, 0x686b73);
gridMajor.position.y = .002;
gridMajor.material.opacity = .58;
gridMajor.material.transparent = true;
gridMajor.material.depthWrite = false;
gridMajor.material.fog = true;
scene.add(gridMajor);

const hemi = new THREE.HemisphereLight(0xdde6f4, 0x17131a, 1.4);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffead8, 4.4);
key.position.set(5, 8, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -12; key.shadow.camera.right = 12; key.shadow.camera.top = 12; key.shadow.camera.bottom = -4;
key.shadow.bias = -.00035;
key.shadow.normalBias = .018;
key.shadow.radius = 2.5;
scene.add(key);
const fill = new THREE.DirectionalLight(0x93adff, 1.35);
fill.position.set(-5, 3, 4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x9abfff, 2.2);
rim.position.set(-4, 5, -6);
scene.add(rim);

const transform = new TransformControls(camera, canvas);
transform.setMode("translate");
transform.setSize(.74);
const transformHelper = transform.getHelper();
scene.add(transformHelper);
const loader = new GLTFLoader();
const objects = new Map();
let snapshot;
let selected;
let selectedKind = "object";
let selectedCameraId;
let toastTimer;
let activeLibraryCollection;
let currentLibrary;
let currentWorldEntryId;
let currentWorld;
let worldBackgroundTexture;
let activePerformancePreview;
let activePerformanceId;
let playbackTime = 0;
let previewPlaying = false;
let previousRenderTime;
let timelineSelection;
let monitorMode = "shot";
let monitoredCameraId;
let timelineWindowStart = 0;
let timelineWindowEnd = 1;
let timelineScrubPointer;
let timelineZoomDrag;
let poseRigHelper;
let cameraTargeting;
let mutation = Promise.resolve();
const pendingModelLoads = new Set();
let renderedLibraryKey;
let assetPlacement;
let viewportPointerGesture;
let editorGroundVisible = true;
let worldGroundVisible = true;
let objectLabelsVisible = false;
let selectionOutlineMeshes = [];
const selectionMaterialStates = new Map();
const heldNavigationKeys = new Set();
let previousNavigationTime;

function showToast(message) {
  toast.textContent = message;
  toast.dataset.visible = "true";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.dataset.visible = "false"; }, 2300);
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

function selectionReference() {
  if (selectedKind === "object" && selected !== undefined) return { kind: "object", id: selected.record.id };
  if (selectedKind === "camera" && selectedCameraId !== undefined) return { kind: "camera", id: selectedCameraId };
  return { kind: "environment" };
}

function updateSnapshot(path, body, options = {}) {
  const retainedSelection = options.selection ?? selectionReference();
  const operation = mutation.then(async () => {
    const value = await request(path, typeof body === "function" ? body() : body);
    loadSnapshot(value, retainedSelection);
    if (options.success) showToast(options.success);
    return value;
  }).catch(error => {
    showToast(error instanceof Error ? error.message : String(error));
    return undefined;
  });
  mutation = operation.then(() => undefined, () => undefined);
  return operation;
}

function transact(label, commands, options = {}) {
  if (snapshot === undefined) return Promise.resolve(undefined);
  return updateSnapshot("/api/scene/transaction", () => ({
    label,
    transaction: { revision: snapshot.project.revision, commands },
  }), options);
}

function transactView(commands, options = {}) {
  if (snapshot === undefined) return Promise.resolve(undefined);
  return updateSnapshot("/api/scene/view-transaction", () => ({
    transaction: { revision: snapshot.view.revision, commands },
  }), options);
}

function sceneTransform(entry) {
  return {
    position: { x: entry.group.position.x, y: entry.group.position.y, z: entry.group.position.z },
    rotation: {
      x: entry.group.quaternion.x,
      y: entry.group.quaternion.y,
      z: entry.group.quaternion.z,
      w: entry.group.quaternion.w,
    },
    scale: { x: entry.group.scale.x, y: entry.group.scale.y, z: entry.group.scale.z },
  };
}

function commitObjectTransform(entry, label = `调整 ${entry.record.name}`) {
  return transact(label, [{ kind: "object.transform.set", id: entry.record.id, transform: sceneTransform(entry) }], {
    selection: { kind: "object", id: entry.record.id },
  });
}

const thumbnailBackgrounds = new Map();
function thumbnailBackground(kind) {
  if (thumbnailBackgrounds.has(kind)) return thumbnailBackgrounds.get(kind);
  const surface = document.createElement("canvas");
  surface.width = 256;
  surface.height = 256;
  const context = surface.getContext("2d");
  const vertical = context.createLinearGradient(0, 0, 0, surface.height);
  vertical.addColorStop(0, kind === "person" ? "#08090c" : "#0d0f13");
  vertical.addColorStop(.54, kind === "person" ? "#11141a" : "#15181e");
  vertical.addColorStop(.72, kind === "person" ? "#303640" : "#252a32");
  vertical.addColorStop(1, "#0a0b0e");
  context.fillStyle = vertical;
  context.fillRect(0, 0, surface.width, surface.height);
  const pool = context.createRadialGradient(128, 184, 8, 128, 184, kind === "person" ? 132 : 154);
  pool.addColorStop(0, kind === "person" ? "rgba(198,207,224,.52)" : "rgba(145,158,184,.35)");
  pool.addColorStop(.42, kind === "person" ? "rgba(101,111,130,.22)" : "rgba(78,88,106,.16)");
  pool.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = pool;
  context.fillRect(0, 0, surface.width, surface.height);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  thumbnailBackgrounds.set(kind, texture);
  return texture;
}

function renderAssetThumbnail(canvas, resource, kind = "object") {
  loader.load(resource, value => {
    const previewScene = new THREE.Scene();
    previewScene.background = thumbnailBackground(kind);
    const root = value.scene;
    root.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; } });
    const initial = new THREE.Box3().setFromObject(root);
    if (initial.isEmpty()) return;
    const center = initial.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -initial.min.y, -center.z);
    previewScene.add(root);
    previewScene.add(new THREE.HemisphereLight(0xe8ecf4, 0x252832, 2.2));
    const light = new THREE.DirectionalLight(0xfff7ed, 3.5);
    light.position.set(-3, 5, 4); previewScene.add(light);
    const rim = new THREE.DirectionalLight(0x9aaee8, 1.35);
    rim.position.set(4, 3, -3); previewScene.add(rim);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, .4);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(radius * (kind === "person" ? .64 : .82), 48),
      new THREE.MeshStandardMaterial({ color: 0x292c33, roughness: .96 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.012;
    previewScene.add(floor);
    if (kind !== "person") {
      const previewGrid = new THREE.GridHelper(radius * 1.42, 8, 0x555963, 0x34373e);
      previewGrid.position.y = -.006;
      previewScene.add(previewGrid);
    } else {
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(radius * .35, 48),
        new THREE.MeshBasicMaterial({ color: 0x050608, transparent: true, opacity: .46, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.y = .42;
      shadow.position.set(0, .002, .05);
      previewScene.add(shadow);
    }
    const cameraValue = new THREE.PerspectiveCamera(kind === "person" ? 28 : 31, canvas.width / canvas.height, .01, 100);
    cameraValue.position.set(
      radius * (kind === "person" ? .56 : .62),
      Math.max(size.y * (kind === "person" ? .62 : .68), radius * .74),
      radius * (kind === "person" ? 2.42 : 2.25),
    );
    cameraValue.lookAt(0, size.y * (kind === "person" ? .46 : .43), 0);
    thumbnailRenderer.setSize(canvas.width, canvas.height, false);
    thumbnailRenderer.render(previewScene, cameraValue);
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(thumbnailRenderer.domElement, 0, 0, canvas.width, canvas.height);
  });
}

function libraryEntries(root, collection, search) {
  const candidates = currentLibrary.entries.filter(entry => entry.collections.includes(root.id));
  if (search.length > 0) {
    return candidates.filter(entry => [entry.label, entry.description ?? "", ...entry.tags]
      .some(value => value.toLocaleLowerCase().includes(search)));
  }
  return candidates.filter(entry => entry.collections.includes(collection.id));
}

function worldForEntry(entry) {
  const world = entry?.parameters?.world;
  return entry?.using?.name === "world-environment" && world && typeof world === "object" ? world : undefined;
}

function cameraPresetForEntry(entry) {
  const preset = entry?.parameters?.cameraPreset;
  return entry?.using?.name === "camera-preset" && preset && typeof preset === "object" ? preset : undefined;
}

function cameraPresetArtwork(entry, preset) {
  if (preset.targetMode === "current-view") {
    return `<span class="camera-preset-current">${icon("camera")}<i></i></span>`;
  }
  const framingScale = preset.framing === "close" ? 1.52 : preset.framing === "wide" ? .62 : 1;
  const yaw = Math.abs(Number(preset.yawDeg ?? 0));
  const side = yaw > 65 && yaw < 120;
  const rear = yaw > 140;
  const bodyWidth = (side ? 7 : 13) * framingScale;
  const bodyHeight = 27 * framingScale;
  const headRadius = 4.4 * framingScale;
  const centerX = preset.leadRoom ? 69 : 88;
  const baseline = preset.framing === "close" ? 105 : 91;
  const bodyTop = baseline - bodyHeight;
  const headY = bodyTop - headRadius * 1.55;
  const horizon = Math.round(67 + Number(preset.elevationDeg ?? 0) * .38);
  const roll = Number(preset.rollDeg ?? 0);
  const shoulder = preset.targetMode === "over-shoulder"
    ? '<ellipse cx="34" cy="92" rx="25" ry="28" fill="#393c44"/><circle cx="34" cy="65" r="13" fill="#484b54"/>'
    : "";
  const subjectColor = rear ? "#8790a2" : "#b2bac8";
  return `<svg viewBox="0 0 176 112" aria-hidden="true">
    <defs><linearGradient id="camera-sky-${escapeHtml(entry.id)}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#171a20"/><stop offset="1" stop-color="#2b3039"/></linearGradient></defs>
    <rect width="176" height="112" fill="url(#camera-sky-${escapeHtml(entry.id)})"/>
    <path d="M0 ${horizon}H176M16 112 78 ${horizon}M58 112 84 ${horizon}M118 112 92 ${horizon}M160 112 98 ${horizon}" stroke="#4a505b" stroke-width=".65" opacity=".58"/>
    <path d="M0 88H176M0 101H176" stroke="#444a54" stroke-width=".55" opacity=".42"/>
    <g transform="rotate(${roll} 88 58)">${shoulder}<ellipse cx="${centerX}" cy="${headY}" rx="${headRadius * (side ? .7 : 1)}" ry="${headRadius}" fill="${subjectColor}"/><path d="M${centerX - bodyWidth} ${bodyTop} Q${centerX} ${bodyTop - 5 * framingScale} ${centerX + bodyWidth} ${bodyTop} L${centerX + bodyWidth * .72} ${baseline}H${centerX - bodyWidth * .72}Z" fill="${subjectColor}"/><path d="M${centerX - bodyWidth * .55} ${baseline - 2}  ${centerX - bodyWidth * .42} ${baseline + 17 * framingScale}M${centerX + bodyWidth * .55} ${baseline - 2} ${centerX + bodyWidth * .42} ${baseline + 17 * framingScale}" stroke="${subjectColor}" stroke-width="${Math.max(2.2, 3.2 * framingScale)}" stroke-linecap="round"/></g>
    <path d="M12 12h16M12 12v12M164 12h-16M164 12v12M12 100h16M12 100V88M164 100h-16M164 100V88" stroke="#d6d9df" stroke-width="1" opacity=".58"/>
  </svg>`;
}

function worldBackground(top, horizon) {
  const canvasValue = document.createElement("canvas");
  canvasValue.width = 32; canvasValue.height = 256;
  const context = canvasValue.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, canvasValue.height);
  gradient.addColorStop(0, top); gradient.addColorStop(.72, horizon); gradient.addColorStop(1, horizon);
  context.fillStyle = gradient; context.fillRect(0, 0, canvasValue.width, canvasValue.height);
  const texture = new THREE.CanvasTexture(canvasValue);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function setGridVisible(visible, persist = false) {
  gridFine.visible = visible;
  gridMajor.visible = visible;
  const displayGrid = app.querySelector("[data-display-grid]");
  if (displayGrid) displayGrid.checked = visible;
  const worldGrid = properties.querySelector("[data-world-grid]");
  if (worldGrid) worldGrid.checked = visible;
  if (persist && snapshot !== undefined) {
    void transactView([{ kind: "grid.update", grid: { ...snapshot.view.grid, visible } }], {
      selection: selectionReference(),
    });
  }
}

function applyWorldEnvironment(world, label, entryId, refreshProperties = true) {
  worldBackgroundTexture?.dispose();
  worldBackgroundTexture = worldBackground(world.sky.top, world.sky.horizon);
  scene.background = worldBackgroundTexture;
  scene.fog.color.set(world.atmosphere.fogColor);
  scene.fog.density = world.atmosphere.fogDensity;
  worldGroundVisible = world.ground.visible;
  floor.visible = worldGroundVisible && editorGroundVisible;
  floorMaterial.color.set(world.ground.color);
  floorMaterial.opacity = world.ground.opacity;
  floorMaterial.transparent = world.ground.opacity < 1;
  hemi.color.set(world.lighting.ambient.sky);
  hemi.groundColor.set(world.lighting.ambient.ground);
  hemi.intensity = world.lighting.ambient.intensity;
  const azimuth = THREE.MathUtils.degToRad(world.lighting.key.azimuth);
  const elevation = THREE.MathUtils.degToRad(world.lighting.key.elevation);
  key.position.set(Math.cos(elevation) * Math.cos(azimuth) * 10, Math.sin(elevation) * 10, Math.cos(elevation) * Math.sin(azimuth) * 10);
  key.color.set(world.lighting.key.color); key.intensity = world.lighting.key.intensity; key.castShadow = world.lighting.key.shadows;
  key.shadow.radius = Number(world.lighting.key.softness ?? 2.5);
  fill.color.set(world.lighting.fill.color); fill.intensity = world.lighting.fill.intensity;
  rim.color.set(world.lighting.rim.color); rim.intensity = world.lighting.rim.intensity;
  renderer.toneMappingExposure = world.exposure;
  currentWorldEntryId = entryId;
  currentWorld = { label, world: structuredClone(world) };
  app.querySelectorAll("[data-library-entry]").forEach(card => card.setAttribute("aria-selected", String(card.dataset.libraryEntry === entryId)));
  if (refreshProperties && selectedKind === "environment") renderEnvironmentProperties();
}

function environmentEntry(environment = snapshot?.project.environment) {
  const path = environment?.parameters?.preset?.path;
  return typeof path === "string"
    ? currentLibrary?.entries.find(entry => entry.asset.path === path)
    : undefined;
}

function selectWorldEntry(entry) {
  const world = worldForEntry(entry);
  if (world === undefined) return;
  void transact(`切换环境：${entry.label}`, [{
    kind: "environment.replace",
    environment: {
      using: structuredClone(entry.using),
      parameters: { ...structuredClone(entry.parameters), preset: structuredClone(entry.asset) },
    },
  }], { selection: { kind: "environment" }, success: `已切换到${entry.label}世界环境` });
}

function editEnvironment(path, value) {
  if (snapshot === undefined) return Promise.resolve(undefined);
  return updateSnapshot("/api/scene/environment-parameter", () => ({
    revision: snapshot.project.revision,
    operation: { kind: "world.set", path, value },
  }), { selection: { kind: "environment" } });
}

function previewEnvironmentField(path, value) {
  if (currentWorld === undefined) return;
  const parts = path.split(".");
  let target = currentWorld.world;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = value;
  applyWorldEnvironment(currentWorld.world, currentWorld.label, currentWorldEntryId, false);
}

function assetCard(entry) {
  const world = worldForEntry(entry);
  const cameraPreset = cameraPresetForEntry(entry);
  const person = entry.collections.includes("people");
  if (cameraPreset !== undefined) {
    return `<article class="asset-card asset-card--camera" data-camera-preset="${escapeHtml(entry.id)}" role="button" tabindex="0" title="${escapeHtml(entry.label)}"><span class="asset-thumb"><span class="camera-preset-preview">${cameraPresetArtwork(entry, cameraPreset)}</span></span><strong>${escapeHtml(entry.label)}</strong></article>`;
  }
  const preview = world !== undefined
    ? `<span class="world-environment-preview" data-world-preview="${escapeHtml(entry.id)}"><i></i><b></b></span>`
    : entry.preview?.kind === "model"
    ? `<canvas width="160" height="160" data-asset-preview="${escapeHtml(entry.preview.resource)}" data-asset-kind="${person ? "person" : "object"}"></canvas>`
    : `<span class="asset-preview-missing">${icon("object")}</span>`;
  return `<article class="asset-card${world === undefined ? "" : " asset-card--world"}${person ? " asset-card--person" : ""}" data-library-entry="${escapeHtml(entry.id)}" aria-selected="${String(entry.id === currentWorldEntryId)}" title="${escapeHtml(entry.label)}"><span class="asset-thumb">${preview}</span><strong>${escapeHtml(entry.label)}</strong></article>`;
}

function renderLibraryContent() {
  const content = app.querySelector("[data-library-content]");
  const root = currentLibrary?.collections.find(collection => collection.id === activeLibraryCollection);
  if (root === undefined) { content.innerHTML = '<div class="asset-library-empty">这个 Library 没有可展示的分类</div>'; return; }
  const search = app.querySelector("[data-library-search]").value.trim().toLocaleLowerCase();
  const sections = search.length > 0 ? [{ id: root.id, label: "搜索结果", children: [] }] : (root.children.length > 0 ? root.children : [root]);
  const markup = sections.map(section => {
    const entries = libraryEntries(root, section, search);
    return entries.length === 0 ? "" : `<section class="asset-section"><div class="section-label"><span>${escapeHtml(section.label)}</span><span>${entries.length}</span></div><div class="asset-grid">${entries.map(assetCard).join("")}</div></section>`;
  }).join("");
  content.innerHTML = markup || `<div class="asset-library-empty">${search.length > 0 ? "没有匹配的资产" : "这个分类暂时为空"}</div>`;
  content.querySelectorAll("[data-asset-preview]").forEach(canvasValue => renderAssetThumbnail(canvasValue, canvasValue.dataset.assetPreview, canvasValue.dataset.assetKind));
  content.querySelectorAll("[data-world-preview]").forEach(previewValue => {
    const entry = currentLibrary.entries.find(candidate => candidate.id === previewValue.dataset.worldPreview);
    const world = worldForEntry(entry);
    if (world === undefined) return;
    previewValue.style.background = `linear-gradient(180deg, ${world.sky.top} 0%, ${world.sky.horizon} 66%, ${world.ground.color} 67%, ${world.ground.color} 100%)`;
    const sun = previewValue.querySelector("i");
    sun.style.left = `${50 + Math.sin(THREE.MathUtils.degToRad(world.lighting.key.azimuth)) * 26}%`;
    sun.style.top = `${66 - Math.max(0, world.lighting.key.elevation) * .62}%`;
    sun.style.background = world.lighting.key.color;
  });
  content.querySelectorAll(".asset-card--world").forEach(card => card.addEventListener("click", () => {
    const entry = currentLibrary.entries.find(candidate => candidate.id === card.dataset.libraryEntry);
    if (entry !== undefined) selectWorldEntry(entry);
  }));
  content.querySelectorAll("[data-library-entry]:not(.asset-card--world)").forEach(card => card.addEventListener("click", () => {
    const entry = currentLibrary.entries.find(candidate => candidate.id === card.dataset.libraryEntry);
    if (entry !== undefined) beginAssetPlacement(entry);
  }));
  content.querySelectorAll("[data-camera-preset]").forEach(card => {
    const apply = () => {
      const entry = currentLibrary.entries.find(candidate => candidate.id === card.dataset.cameraPreset);
      if (entry !== undefined) applyCameraPreset(entry);
    };
    card.addEventListener("click", apply);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); apply(); }
    });
  });
}

function objectId(entry) {
  let id = entry.id;
  let index = 2;
  while (snapshot?.project.objects.some(value => value.id === id)) {
    id = `${entry.id}-${index}`;
    index += 1;
  }
  return id;
}

function setPlacementMaterials(group, active) {
  group.traverse(object => {
    if (!object.isMesh || object.material === undefined) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (active) {
        if (material.userData.placementOpacity === undefined) material.userData.placementOpacity = material.opacity;
        if (material.userData.placementTransparent === undefined) material.userData.placementTransparent = material.transparent;
        if (material.userData.placementDepthWrite === undefined) material.userData.placementDepthWrite = material.depthWrite;
        material.transparent = true;
        material.opacity = Math.min(.62, material.userData.placementOpacity);
        material.depthWrite = false;
      } else if (material.userData.placementOpacity !== undefined) {
        material.opacity = material.userData.placementOpacity;
        material.transparent = material.userData.placementTransparent;
        material.depthWrite = material.userData.placementDepthWrite;
        delete material.userData.placementOpacity;
        delete material.userData.placementTransparent;
        delete material.userData.placementDepthWrite;
      }
      material.needsUpdate = true;
    }
  });
}

function placementGroundOffset(group) {
  const bounds = new THREE.Box3().setFromObject(group);
  return bounds.isEmpty() ? 0 : group.position.y - bounds.min.y;
}

function updateAssetPlacement(clientX, clientY) {
  if (assetPlacement === undefined) return false;
  const rect = canvas.getBoundingClientRect();
  pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const point = raycaster.ray.intersectPlane(assetPlacement.plane, assetPlacement.point);
  if (point === null) return false;
  assetPlacement.group.position.set(point.x, assetPlacement.groundOffset, point.z);
  return true;
}

function cancelAssetPlacement() {
  if (assetPlacement === undefined) return;
  authoredRoot.remove(assetPlacement.group);
  assetPlacement = undefined;
  shell.dataset.placingAsset = "false";
  orbit.enabled = selectedKind !== "camera" && shell.dataset.preview !== "open";
  app.querySelectorAll("[data-library-entry]").forEach(card => card.setAttribute("aria-current", "false"));
  showToast("已取消放置");
}

function beginAssetPlacement(entry) {
  if (snapshot === undefined) return;
  if (assetPlacement !== undefined) authoredRoot.remove(assetPlacement.group);
  const group = placeholder({ id: "__placement__", name: entry.label });
  setPlacementMaterials(group, true);
  authoredRoot.add(group);
  assetPlacement = {
    entry,
    group,
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    point: new THREE.Vector3(),
    groundOffset: placementGroundOffset(group),
    modelReady: false,
  };
  const rect = canvas.getBoundingClientRect();
  if (!updateAssetPlacement(rect.left + rect.width / 2, rect.top + rect.height / 2)) {
    group.position.set(orbit.target.x, assetPlacement.groundOffset, orbit.target.z);
  }
  shell.dataset.placingAsset = "true";
  transform.detach();
  transformHelper.visible = false;
  orbit.enabled = false;
  app.querySelectorAll("[data-library-entry]").forEach(card => card.setAttribute("aria-current", String(card.dataset.libraryEntry === entry.id)));
  showToast(`移动到场景中放置“${entry.label}” · Esc 取消`);
  if (entry.preview?.kind !== "model") return;
  const placement = assetPlacement;
  loader.load(entry.preview.resource, value => {
    if (assetPlacement !== placement) return;
    for (const child of [...group.children]) group.remove(child);
    value.scene.traverse(object => {
      object.userData.sceneObject = "__placement__";
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    group.add(value.scene);
    placement.groundOffset = placementGroundOffset(group);
    group.position.y = placement.groundOffset;
    setPlacementMaterials(group, true);
    placement.modelReady = true;
  });
}

function confirmAssetPlacement() {
  if (assetPlacement === undefined || snapshot === undefined) return;
  const placement = assetPlacement;
  const { entry, group } = placement;
  const id = objectId(entry);
  const object = {
    id,
    name: entry.label,
    using: structuredClone(entry.using),
    transform: {
      position: { x: group.position.x, y: group.position.y, z: group.position.z },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
    enabled: true,
    parameters: { asset: structuredClone(entry.asset) },
  };
  assetPlacement = undefined;
  shell.dataset.placingAsset = "false";
  setPlacementMaterials(group, false);
  group.userData.sceneObject = id;
  group.traverse(value => { value.userData.sceneObject = id; });
  const optimisticRecord = { ...object, preview: entry.preview, editorVisible: true, editable: true };
  objects.set(id, {
    record: optimisticRecord,
    group,
    modelResource: entry.preview?.kind === "model" ? entry.preview.resource : undefined,
    modelLoaded: placement.modelReady,
    modelLoading: false,
  });
  selectObject(id);
  app.querySelectorAll("[data-library-entry]").forEach(card => card.setAttribute("aria-current", "false"));
  void transact(`添加对象：${entry.label}`, [{ kind: "object.add", object }], {
    selection: { kind: "object", id },
    success: `已放置：${entry.label}`,
  }).then(value => {
    if (value !== undefined) return;
    const optimistic = objects.get(id);
    if (optimistic?.group === group) {
      authoredRoot.remove(group);
      objects.delete(id);
      selectEnvironment();
    }
  });
}

function renderLibrary(libraries) {
  currentLibrary = libraries[0];
  const tabs = app.querySelector("[data-library-tabs]");
  if (currentLibrary === undefined) {
    tabs.innerHTML = '<span class="asset-tabs-loading">无资产库</span>';
    app.querySelector("[data-library-content]").innerHTML = '<div class="asset-library-empty">Scene 没有引用资产 Library</div>';
    return;
  }
  activeLibraryCollection = currentLibrary.collections[0]?.id;
  tabs.style.setProperty("--asset-tab-count", String(Math.max(1, currentLibrary.collections.length)));
  tabs.innerHTML = currentLibrary.collections.map((collection, index) => `<button type="button" data-library-collection="${escapeHtml(collection.id)}" aria-selected="${String(index === 0)}" title="${escapeHtml(collection.label)}">${icon(icons[collection.icon] === undefined ? "object" : collection.icon)}</button>`).join("");
  tabs.querySelectorAll("[data-library-collection]").forEach(button => button.addEventListener("click", () => {
    activeLibraryCollection = button.dataset.libraryCollection;
    tabs.querySelectorAll("[data-library-collection]").forEach(candidate => candidate.setAttribute("aria-selected", String(candidate === button)));
    app.querySelector("[data-library-search]").placeholder = `搜索素材 · ${button.title}`;
    renderLibraryContent();
  }));
  app.querySelector("[data-library-search]").placeholder = `搜索素材 · ${currentLibrary.collections[0]?.label ?? "全部"}`;
  renderLibraryContent();
}

function cameraPose(cameraValue) {
  return {
    position: { x: cameraValue.position.x, y: cameraValue.position.y, z: cameraValue.position.z },
    rotation: { x: cameraValue.quaternion.x, y: cameraValue.quaternion.y, z: cameraValue.quaternion.z, w: cameraValue.quaternion.w },
  };
}

const cameraSensorWidthMm = 36;

function cameraAspect(lens) {
  const numerator = Number(lens.aspect?.numerator ?? 16);
  const denominator = Number(lens.aspect?.denominator ?? 9);
  return numerator > 0 && denominator > 0 ? numerator / denominator : 16 / 9;
}

function focalLengthForLens(lens) {
  const sensorHeight = cameraSensorWidthMm / cameraAspect(lens);
  return sensorHeight / (2 * Math.tan(THREE.MathUtils.degToRad(lens.fov) / 2));
}

function fovForFocalLength(focalLengthMm, lens) {
  const sensorHeight = cameraSensorWidthMm / cameraAspect(lens);
  return THREE.MathUtils.radToDeg(2 * Math.atan(sensorHeight / (2 * focalLengthMm)));
}

function cameraId() {
  let index = (snapshot?.project.cameras.length ?? 0) + 1;
  while (snapshot?.project.cameras.some(value => value.id === `camera-${index}`)) index += 1;
  return `camera-${index}`;
}

function applyCameraRecordToPreview(record) {
  previewCamera.position.set(record.pose.position.x, record.pose.position.y, record.pose.position.z);
  previewCamera.quaternion.set(record.pose.rotation.x, record.pose.rotation.y, record.pose.rotation.z, record.pose.rotation.w).normalize();
  previewCamera.fov = record.lens.fov;
  previewCamera.updateProjectionMatrix();
}

function commitGeneratedCamera(name, cameraValue, fov, provenance) {
  if (snapshot === undefined) return;
  const id = cameraId();
  const record = {
    id,
    name,
    pose: cameraPose(cameraValue),
    lens: { fov, aspect: { numerator: 16, denominator: 9 } },
  };
  void transact(`生成机位：${name}`, [{ kind: "camera.add", camera: record }], {
    selection: { kind: "camera", id },
    success: `已生成机位：${name}`,
  });
}

function subjectBounds(entry) {
  const box = new THREE.Box3().setFromObject(entry.group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { box, size, center, height: Math.max(size.y, .5), radius: Math.max(size.x, size.z, size.y * .45, .35) };
}

function generateSubjectCamera(presetEntry, subject) {
  const preset = cameraPresetForEntry(presetEntry);
  if (preset === undefined) return;
  const bounds = subjectBounds(subject);
  const fov = Number(preset.fov ?? 40);
  const target = bounds.center.clone();
  target.y = bounds.box.min.y + bounds.height * Number(preset.focusY ?? .55);
  if (preset.leadRoom) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(subject.group.getWorldQuaternion(new THREE.Quaternion()));
    target.addScaledVector(forward, bounds.radius * Number(preset.leadRoom));
  }
  const yaw = THREE.MathUtils.degToRad(Number(preset.yawDeg ?? 0) + THREE.MathUtils.radToDeg(subject.group.rotation.y));
  const elevation = THREE.MathUtils.degToRad(Number(preset.elevationDeg ?? 0));
  const visibleHeight = bounds.height * (preset.framing === "close" ? .45 : preset.framing === "wide" ? .72 : .36);
  const fitDistance = visibleHeight / Math.max(.2, 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  // 中近景由身体高度决定距离，避免 T Pose 的臂展把人物错误地缩成全景。
  // 全景仍需容纳对象的完整横向范围。
  const widthClearance = preset.framing === "wide" ? bounds.radius * 1.15 : Math.min(bounds.radius, bounds.height * .5);
  const distance = Math.max(widthClearance, fitDistance * Number(preset.distanceScale ?? 1.3));
  const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation));
  const generated = new THREE.PerspectiveCamera(fov, 16 / 9, .01, 1000);
  generated.position.copy(target).addScaledVector(direction, distance);
  generated.position.y = Math.max(.12, generated.position.y);
  generated.lookAt(target);
  generated.rotateZ(THREE.MathUtils.degToRad(Number(preset.rollDeg ?? 0)));
  generated.updateMatrixWorld();
  commitGeneratedCamera(`${presetEntry.label} · ${subject.record.name}`, generated, fov, { preset: presetEntry.id, subject: subject.record.id });
}

function generateOverShoulderCamera(presetEntry, foreground, focus) {
  const preset = cameraPresetForEntry(presetEntry);
  if (preset === undefined) return;
  const foregroundBounds = subjectBounds(foreground);
  const focusBounds = subjectBounds(focus);
  const target = focusBounds.center.clone();
  target.y = focusBounds.box.min.y + focusBounds.height * Number(preset.focusY ?? .62);
  const foregroundPoint = foregroundBounds.center.clone();
  foregroundPoint.y = foregroundBounds.box.min.y + foregroundBounds.height * .72;
  const backward = foregroundPoint.clone().sub(target); backward.y = 0;
  if (backward.lengthSq() < .0001) backward.set(0, 0, 1);
  backward.normalize();
  const side = new THREE.Vector3(-backward.z, 0, backward.x);
  const fov = Number(preset.fov ?? 38);
  const generated = new THREE.PerspectiveCamera(fov, 16 / 9, .01, 1000);
  generated.position.copy(foregroundPoint)
    .addScaledVector(backward, foregroundBounds.radius * Number(preset.distanceScale ?? .72))
    .addScaledVector(side, foregroundBounds.radius * .34);
  generated.position.y += foregroundBounds.height * .06;
  generated.lookAt(target);
  generated.updateMatrixWorld();
  commitGeneratedCamera(`${presetEntry.label} · ${foreground.record.name}`, generated, fov, { preset: presetEntry.id, foreground: foreground.record.id, focus: focus.record.id });
}

function updateCameraTargetPrompt(message) {
  const prompt = app.querySelector("[data-camera-target-prompt]");
  prompt.hidden = false;
  prompt.querySelector("[data-camera-target-title]").textContent = message;
  shell.dataset.cameraTargeting = "true";
}

function cancelCameraTargeting() {
  cameraTargeting = undefined;
  shell.dataset.cameraTargeting = "false";
  app.querySelector("[data-camera-target-prompt]").hidden = true;
}

function beginCameraTargeting(entry, foreground) {
  const preset = cameraPresetForEntry(entry);
  if (preset === undefined) return;
  clearPoseRigHelper();
  transform.detach();
  transformHelper.visible = false;
  if (preset.targetMode === "over-shoulder") {
    cameraTargeting = { entry, stage: foreground === undefined ? "foreground" : "focus", foreground };
    updateCameraTargetPrompt(foreground === undefined ? "先点击前景角色" : `再点击 ${foreground.record.name} 注视的对象`);
  } else {
    cameraTargeting = { entry, stage: "subject" };
    updateCameraTargetPrompt(`点击要使用“${entry.label}”拍摄的对象`);
  }
}

function applyCameraPreset(entry) {
  const preset = cameraPresetForEntry(entry);
  if (preset === undefined) return;
  if (preset.targetMode === "current-view") {
    commitGeneratedCamera(entry.label, camera, camera.fov, { preset: entry.id });
    return;
  }
  if (preset.targetMode === "over-shoulder") {
    beginCameraTargeting(entry, selectedKind === "object" ? selected : undefined);
    return;
  }
  if (selectedKind === "object" && selected !== undefined) generateSubjectCamera(entry, selected);
  else beginCameraTargeting(entry);
}

function placeholder(record) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x9ca0a8, roughness: .72 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xd0d3d8, transparent: true, opacity: .36 })));
  group.userData.sceneObject = record.id;
  group.traverse(value => { value.userData.sceneObject = record.id; });
  return group;
}

function applyTransform(group, value) {
  group.position.set(value.position.x, value.position.y, value.position.z);
  group.quaternion.set(value.rotation.x, value.rotation.y, value.rotation.z, value.rotation.w).normalize();
  group.scale.set(value.scale.x, value.scale.y, value.scale.z);
}

function previewRate() {
  return activePerformancePreview === undefined ? 24
    : activePerformancePreview.editRate.numerator / activePerformancePreview.editRate.denominator;
}

function previewDuration() {
  return activePerformancePreview === undefined ? 0 : activePerformancePreview.durationFrames / previewRate();
}

function activePerformance() {
  return snapshot?.project.performances.find(entry => entry.id === activePerformanceId);
}

function temporalSeconds(value) {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function timelineWindow() {
  return { start: timelineWindowStart, end: timelineWindowEnd, span: timelineWindowEnd - timelineWindowStart };
}

const widestTimelineWindow = 4;
const narrowestTimelineWindow = () => 1 / Math.max(1, activePerformancePreview?.durationFrames ?? 1);

function timelinePlayheadFraction() {
  const shown = timelineWindow();
  const progress = previewDuration() <= 0 ? 0 : playbackTime / previewDuration();
  return Math.max(0, Math.min(1, (progress - shown.start) / Math.max(1e-6, shown.span)));
}

function sceneSelect(kind) {
  return app.querySelector(`[data-scene-select="${kind}"]`);
}

function renderSceneSelect(kind, options, value, disableSingle = false) {
  const root = sceneSelect(kind);
  if (root === null) return;
  const selected = options.find(option => option.value === value) ?? options[0];
  root.dataset.value = selected?.value ?? "";
  root.querySelector("[data-scene-select-label]").textContent = selected?.label ?? "—";
  const trigger = root.querySelector("[data-scene-select-trigger]");
  trigger.disabled = options.length === 0 || disableSingle && options.length < 2;
  root.querySelector("[data-scene-select-menu]").innerHTML = options.map(option => `<button type="button" role="option" data-scene-select-option="${escapeHtml(option.value)}" aria-selected="${String(option.value === selected?.value)}"><span>${escapeHtml(option.label)}</span></button>`).join("");
}

function syncSceneSelect(kind, value) {
  const root = sceneSelect(kind);
  if (root === null) return;
  const option = root.querySelector(`[data-scene-select-option="${CSS.escape(value)}"]`);
  if (option === null) return;
  root.dataset.value = value;
  root.querySelector("[data-scene-select-label]").textContent = option.textContent;
  for (const candidate of root.querySelectorAll("[data-scene-select-option]")) {
    candidate.setAttribute("aria-selected", String(candidate === option));
  }
}

function setSceneSelectOpen(root, open, focusSelected = false) {
  const menu = root.querySelector("[data-scene-select-menu]");
  const trigger = root.querySelector("[data-scene-select-trigger]");
  const next = open && !trigger.disabled;
  menu.hidden = !next;
  trigger.setAttribute("aria-expanded", String(next));
  root.classList.toggle("open", next);
  if (next && focusSelected) {
    (menu.querySelector('[aria-selected="true"]') ?? menu.querySelector("[data-scene-select-option]"))?.focus();
  }
}

function closeSceneSelects(except) {
  for (const root of app.querySelectorAll("[data-scene-select]")) {
    if (root !== except) setSceneSelectOpen(root, false);
  }
}

function updateMonitorChrome() {
  if (monitorMode === "camera" && !snapshot?.scene.cameras.some(entry => entry.id === monitoredCameraId)) {
    monitorMode = "shot";
    monitoredCameraId = undefined;
  }
  shell.dataset.monitorMode = monitorMode;
  syncSceneSelect("monitor", monitorMode === "camera" && monitoredCameraId !== undefined
    ? `camera:${monitoredCameraId}` : "follow");
}

function setMonitorMode(mode, cameraId = monitoredCameraId) {
  if (mode !== "shot" && mode !== "camera") return;
  if (mode === "camera") {
    if (cameraId === undefined || !snapshot?.scene.cameras.some(entry => entry.id === cameraId)) return;
    monitoredCameraId = cameraId;
  }
  monitorMode = mode;
  updateMonitorChrome();
  if (shell.dataset.preview === "open") applyPerformanceTime(playbackTime);
}

function syncTimelineZoomChrome() {
  const shown = timelineWindow();
  const minimum = narrowestTimelineWindow();
  const range = Math.log(widestTimelineWindow / minimum);
  const input = app.querySelector("[data-timeline-zoom]");
  if (input) input.value = String(Math.round((range === 0 ? 0 : Math.max(0, Math.min(1,
    Math.log(widestTimelineWindow / shown.span) / range))) * 100));
}

function settleTimelineWindow(start, end) {
  const span = Math.max(narrowestTimelineWindow(), Math.min(widestTimelineWindow, end - start));
  timelineWindowStart = Math.max(0, Math.min(widestTimelineWindow - span, start));
  timelineWindowEnd = timelineWindowStart + span;
  syncTimelineZoomChrome();
  if (snapshot !== undefined) populateTimeline(snapshot);
  updatePlaybackChrome();
}

function pinchTimelineZoom(anchor, factor) {
  const shown = timelineWindow();
  const held = shown.start + shown.span * Math.max(0, Math.min(1, anchor));
  const wanted = Math.max(narrowestTimelineWindow(), Math.min(widestTimelineWindow, shown.span * factor));
  settleTimelineWindow(held - wanted * anchor, held + wanted * (1 - anchor));
}

function slideTimelineWindow(by) {
  const shown = timelineWindow();
  settleTimelineWindow(shown.start + by * shown.span, shown.end + by * shown.span);
}

function setTimelineZoom(value) {
  const wanted = widestTimelineWindow * Math.pow(
    narrowestTimelineWindow() / widestTimelineWindow,
    Math.max(0, Math.min(100, Number(value))) / 100,
  );
  pinchTimelineZoom(timelinePlayheadFraction(), wanted / timelineWindow().span);
}

function seekPreview(time) {
  previewPlaying = false;
  previousRenderTime = undefined;
  playbackTime = Math.max(0, Math.min(Math.max(0, previewDuration() - 1 / previewRate()), time));
  applyPerformanceTime(playbackTime);
}

function switchPerformance(id) {
  if (!snapshot?.project.performances.some(entry => entry.id === id)) return;
  activePerformanceId = id;
  activePerformancePreview = snapshot.performancePreviews?.find(entry => entry.performance === id);
  timelineSelection = undefined;
  monitoredCameraId = undefined;
  monitorMode = "shot";
  timelineWindowStart = 0;
  timelineWindowEnd = 1;
  playbackTime = 0;
  previewPlaying = false;
  previousRenderTime = undefined;
  populateTimeline(snapshot);
  updateMonitorChrome();
  if (shell.dataset.preview === "open") applyPerformanceTime(0);
  else updatePlaybackChrome();
}

function sceneExportRangeOptions() {
  const options = [{ value: "performance", label: "整个动作" }];
  const performance = activePerformance();
  if (performance === undefined || timelineSelection?.performance !== performance.id) return options;
  if (timelineSelection.kind === "shot") {
    const shot = performance.shots.find(entry => entry.id === timelineSelection.id);
    if (shot) options.push({ value: `shot:${shot.id}`, label: `所选镜头 · ${shot.name}` });
  }
  if (timelineSelection.kind === "item") {
    const item = performance.tracks.flatMap(track => track.items).find(entry => entry.id === timelineSelection.id);
    if (item) options.push({ value: `item:${item.id}`, label: `所选片段 · ${item.name}` });
  }
  return options;
}

function sceneExportAspect() {
  const cameraValue = monitorMode === "camera"
    ? snapshot?.scene.cameras.find(entry => entry.id === monitoredCameraId)
    : snapshot?.scene.cameras[0];
  return cameraValue?.lens.aspect ?? { numerator: 16, denominator: 9 };
}

const sceneExportProgressCopy = {
  open: ["正在打开无界面预演", "准备"],
  record: ["正在录制相机输出", "录制"],
  encode: ["正在编码 H.264", "编码"],
  publish: ["正在发布项目素材", "Media Asset"],
};
let sceneExportPollTimer;

function renderSceneExportState(job) {
  const form = app.querySelector("[data-scene-export-form]");
  const running = job.state === "running";
  const status = form.querySelector("[data-scene-export-status]");
  const label = form.querySelector("[data-scene-export-status-label]");
  const value = form.querySelector("[data-scene-export-status-value]");
  const output = form.querySelector("[data-scene-export-output]");
  const progress = form.querySelector("[data-scene-export-progress]");
  const start = form.querySelector("[data-scene-export-start]");
  const cancel = form.querySelector("[data-scene-export-cancel]");
  status.hidden = job.state === "idle";
  start.hidden = running;
  cancel.hidden = !running;
  start.querySelector("span").textContent = job.state === "complete" ? "再次导出" : "开始导出";
  for (const control of form.querySelectorAll("input,[data-scene-select-trigger]")) control.disabled = running;
  if (job.state === "idle") {
    label.textContent = "";
    value.textContent = "";
    output.textContent = "";
    progress.max = 1;
    progress.value = 0;
    return;
  }
  if (running) {
    const copy = sceneExportProgressCopy[job.progress?.phase] ?? ["正在导出", "处理中"];
    label.textContent = copy[0];
    value.textContent = copy[1];
    progress.removeAttribute("value");
    output.textContent = job.progress?.duration ? `录制范围 ${job.progress.duration.toFixed(2)} 秒` : "";
    return;
  }
  progress.max = 1;
  progress.value = job.state === "complete" ? 1 : 0;
  if (job.state === "complete") {
    label.textContent = "已添加到项目素材";
    value.textContent = `${job.output.width}×${job.output.height} · ${job.output.duration.toFixed(2)} 秒`;
    output.textContent = job.output.asset;
  } else {
    label.textContent = job.state === "cancelled" ? "导出已取消" : "导出失败";
    value.textContent = "";
    output.textContent = job.error ?? "";
  }
}

async function pollSceneExportState() {
  clearTimeout(sceneExportPollTimer);
  const dialog = app.querySelector("[data-scene-export-dialog]");
  if (!dialog.open) return;
  try {
    const job = await request("/api/scene/export");
    renderSceneExportState(job);
    if (job.state === "running") sceneExportPollTimer = setTimeout(() => { void pollSceneExportState(); }, 350);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  }
}

async function openSceneExportDialog() {
  if (snapshot === undefined || activePerformanceId === undefined) return;
  const dialog = app.querySelector("[data-scene-export-dialog]");
  const form = app.querySelector("[data-scene-export-form]");
  form.querySelector("[data-scene-export-name]").value = `${snapshot.project.id}.mp4`;
  renderSceneSelect("export-view", [
    { value: "follow", label: "跟随切镜" },
    ...snapshot.scene.cameras.map(cameraValue => ({ value: `camera:${cameraValue.id}`, label: cameraValue.name })),
  ], monitorMode === "camera" && monitoredCameraId !== undefined ? `camera:${monitoredCameraId}` : "follow");
  const ranges = sceneExportRangeOptions();
  renderSceneSelect("export-range", ranges, ranges.at(-1)?.value ?? "performance");
  const currentRate = Math.round(previewRate());
  const rates = [24, 25, 30, 60];
  if (!rates.includes(currentRate)) rates.push(currentRate);
  renderSceneSelect("export-rate", rates.sort((left, right) => left - right).map(rate => ({ value: String(rate), label: `${rate} fps` })), String(currentRate));
  const aspect = sceneExportAspect();
  const scale = Math.max(1, Math.round(1920 / aspect.numerator));
  form.querySelector("[data-scene-export-width]").value = String(aspect.numerator * scale);
  form.querySelector("[data-scene-export-height]").value = String(aspect.denominator * scale);
  dialog.showModal();
  await pollSceneExportState();
}

function updatePlaybackChrome() {
  syncTimelineZoomChrome();
  const rate = previewRate();
  const seconds = Math.floor(playbackTime);
  const frame = Math.floor((playbackTime - seconds) * rate + 1e-6);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  app.querySelector("[data-preview-timecode]").textContent = `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(frame).padStart(2, "0")}`;
  const duration = previewDuration();
  const compactTime = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}.${String(Math.floor(value % 1 * 100)).padStart(2, "0")}`;
  app.querySelector("[data-preview-transport-time]").textContent = `${compactTime(playbackTime)} / ${compactTime(duration)}`;
  const globalProgress = duration <= 0 ? 0 : playbackTime / duration;
  const window = timelineWindow();
  const visibleProgress = (globalProgress - window.start) / window.span;
  const timeline = app.querySelector("[data-timeline]");
  const playheadPosition = `${Math.max(0, Math.min(1, visibleProgress)) * 100}%`;
  const outside = visibleProgress < 0 || visibleProgress > 1;
  for (const node of timeline.querySelectorAll(".nle-playhead,.nle-playhead-grip")) {
    node.style.left = playheadPosition;
    node.classList.toggle("outside", outside);
  }
  const zoomWindow = app.querySelector("[data-timeline-zoom-window]");
  if (zoomWindow) {
    zoomWindow.style.left = `${window.start / widestTimelineWindow * 100}%`;
    zoomWindow.style.width = `${window.span / widestTimelineWindow * 100}%`;
  }
  const button = app.querySelector("[data-preview-play]");
  button.innerHTML = icon(previewPlaying ? "pause" : "play");
  button.title = previewPlaying ? "暂停" : "播放";
  button.setAttribute("aria-label", button.title);
  const previewTriggerIcon = app.querySelector("[data-toggle-preview] .icon");
  if (previewTriggerIcon) previewTriggerIcon.outerHTML = icon(previewPlaying ? "pause" : "play");
  document.body.dataset.sceneTime = playbackTime.toFixed(4);
  document.body.dataset.sceneDuration = duration.toFixed(4);
  updateMonitorChrome();
}

function applyBaseSceneState() {
  if (snapshot === undefined) return;
  for (const record of snapshot.scene.objects) {
    const entry = objects.get(record.id);
    if (entry !== undefined) {
      applyTransform(entry.group, record.transform);
      entry.mixer?.setTime(0);
    }
  }
  const authoredCamera = snapshot.scene.cameras[0];
  if (authoredCamera !== undefined) {
    previewCamera.position.set(authoredCamera.pose.position.x, authoredCamera.pose.position.y, authoredCamera.pose.position.z);
    previewCamera.quaternion.set(
      authoredCamera.pose.rotation.x, authoredCamera.pose.rotation.y,
      authoredCamera.pose.rotation.z, authoredCamera.pose.rotation.w,
    ).normalize();
    previewCamera.fov = authoredCamera.lens.fov;
    previewCamera.updateProjectionMatrix();
  }
}

function interpolateVector(target, left, right, amount) {
  target.set(left.x, left.y, left.z).lerp(new THREE.Vector3(right.x, right.y, right.z), amount);
}

function interpolateQuaternion(target, left, right, amount) {
  target.set(left.x, left.y, left.z, left.w).normalize().slerp(
    new THREE.Quaternion(right.x, right.y, right.z, right.w).normalize(), amount,
  );
}

function applyPerformanceTime(time) {
  const preview = activePerformancePreview;
  if (preview === undefined || preview.frames.length === 0) return;
  const rate = previewRate();
  const position = Math.min(Math.max(0, time * rate), preview.frames.length - 1);
  const leftIndex = Math.floor(position);
  const rightIndex = Math.min(preview.frames.length - 1, leftIndex + 1);
  const amount = position - leftIndex;
  const left = preview.frames[leftIndex];
  const right = preview.frames[rightIndex];
  for (const [id, state] of Object.entries(left.objects)) {
    const entry = objects.get(id);
    const next = right.objects[id] ?? state;
    if (entry === undefined) continue;
    interpolateVector(entry.group.position, state.transform.position, next.transform.position, amount);
    interpolateQuaternion(entry.group.quaternion, state.transform.rotation, next.transform.rotation, amount);
    interpolateVector(entry.group.scale, state.transform.scale, next.transform.scale, amount);
    entry.mixer?.setTime(time);
  }
  const cameraId = monitorMode === "camera" && monitoredCameraId !== undefined
    ? monitoredCameraId
    : left.activeCamera ?? Object.keys(left.cameras)[0];
  const cameraState = left.cameras[cameraId];
  const nextCamera = monitorMode === "camera"
    ? right.cameras[cameraId] ?? cameraState
    : right.activeCamera === cameraId ? right.cameras[cameraId] : cameraState;
  if (cameraState !== undefined && nextCamera !== undefined) {
    interpolateVector(previewCamera.position, cameraState.pose.position, nextCamera.pose.position, amount);
    interpolateQuaternion(previewCamera.quaternion, cameraState.pose.rotation, nextCamera.pose.rotation, amount);
    previewCamera.fov = THREE.MathUtils.lerp(cameraState.lens.fov, nextCamera.lens.fov, amount);
    previewCamera.updateProjectionMatrix();
  }
  updatePlaybackChrome();
}

function objectBoundingSphere(entry, target = new THREE.Sphere()) {
  if (entry?.group === undefined) return undefined;
  const box = new THREE.Box3().setFromObject(entry.group);
  if (box.isEmpty()) return undefined;
  return box.getBoundingSphere(target);
}

function frameObject(entry = selected) {
  const sphere = objectBoundingSphere(entry);
  if (sphere === undefined) return;
  const direction = camera.position.clone().sub(orbit.target).normalize();
  orbit.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(direction.multiplyScalar(Math.max(sphere.radius * 3.4, 2.4)));
  orbit.update();
}

const selectionOutlineMaterial = new THREE.MeshBasicMaterial({
  color: 0xff6f92,
  side: THREE.BackSide,
  transparent: true,
  opacity: .9,
  depthWrite: false,
  toneMapped: false,
  fog: false,
});

function clearSelectionHighlight() {
  for (const outline of selectionOutlineMeshes) outline.removeFromParent();
  selectionOutlineMeshes = [];
  for (const [material, state] of selectionMaterialStates) {
    material.emissive.copy(state.emissive);
    material.emissiveIntensity = state.emissiveIntensity;
  }
  selectionMaterialStates.clear();
}

function updateSelectionHighlight() {
  clearSelectionHighlight();
  if (selectedKind !== "object" || selected?.group === undefined || shell.dataset.preview === "open") return;
  const meshes = [];
  selected.group.traverse(object => {
    if (object.isMesh && object.geometry !== undefined && object.userData.selectionOutline !== true) meshes.push(object);
  });
  for (const mesh of meshes) {
    const outline = new THREE.Mesh(mesh.geometry, selectionOutlineMaterial);
    outline.name = "Selection outline";
    outline.scale.setScalar(1.018);
    outline.renderOrder = 30;
    outline.frustumCulled = false;
    outline.userData.selectionOutline = true;
    outline.raycast = () => undefined;
    mesh.add(outline);
    selectionOutlineMeshes.push(outline);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material?.emissive === undefined || selectionMaterialStates.has(material)) continue;
      selectionMaterialStates.set(material, {
        emissive: material.emissive.clone(),
        emissiveIntensity: material.emissiveIntensity,
      });
      material.emissive.set(0xff456f);
      material.emissiveIntensity = .075;
    }
  }
}

function groundSelectedObject() {
  if (!selected?.group) return;
  const box = new THREE.Box3().setFromObject(selected.group);
  selected.group.position.y -= box.min.y;
  const entry = selected;
  renderObjectProperties(entry);
  void commitObjectTransform(entry, `将 ${entry.record.name} 落到地面`).then(value => {
    if (value !== undefined) showToast("已落到地面");
  });
}

const objectLabelNodes = new Map();
function updateObjectLabels() {
  objectLabels.hidden = !objectLabelsVisible || shell.dataset.preview === "open";
  if (objectLabels.hidden) return;
  const labelCamera = selectedKind === "camera" ? previewCamera : camera;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  for (const [id, entry] of objects) {
    let label = objectLabelNodes.get(id);
    if (label === undefined) {
      label = document.createElement("span");
      label.className = "scene-object-label";
      label.textContent = entry.record.name;
      objectLabels.append(label);
      objectLabelNodes.set(id, label);
    } else if (label.textContent !== entry.record.name) label.textContent = entry.record.name;
    if (!entry.group.visible) { label.hidden = true; continue; }
    const bounds = new THREE.Box3().setFromObject(entry.group);
    if (bounds.isEmpty()) { label.hidden = true; continue; }
    const point = bounds.getCenter(new THREE.Vector3());
    point.y = bounds.max.y;
    point.project(labelCamera);
    label.hidden = point.z < -1 || point.z > 1;
    if (!label.hidden) {
      label.style.left = `${(point.x * .5 + .5) * width}px`;
      label.style.top = `${(-point.y * .5 + .5) * height}px`;
    }
  }
  for (const [id, label] of objectLabelNodes) {
    if (objects.has(id)) continue;
    label.remove();
    objectLabelNodes.delete(id);
  }
}

function numberField(axis, value, group, vector) {
  return `<label class="number-field" data-axis="${axis}"><span>${axis.toUpperCase()}</span><input type="number" step="0.1" value="${Number(value).toFixed(2)}" data-vector="${vector}" data-component="${axis}"></label>`;
}

function vectorField(label, vector, values, unit = "") {
  return `<div class="scene-property-row scene-vector-row"><span>${label}</span><div class="scene-vector-values">${numberField("x", values.x, null, vector)}${numberField("y", values.y, null, vector)}${numberField("z", values.z, null, vector)}</div>${unit ? `<em>${unit}</em>` : ""}</div>`;
}

function colorField(label, value, attribute) {
  return `<label class="color-field"><span>${label}</span><i style="--swatch:${escapeHtml(value)}"><input type="color" value="${escapeHtml(value)}" data-${attribute}-color></i><input type="text" value="${escapeHtml(value.toUpperCase())}" data-${attribute}-text></label>`;
}

function valueField(label, value, attribute, options = {}) {
  const unit = options.unit ?? "";
  const step = options.step ?? .1;
  const min = options.min === undefined ? "" : ` min="${options.min}"`;
  const max = options.max === undefined ? "" : ` max="${options.max}"`;
  return `<label class="property-value-row"><span>${label}</span><span class="property-value-input"><input type="number" step="${step}"${min}${max} value="${value}" data-${attribute}><b>${unit}</b></span></label>`;
}

function toggleField(label, checked, attribute) {
  return `<label class="property-toggle-row"><span>${label}</span><input type="checkbox" data-${attribute} ${checked ? "checked" : ""}></label>`;
}

function materialsFor(entry) {
  const materials = [];
  entry.group.traverse(object => {
    if (!object.isMesh || object.material === undefined || object.userData.selectionOutline === true) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!materials.includes(material)) materials.push(material);
    }
  });
  return materials;
}

function rigFor(entry) {
  const joints = new Map();
  entry.group.traverse(object => {
    const role = object.userData?.hypitRigRole;
    if (typeof role === "string") joints.set(role, object);
  });
  return joints;
}

function rigRestPose(entry) {
  const joints = rigFor(entry);
  const roles = [...joints.keys()].sort().join("|");
  if (entry.rigRestPose?.roles === roles) return entry.rigRestPose;
  entry.rigRestPose = {
    roles,
    joints: new Map([...joints].map(([role, joint]) => [role, {
      position: joint.position.clone(),
      quaternion: joint.quaternion.clone(),
      scale: joint.scale.clone(),
    }])),
  };
  return entry.rigRestPose;
}

function restoreRigRestPose(entry) {
  const rest = rigRestPose(entry);
  const joints = rigFor(entry);
  for (const [role, value] of rest.joints) {
    const joint = joints.get(role);
    if (joint === undefined) continue;
    joint.position.copy(value.position);
    joint.quaternion.copy(value.quaternion);
    joint.scale.copy(value.scale);
  }
  entry.group.updateMatrixWorld(true);
}

function clearPoseRigHelper() {
  if (poseRigHelper === undefined) return;
  scene.remove(poseRigHelper);
  poseRigHelper.traverse(object => {
    object.geometry?.dispose?.();
    object.material?.dispose?.();
  });
  poseRigHelper = undefined;
}

function updatePoseRigHelper() {
  if (poseRigHelper === undefined) return;
  const { pairs, joints, line, points } = poseRigHelper.userData;
  const vector = new THREE.Vector3();
  pairs.forEach(([parent, child], index) => {
    parent.getWorldPosition(vector);
    line.geometry.attributes.position.setXYZ(index * 2, vector.x, vector.y, vector.z);
    child.getWorldPosition(vector);
    line.geometry.attributes.position.setXYZ(index * 2 + 1, vector.x, vector.y, vector.z);
  });
  [...joints.values()].forEach((joint, index) => {
    joint.getWorldPosition(vector);
    points.geometry.attributes.position.setXYZ(index, vector.x, vector.y, vector.z);
  });
  line.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.position.needsUpdate = true;
}

function showPoseRigHelper(entry) {
  clearPoseRigHelper();
  const joints = rigFor(entry);
  const pairs = [];
  for (const joint of joints.values()) {
    let parent = joint.parent;
    while (parent && typeof parent.userData?.hypitRigRole !== "string") parent = parent.parent;
    if (parent) pairs.push([parent, joint]);
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3));
  const line = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0xff6f92, depthTest: false, transparent: true, opacity: .9 }));
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(joints.size * 3), 3));
  const points = new THREE.Points(pointGeometry, new THREE.PointsMaterial({ color: 0xffd0dc, depthTest: false, size: .055, sizeAttenuation: true }));
  line.renderOrder = 20;
  points.renderOrder = 21;
  poseRigHelper = new THREE.Group();
  poseRigHelper.add(line, points);
  poseRigHelper.userData = { entry, pairs, joints, line, points };
  scene.add(poseRigHelper);
  updatePoseRigHelper();
}

function aimRigJoint(entry, role, childRole, rootDirection) {
  const joints = rigFor(entry);
  const joint = joints.get(role);
  const child = joints.get(childRole);
  const root = joints.get("root");
  if (joint === undefined || child === undefined || root === undefined || joint.parent === null) return;
  entry.group.updateMatrixWorld(true);
  const jointWorld = joint.getWorldPosition(new THREE.Vector3());
  const childInParent = joint.parent.worldToLocal(child.getWorldPosition(new THREE.Vector3()));
  const jointInParent = joint.parent.worldToLocal(jointWorld.clone());
  const current = childInParent.sub(jointInParent).normalize();
  const desiredWorld = new THREE.Vector3(...rootDirection).normalize().transformDirection(root.matrixWorld);
  const desired = desiredWorld.transformDirection(new THREE.Matrix4().copy(joint.parent.matrixWorld).invert());
  joint.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(current, desired.normalize())).normalize();
  entry.group.updateMatrixWorld(true);
}

function applyPosePreset(entry, preset) {
  clearSelectionHighlight();
  const groundBefore = new THREE.Box3().setFromObject(entry.group).min.y;
  restoreRigRestPose(entry);
  const aim = (role, child, direction) => aimRigJoint(entry, role, child, direction);
  if (preset === "relaxed" || preset === "walk" || preset === "seated") {
    aim("shoulder.l", "elbow.l", [ .16, -.985, .03 ]);
    aim("shoulder.r", "elbow.r", [-.16, -.985, .03 ]);
    aim("elbow.l", "wrist.l", [ .08, -.995, .06 ]);
    aim("elbow.r", "wrist.r", [-.08, -.995, .06 ]);
  }
  if (preset === "relaxed") {
    aim("hip.l", "knee.l", [ .035, -.999, 0 ]);
    aim("hip.r", "knee.r", [-.035, -.999, 0 ]);
    aim("knee.l", "ankle.l", [ .015, -.999, .01 ]);
    aim("knee.r", "ankle.r", [-.015, -.999, .01 ]);
  }
  if (preset === "walk") {
    aim("shoulder.l", "elbow.l", [ .14, -.9, -.42 ]);
    aim("shoulder.r", "elbow.r", [-.14, -.9, .42 ]);
    aim("elbow.l", "wrist.l", [ .08, -.94, -.34 ]);
    aim("elbow.r", "wrist.r", [-.08, -.94, .34 ]);
    aim("hip.l", "knee.l", [ .1, -.76, .64 ]);
    aim("hip.r", "knee.r", [-.1, -.94, -.32 ]);
    aim("knee.l", "ankle.l", [ .08, -.93, -.36 ]);
    aim("knee.r", "ankle.r", [-.08, -.985, .15 ]);
  }
  if (preset === "seated") {
    aim("hip.l", "knee.l", [ .05, -.04, .998 ]);
    aim("hip.r", "knee.r", [-.05, -.04, .998 ]);
    aim("knee.l", "ankle.l", [ .02, -.999, .02 ]);
    aim("knee.r", "ankle.r", [-.02, -.999, .02 ]);
  }
  entry.group.updateMatrixWorld(true);
  if (preset !== "reference") {
    const root = rigFor(entry).get("root");
    const groundAfter = new THREE.Box3().setFromObject(entry.group).min.y;
    if (root !== undefined && Number.isFinite(groundBefore) && Number.isFinite(groundAfter)) {
      root.position.y += (groundBefore - groundAfter) / Math.max(.0001, entry.group.scale.y);
      entry.group.updateMatrixWorld(true);
    }
  }
  entry.activePose = preset;
  updateSelectionHighlight();
  renderPoseProperties(entry, preset);
}

function renderPoseProperties(entry, activePreset = "custom") {
  const presets = [
    ["reference", "参考姿势"], ["relaxed", "自然站立"], ["walk", "跨步"], ["seated", "坐姿"],
  ];
  properties.innerHTML = `<div class="property-context"><i>${icon("person")}</i><span><strong>${escapeHtml(entry.record.name)}</strong></span></div>
    <div class="property-tabs" role="tablist" aria-label="对象属性"><button type="button" role="tab" aria-selected="false" data-object-tab>对象</button><button type="button" role="tab" aria-selected="true">姿势</button></div>
    <section class="scene-property-group"><h3>姿势</h3><div class="scene-property-grid"><div class="scene-property-row scene-preset-row"><span>预设</span><div class="pose-presets">${presets.map(([id, label]) => `<button type="button" data-pose-preset="${id}" aria-pressed="${String(activePreset === id)}">${label}</button>`).join("")}</div></div></div></section>
    <div class="property-footer-actions property-footer-actions--single"><button type="button" data-pose-reset>${icon("reset")}<span>恢复参考姿势</span></button></div>`;
  transform.detach();
  transformHelper.visible = false;
  showPoseRigHelper(entry);
  properties.querySelector("[data-object-tab]")?.addEventListener("click", () => renderObjectProperties(entry));
  properties.querySelectorAll("[data-pose-preset]").forEach(button => button.addEventListener("click", () => applyPosePreset(entry, button.dataset.posePreset)));
  properties.querySelector("[data-pose-reset]")?.addEventListener("click", () => applyPosePreset(entry, "reference"));
}

function renderObjectProperties(entry) {
  clearPoseRigHelper();
  const record = entry.record;
  const transformValue = entry.group;
  const objectMaterials = materialsFor(entry);
  for (const material of objectMaterials) {
    if (material.color && material.userData.sceneOriginalColor === undefined) material.userData.sceneOriginalColor = `#${material.color.getHexString()}`;
    if (material.userData.sceneOriginalOpacity === undefined) material.userData.sceneOriginalOpacity = material.opacity;
  }
  const firstMaterial = objectMaterials.find(material => material.color !== undefined);
  const color = firstMaterial?.color === undefined ? "#FFFFFF" : `#${firstMaterial.color.getHexString()}`;
  const opacity = Math.round((firstMaterial?.opacity ?? 1) * 100);
  const rig = rigFor(entry);
  properties.innerHTML = `<div class="property-context"><i>${icon(rig.size > 0 ? "person" : "object")}</i><span><strong>${escapeHtml(record.name)}</strong></span></div>
    <div class="property-tabs" role="tablist" aria-label="对象属性"><button type="button" role="tab" aria-selected="true">对象</button><button type="button" role="tab" aria-selected="false" data-pose-tab ${rig.size === 0 ? 'disabled title="当前资产没有可编辑骨架"' : ""}>姿势</button></div>
    <section class="scene-property-group"><h3>变换</h3><div class="scene-property-grid">${vectorField("位置", "position", transformValue.position, "m")}${vectorField("旋转", "rotation", { x: THREE.MathUtils.radToDeg(transformValue.rotation.x), y: THREE.MathUtils.radToDeg(transformValue.rotation.y), z: THREE.MathUtils.radToDeg(transformValue.rotation.z) }, "°")}${vectorField("缩放", "scale", transformValue.scale)}</div></section>
    <section class="scene-property-group"><h3>外观</h3><div class="scene-property-grid">${colorField("颜色", color, "object")}${valueField("不透明度", opacity, "object-opacity", { min: 0, max: 100, step: 1, unit: "%" })}</div></section>
    <div class="property-footer-actions property-footer-actions--single"><button type="button" data-object-reset>${icon("reset")}<span>恢复原色</span></button></div>`;
  bindPropertyInputs(entry);
  properties.querySelector("[data-pose-tab]")?.addEventListener("click", () => renderPoseProperties(entry, entry.activePose ?? "reference"));
  const applyColor = value => {
    for (const material of materialsFor(entry)) if (material.color !== undefined) material.color.set(value);
    const colorInput = properties.querySelector("[data-object-color]");
    const textInput = properties.querySelector("[data-object-text]");
    if (colorInput) colorInput.value = value;
    if (colorInput?.parentElement) colorInput.parentElement.style.setProperty("--swatch", value);
    if (textInput) textInput.value = value.toUpperCase();
  };
  properties.querySelector("[data-object-color]")?.addEventListener("input", event => applyColor(event.target.value));
  properties.querySelector("[data-object-text]")?.addEventListener("change", event => {
    if (/^#[0-9a-f]{6}$/iu.test(event.target.value)) applyColor(event.target.value);
  });
  properties.querySelector("[data-object-opacity]")?.addEventListener("input", event => {
    const opacityValue = Number(event.target.value) / 100;
    for (const material of materialsFor(entry)) {
      material.opacity = opacityValue;
      material.transparent = opacityValue < 1;
      material.needsUpdate = true;
    }
  });
  properties.querySelector("[data-object-reset]")?.addEventListener("click", () => {
    for (const material of materialsFor(entry)) {
      if (material.color && material.userData.sceneOriginalColor) material.color.set(material.userData.sceneOriginalColor);
      material.opacity = material.userData.sceneOriginalOpacity ?? 1;
      material.transparent = material.opacity < 1;
      material.needsUpdate = true;
    }
    renderObjectProperties(entry);
  });
  const activeTool = app.querySelector('[data-tool][aria-pressed="true"]')?.dataset.tool;
  if (shell.dataset.preview !== "open" && selectedKind === "object" && activeTool && activeTool !== "select" && entry.record.editable !== false) {
    transform.setMode(activeTool);
    transform.attach(entry.group);
    transformHelper.visible = true;
  }
}

function renderCameraProperties(cameraRecord) {
  const cameraValue = cameraRecord ?? { name: "机位 1", pose: { position: { x: 0, y: 2.2, z: 7 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, lens: { fov: 50 } };
  const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(
    cameraValue.pose.rotation.x, cameraValue.pose.rotation.y, cameraValue.pose.rotation.z, cameraValue.pose.rotation.w,
  ), "YXZ");
  const focalLength = focalLengthForLens(cameraValue.lens);
  properties.innerHTML = `<div class="property-summary"><i>${icon("camera")}</i><span><strong>${cameraValue.name}</strong><small>实时机位 · 16:9</small></span></div>
    <div class="property-group"><div class="property-group-head"><span>机位位置</span><span>m</span></div><div class="axis-grid">${numberField("x", cameraValue.pose.position.x, null, "camera-position")}${numberField("y", cameraValue.pose.position.y, null, "camera-position")}${numberField("z", cameraValue.pose.position.z, null, "camera-position")}</div></div>
    <div class="property-group"><div class="property-group-head"><span>机位朝向</span><span>°</span></div><div class="axis-grid">${numberField("x", THREE.MathUtils.radToDeg(rotation.x), null, "camera-rotation")}${numberField("y", THREE.MathUtils.radToDeg(rotation.y), null, "camera-rotation")}${numberField("z", THREE.MathUtils.radToDeg(rotation.z), null, "camera-rotation")}</div></div>
    <div class="property-group"><div class="property-group-head"><span>镜头</span><span>全画幅等效</span></div><label class="wide-field lens-field"><strong><span data-camera-focal-label>${Math.round(focalLength)} mm</span><small data-camera-fov-label>${cameraValue.lens.fov.toFixed(1)}° 垂直视角</small></strong><input type="range" min="14" max="135" step="1" value="${focalLength.toFixed(1)}" data-camera-focal></label><div class="lens-presets">${[18, 24, 35, 50, 85].map(value => `<button type="button" data-camera-focal-preset="${value}" aria-pressed="${String(Math.abs(focalLength - value) < .6)}">${value}</button>`).join("")}</div></div>`;
  bindCameraInputs(cameraValue, rotation);
}

function renderEnvironmentProperties() {
  const label = currentWorld?.label ?? "项目环境";
  const world = currentWorld?.world;
  const background = world?.sky.horizon ?? "#171717";
  const keyDistance = Math.max(.001, key.position.length());
  const azimuth = Math.round(THREE.MathUtils.radToDeg(Math.atan2(key.position.z, key.position.x)));
  const elevation = Math.round(THREE.MathUtils.radToDeg(Math.asin(key.position.y / keyDistance)));
  properties.innerHTML = `<div class="environment-preset"><span><small>当前预设</small><strong>${escapeHtml(label)}</strong></span><button type="button" data-environment-reset>${icon("reset")}<span>恢复预设</span></button></div>
    <div class="property-section-title">世界</div><div class="property-flat-group">${colorField("背景颜色", background, "background")}${colorField("地面颜色", `#${floorMaterial.color.getHexString()}`, "ground")}${toggleField("显示地面", currentWorld?.world.ground.visible ?? worldGroundVisible, "world-ground")}${valueField("地面不透明度", Math.round(floorMaterial.opacity * 100), "ground-opacity", { min: 0, max: 100, step: 1, unit: "%" })}${valueField("曝光", renderer.toneMappingExposure.toFixed(2), "exposure", { min: .1, max: 3, step: .05 })}${toggleField("显示网格", gridFine.visible, "world-grid")}</div>
    <div class="property-section-title">环境光</div>
    <div class="property-flat-group">${colorField("天空反射", `#${hemi.color.getHexString()}`, "ambient-sky")}${colorField("地面反射", `#${hemi.groundColor.getHexString()}`, "ambient-ground")}${valueField("强度", hemi.intensity.toFixed(2), "ambient-light", { min: 0, max: 4, step: .05 })}</div>
    <div class="property-section-title">主光</div>
    <div class="property-flat-group">${colorField("灯光颜色", `#${key.color.getHexString()}`, "key")}${valueField("强度", key.intensity.toFixed(2), "key-light", { min: 0, max: 10, step: .1 })}${valueField("水平角度", azimuth, "key-azimuth", { min: -180, max: 180, step: 1, unit: "°" })}${valueField("仰角", elevation, "key-elevation", { min: -10, max: 90, step: 1, unit: "°" })}${valueField("阴影柔度", key.shadow.radius.toFixed(1), "key-softness", { min: 0, max: 8, step: .25 })}${toggleField("阴影", key.castShadow, "key-shadow")}</div>
    <div class="property-section-title">补光</div>
    <div class="property-flat-group">${colorField("灯光颜色", `#${fill.color.getHexString()}`, "fill")}${valueField("强度", fill.intensity.toFixed(2), "fill-light", { min: 0, max: 10, step: .1 })}</div>
    <div class="property-section-title">轮廓光</div>
    <div class="property-flat-group">${colorField("灯光颜色", `#${rim.color.getHexString()}`, "rim")}${valueField("强度", rim.intensity.toFixed(2), "rim-light", { min: 0, max: 10, step: .1 })}</div>`;
  bindLightingControls();
}

function bindPropertyInputs(entry) {
  properties.querySelectorAll("[data-vector]").forEach(input => input.addEventListener("input", () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    const vector = input.dataset.vector;
    const component = input.dataset.component;
    if (vector === "position" || vector === "scale") entry.group[vector][component] = value;
    if (vector === "rotation") entry.group.rotation[component] = THREE.MathUtils.degToRad(value);
  }));
  properties.querySelectorAll("[data-vector]").forEach(input => input.addEventListener("change", () => {
    void commitObjectTransform(entry);
  }));
}

function bindCameraInputs(cameraValue, initialRotation) {
  const position = { ...cameraValue.pose.position };
  const rotation = initialRotation.clone();
  properties.querySelectorAll("[data-vector]").forEach(input => input.addEventListener("input", () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    if (input.dataset.vector === "camera-position") position[input.dataset.component] = value;
    if (input.dataset.vector === "camera-rotation") rotation[input.dataset.component] = THREE.MathUtils.degToRad(value);
    previewCamera.position.set(position.x, position.y, position.z);
    previewCamera.quaternion.setFromEuler(rotation);
  }));
  properties.querySelectorAll("[data-vector]").forEach(input => input.addEventListener("change", () => {
    if (cameraValue.id === undefined) return;
    void transact(`调整机位：${cameraValue.name}`, [{
      kind: "camera.pose.set",
      id: cameraValue.id,
      pose: cameraPose(previewCamera),
    }], { selection: { kind: "camera", id: cameraValue.id } });
  }));
  const previewFocalLength = focalLength => {
    previewCamera.fov = fovForFocalLength(focalLength, cameraValue.lens);
    previewCamera.updateProjectionMatrix();
    properties.querySelector("[data-camera-focal-label]").textContent = `${Math.round(focalLength)} mm`;
    properties.querySelector("[data-camera-fov-label]").textContent = `${previewCamera.fov.toFixed(1)}° 垂直视角`;
    properties.querySelectorAll("[data-camera-focal-preset]").forEach(button => {
      button.setAttribute("aria-pressed", String(Math.abs(Number(button.dataset.cameraFocalPreset) - focalLength) < .6));
    });
  };
  const commitFocalLength = focalLength => {
    if (cameraValue.id === undefined) return;
    void transact(`调整镜头：${cameraValue.name}`, [{
      kind: "camera.lens.set",
      id: cameraValue.id,
      lens: { ...cameraValue.lens, fov: fovForFocalLength(focalLength, cameraValue.lens) },
    }], { selection: { kind: "camera", id: cameraValue.id } });
  };
  const focalInput = properties.querySelector("[data-camera-focal]");
  focalInput?.addEventListener("input", event => previewFocalLength(Number(event.target.value)));
  focalInput?.addEventListener("change", event => commitFocalLength(Number(event.target.value)));
  properties.querySelectorAll("[data-camera-focal-preset]").forEach(button => button.addEventListener("click", () => {
    const value = Number(button.dataset.cameraFocalPreset);
    focalInput.value = String(value);
    previewFocalLength(value);
    commitFocalLength(value);
  }));
}

function bindLightingControls() {
  const commitNumber = (input, path, read = element => Number(element.value)) => {
    if (input === null) return;
    let committed = read(input);
    const commit = () => {
      const value = read(input);
      if (Object.is(value, committed)) return;
      committed = value;
      void editEnvironment(path, value);
    };
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", event => { if (event.key === "Enter") event.currentTarget.blur(); });
  };
  const bindColor = (attribute, path) => {
    const colorInput = properties.querySelector(`[data-${attribute}-color]`);
    const textInput = properties.querySelector(`[data-${attribute}-text]`);
    const set = value => {
      previewEnvironmentField(path, value);
      if (colorInput) colorInput.value = value;
      if (colorInput?.parentElement) colorInput.parentElement.style.setProperty("--swatch", value);
      if (textInput) textInput.value = value.toUpperCase();
    };
    colorInput?.addEventListener("input", event => set(event.target.value));
    colorInput?.addEventListener("change", event => { void editEnvironment(path, event.target.value); });
    textInput?.addEventListener("change", event => {
      if (!/^#[0-9a-f]{6}$/iu.test(event.target.value)) return;
      set(event.target.value);
      void editEnvironment(path, event.target.value);
    });
  };
  bindColor("background", "sky.horizon");
  bindColor("ground", "ground.color");
  bindColor("ambient-sky", "lighting.ambient.sky");
  bindColor("ambient-ground", "lighting.ambient.ground");
  bindColor("key", "lighting.key.color");
  bindColor("fill", "lighting.fill.color");
  bindColor("rim", "lighting.rim.color");
  properties.querySelector("[data-exposure]")?.addEventListener("input", event => {
    previewEnvironmentField("exposure", Number(event.target.value));
  });
  commitNumber(properties.querySelector("[data-exposure]"), "exposure");
  properties.querySelector("[data-world-ground]")?.addEventListener("change", event => {
    previewEnvironmentField("ground.visible", event.target.checked);
    void editEnvironment("ground.visible", event.target.checked);
  });
  properties.querySelector("[data-world-grid]")?.addEventListener("change", event => {
    setGridVisible(event.target.checked, true);
  });
  properties.querySelector("[data-ground-opacity]")?.addEventListener("input", event => {
    previewEnvironmentField("ground.opacity", Number(event.target.value) / 100);
  });
  commitNumber(properties.querySelector("[data-ground-opacity]"), "ground.opacity", element => Number(element.value) / 100);
  const bindNumber = (attribute, path) => {
    const input = properties.querySelector(`[data-${attribute}]`);
    input?.addEventListener("input", event => previewEnvironmentField(path, Number(event.target.value)));
    commitNumber(input, path);
  };
  bindNumber("ambient-light", "lighting.ambient.intensity");
  bindNumber("key-light", "lighting.key.intensity");
  bindNumber("key-softness", "lighting.key.softness");
  bindNumber("fill-light", "lighting.fill.intensity");
  bindNumber("rim-light", "lighting.rim.intensity");
  const updateKeyDirection = event => previewEnvironmentField(
    event.target.matches("[data-key-azimuth]") ? "lighting.key.azimuth" : "lighting.key.elevation",
    Number(event.target.value),
  );
  properties.querySelector("[data-key-azimuth]")?.addEventListener("input", updateKeyDirection);
  properties.querySelector("[data-key-elevation]")?.addEventListener("input", updateKeyDirection);
  commitNumber(properties.querySelector("[data-key-azimuth]"), "lighting.key.azimuth");
  commitNumber(properties.querySelector("[data-key-elevation]"), "lighting.key.elevation");
  properties.querySelector("[data-key-shadow]")?.addEventListener("change", event => {
    previewEnvironmentField("lighting.key.shadows", event.target.checked);
    void editEnvironment("lighting.key.shadows", event.target.checked);
  });
  properties.querySelector("[data-environment-reset]")?.addEventListener("click", () => {
    const entry = currentLibrary?.entries.find(candidate => candidate.id === currentWorldEntryId);
    if (entry !== undefined) selectWorldEntry(entry);
  });
}

function syncObjectToolAvailability() {
  const editableObjectSelected = selectedKind === "object" && selected?.group !== undefined
    && selected.record.editable !== false && shell.dataset.preview !== "open";
  app.querySelector("[data-ground-tool]").disabled = !editableObjectSelected;
}

function selectObject(id) {
  const entry = objects.get(id);
  if (entry === undefined) return;
  selected = entry;
  selectedKind = "object";
  selectedCameraId = undefined;
  syncObjectToolAvailability();
  orbit.enabled = shell.dataset.preview !== "open";
  transform.detach();
  transformHelper.visible = false;
  const activeTool = app.querySelector('[data-tool][aria-pressed="true"]')?.dataset.tool;
  if (shell.dataset.preview !== "open" && entry.record.editable !== false && activeTool !== "select") {
    transform.attach(entry.group);
    transformHelper.visible = true;
  }
  hierarchy.querySelectorAll(".hierarchy-row").forEach(row => row.setAttribute("aria-selected", String(row.dataset.object === id)));
  app.querySelector("[data-property-mode]").textContent = "对象";
  updateSelectionHighlight();
  renderObjectProperties(entry);
}

function selectCamera(id) {
  clearPoseRigHelper();
  clearSelectionHighlight();
  selected = undefined;
  selectedKind = "camera";
  selectedCameraId = id;
  syncObjectToolAvailability();
  orbit.enabled = false;
  transform.detach();
  transformHelper.visible = false;
  hierarchy.querySelectorAll(".hierarchy-row").forEach(row => row.setAttribute("aria-selected", String(row.dataset.camera === id)));
  app.querySelector("[data-property-mode]").textContent = "机位";
  const record = snapshot?.scene.cameras.find(value => value.id === id);
  if (record !== undefined) applyCameraRecordToPreview(record);
  renderCameraProperties(record);
}

function selectEnvironment() {
  clearPoseRigHelper();
  clearSelectionHighlight();
  selected = undefined;
  selectedKind = "environment";
  selectedCameraId = undefined;
  syncObjectToolAvailability();
  orbit.enabled = shell.dataset.preview !== "open";
  transform.detach();
  transformHelper.visible = false;
  hierarchy.querySelectorAll(".hierarchy-row").forEach(row => row.setAttribute("aria-selected", "false"));
  app.querySelector("[data-property-mode]").textContent = "环境";
  renderEnvironmentProperties();
}

function hierarchyRow(record, type) {
  const isCamera = type === "camera";
  const data = isCamera ? `data-camera="${record.id}"` : `data-object="${record.id}"`;
  return `<div class="hierarchy-row" ${data} aria-selected="false">${icon(isCamera ? "camera" : "person")}<strong>${record.name}</strong><button type="button" title="聚焦">${icon("focus")}</button><button type="button" title="${isCamera ? "进入机位" : "显示/隐藏"}">${icon("eye")}</button></div>`;
}

function populateHierarchy(value) {
  const query = app.querySelector("[data-object-search]").value.trim().toLocaleLowerCase();
  const matches = record => query.length === 0 || `${record.name} ${record.id}`.toLocaleLowerCase().includes(query);
  const cameraRecords = value.scene.cameras.filter(matches);
  const objectRecords = value.scene.objects.filter(matches);
  const cameras = cameraRecords.map(record => hierarchyRow(record, "camera")).join("");
  const objectRows = objectRecords.map(record => hierarchyRow(record, "object")).join("");
  const emptyLabel = query.length === 0 ? "暂无内容" : "没有匹配结果";
  hierarchy.innerHTML = `<div class="hierarchy-group"><div class="hierarchy-group-head"><span>机位</span><span>${cameraRecords.length}</span></div>${cameras || `<div class="hierarchy-empty">${emptyLabel}</div>`}</div><div class="hierarchy-group"><div class="hierarchy-group-head"><span>角色与物体</span><span>${objectRecords.length}</span></div>${objectRows || `<div class="hierarchy-empty">${emptyLabel}</div>`}</div>`;
  hierarchy.querySelectorAll("[data-object]").forEach(row => row.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    if (selectedKind === "object" && selected?.record.id === row.dataset.object) selectEnvironment();
    else selectObject(row.dataset.object);
  }));
  hierarchy.querySelectorAll("[data-camera]").forEach(row => row.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    if (selectedKind === "camera" && row.getAttribute("aria-selected") === "true") selectEnvironment();
    else selectCamera(row.dataset.camera);
  }));
  hierarchy.querySelectorAll(".hierarchy-row button:first-of-type").forEach(button => button.addEventListener("click", () => {
    const row = button.closest(".hierarchy-row");
    if (row.dataset.object) { selectObject(row.dataset.object); frameObject(); }
    else if (row.dataset.camera) selectCamera(row.dataset.camera);
  }));
  hierarchy.querySelectorAll("[data-object] button:last-of-type").forEach(button => button.addEventListener("click", () => {
    const row = button.closest("[data-object]");
    const record = snapshot.scene.objects.find(entry => entry.id === row.dataset.object);
    if (record === undefined) return;
    void transactView([{ kind: "object-state.set", object: record.id, hidden: record.editorVisible }], {
      selection: record.editorVisible ? { kind: "environment" } : { kind: "object", id: record.id },
      success: record.editorVisible ? `已隐藏：${record.name}` : `已显示：${record.name}`,
    });
  }));
  hierarchy.querySelectorAll("[data-camera] button:last-of-type").forEach(button => button.addEventListener("click", () => {
    const row = button.closest("[data-camera]");
    selectCamera(row.dataset.camera);
  }));
}

function timelineRulerTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  const local = `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  return hours === 0 ? local : `${String(hours).padStart(2, "0")}:${local}`;
}

function rateDivisors(rate) {
  const values = [];
  for (let value = 1; value <= rate; value += 1) if (rate % value === 0) values.push(value);
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

const nearMultiple = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-6;

function drawTimelineRuler() {
  const scale = app.querySelector(".scene-nle-timeline .nle-ruler-scale");
  if (scale === null || activePerformancePreview === undefined) return;
  scale.replaceChildren();
  const exactRate = previewRate();
  const rate = Math.max(1, Math.round(exactRate));
  const shown = timelineWindow();
  const projectFrameCount = Math.max(1, activePerformancePreview.durationFrames);
  const extentFrameCount = projectFrameCount * widestTimelineWindow;
  const startFrame = shown.start * projectFrameCount;
  const endFrame = shown.end * projectFrameCount;
  const visibleFrames = Math.max(1, endFrame - startFrame);
  const width = Math.max(1, scale.clientWidth);
  const pixelsPerFrame = width / visibleFrames;
  const pixelsPerSecond = pixelsPerFrame * exactRate;
  const startSecond = startFrame / exactRate;
  const endSecond = endFrame / exactRate;
  const majorSeconds = clockStepAtLeast(112 / pixelsPerSecond);
  const placeFrame = frame => (frame / projectFrameCount - shown.start) / Math.max(1e-6, shown.span);
  const append = (className, left, text) => {
    const node = document.createElement("span");
    node.className = className;
    if (left !== undefined) node.style.left = `${left * 100}%`;
    if (text !== undefined) node.textContent = text;
    scale.append(node);
    return node;
  };
  append("nle-ruler-context", undefined, timelineRulerTime(startSecond));
  for (let second = Math.max(0, Math.ceil((startSecond - 1e-6) / majorSeconds) * majorSeconds);
    second <= endSecond + 1e-6; second += majorSeconds) {
    const at = placeFrame(second * exactRate);
    if (at < 0 || at > 1) continue;
    append(`nle-ruler-tick nle-ruler-tick-second major${at > .94 ? " last" : ""}`, at,
      at * width >= 52 ? timelineRulerTime(second) : undefined);
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
    const labelled = frameLabelStep !== undefined && !wholeSecond
      && nearMultiple(second, frameLabelStep) && at * width >= 52;
    append(wholeSecond ? "nle-ruler-tick nle-ruler-tick-second minor" : "nle-ruler-tick nle-ruler-tick-frame", at);
    if (labelled) append("nle-ruler-frame-label", at, `${Math.round((second - Math.floor(second)) * exactRate)}f`);
  }
  append("nle-playhead-grip");
}

function populateTimeline(value) {
  const performance = value.project.performances.find(entry => entry.id === activePerformanceId);
  const projectedPerformance = value.scene.performances.find(entry => entry.id === activePerformanceId);
  const duration = performance === undefined ? 1 : temporalSeconds(performance.duration);
  renderSceneSelect("monitor", [
    { value: "follow", label: "跟随切镜" },
    ...value.scene.cameras.map(cameraValue => ({ value: `camera:${cameraValue.id}`, label: cameraValue.name })),
  ], monitorMode === "camera" && monitoredCameraId !== undefined ? `camera:${monitoredCameraId}` : "follow");
  updateMonitorChrome();
  renderSceneSelect("performance", value.project.performances.map(entry => ({ value: entry.id, label: entry.name })), activePerformanceId, true);
  const window = timelineWindow();
  const rulerMarkup = '<div class="nle-ruler"><div class="nle-ruler-label"></div><div class="nle-ruler-scale" data-timeline-ruler></div></div>';
  if (performance === undefined) {
    shell.style.setProperty("--timeline-height", "280px");
    app.querySelector("[data-timeline]").innerHTML = `${rulerMarkup}<div class="nle-track-stack"><div class="timeline-no-performance">当前 Scene 没有 Performance</div></div><div class="nle-playhead-layer"><div class="nle-playhead"></div></div>`;
    drawTimelineRuler();
    updatePlaybackChrome();
    return;
  }
  const placement = entry => {
    const start = temporalSeconds(entry.start) / duration;
    const end = (temporalSeconds(entry.start) + temporalSeconds(entry.duration)) / duration;
    const left = (Math.max(start, window.start) - window.start) / window.span * 100;
    const right = (Math.min(end, window.end) - window.start) / window.span * 100;
    return { visible: end > window.start && start < window.end, style: `left:${left}%;width:${Math.max(0, right - left)}%` };
  };
  const isSelected = (kind, id) => timelineSelection?.performance === performance.id
    && timelineSelection.kind === kind && timelineSelection.id === id;
  const clip = (entry, kind, attributes, selectedKind = "item") => {
    const placed = placement(entry);
    if (!placed.visible) return "";
    const tone = kind === "shot" ? "blue" : kind === "motion" ? "magenta" : "violet";
    const durationSeconds = temporalSeconds(entry.duration);
    return `<button type="button" class="timeline-item timeline-item-tone-${tone}${entry.enabled === false ? " disabled" : ""}${isSelected(selectedKind, entry.id) ? " selected" : ""}" style="${placed.style}" title="${escapeHtml(entry.name)}" ${attributes} aria-pressed="${String(isSelected(selectedKind, entry.id))}"><span class="timeline-item-head"><span class="timeline-item-name">${escapeHtml(entry.name)}</span><span class="timeline-item-meta">${durationSeconds.toFixed(2)}s</span></span><span class="timeline-item-body"><span class="timeline-item-layers" aria-hidden="true"></span></span><span class="timeline-item-boundary" aria-hidden="true"></span><span class="timeline-item-selection" aria-hidden="true"></span></button>`;
  };
  const trackRow = (track, kind, subjectName) => {
    const projected = projectedPerformance?.tracks.find(entry => entry.id === track.id);
    const items = track.items.map(item => clip(item, kind === "camera" ? "motion" : "actor", `data-timeline-item="${escapeHtml(item.id)}" data-timeline-track="${escapeHtml(track.id)}"`)).join("");
    const monitored = kind === "camera" ? monitoredCameraId === track.subject.ref && monitorMode === "camera" : selectedKind === "object" && selected?.record.id === track.subject.ref;
    return `<div class="nle-track${isSelected("track", track.id) ? " selected" : ""}" data-track-row="${escapeHtml(track.id)}"><div class="nle-track-label"><button type="button" class="track-kind" data-timeline-track="${escapeHtml(track.id)}" title="${escapeHtml(subjectName)} · ${escapeHtml(track.name)}" aria-label="${escapeHtml(subjectName)} · ${escapeHtml(track.name)}">${icon(kind === "camera" ? "camera" : "person")}</button><button type="button" class="track-control${monitored ? " active" : ""}" data-timeline-monitor-kind="${kind}" data-timeline-monitor-ref="${escapeHtml(track.subject.ref)}" title="监看 ${escapeHtml(subjectName)}">${icon("eye")}</button><button type="button" class="track-control${projected?.locked ? " active" : ""}" data-timeline-track-lock="${escapeHtml(track.id)}" title="${projected?.locked ? "解锁" : "锁定"}">${icon(projected?.locked ? "lock" : "unlock")}</button></div><div class="nle-track-content track-tone-${kind === "camera" ? "magenta" : "violet"}" data-timeline-scrub>${items || '<span class="timeline-empty">当前范围没有片段</span>'}</div></div>`;
  };
  const rows = [];
  let laneCount = 0;
  for (const cameraValue of value.scene.cameras) {
    const shots = performance.shots.filter(shot => shot.camera === cameraValue.id);
    const tracks = performance.tracks.filter(candidate => candidate.subject.kind === "camera" && candidate.subject.ref === cameraValue.id);
    laneCount += tracks.length + 1;
    const shotSelected = timelineSelection?.kind === "shots" && timelineSelection.id === cameraValue.id;
    const monitored = monitoredCameraId === cameraValue.id && monitorMode === "camera";
    rows.push(`<div class="nle-track${shotSelected ? " selected" : ""}" data-track-row="shots:${escapeHtml(cameraValue.id)}"><div class="nle-track-label"><button type="button" class="track-kind" data-timeline-shots="${escapeHtml(cameraValue.id)}" title="${escapeHtml(cameraValue.name)} · 镜头区段" aria-label="${escapeHtml(cameraValue.name)} · 镜头区段">${icon("camera")}</button><button type="button" class="track-control${monitored ? " active" : ""}" data-timeline-monitor-kind="camera" data-timeline-monitor-ref="${escapeHtml(cameraValue.id)}" title="监看 ${escapeHtml(cameraValue.name)}">${icon("eye")}</button><button type="button" class="track-control" title="镜头区段由 Performance 管理" disabled>${icon("lock")}</button></div><div class="nle-track-content track-tone-blue" data-timeline-scrub>${shots.map(shot => clip(shot, "shot", `data-timeline-shot="${escapeHtml(shot.id)}" data-timeline-camera="${escapeHtml(cameraValue.id)}"`, "shot")).join("") || '<span class="timeline-empty">当前范围未进入成片</span>'}</div></div>`);
    rows.push(...tracks.map(track => trackRow(track, "camera", cameraValue.name)));
  }
  for (const object of value.scene.objects) {
    const tracks = performance.tracks.filter(candidate => candidate.subject.kind === "object" && candidate.subject.ref === object.id);
    if (tracks.length === 0) continue;
    laneCount += tracks.length;
    rows.push(...tracks.map(track => trackRow(track, "object", object.name)));
  }
  shell.style.setProperty("--timeline-height", `${Math.min(390, Math.max(250, 86 + laneCount * 54))}px`);
  const stack = rows.join("") || '<div class="timeline-no-performance">这个 Performance 还没有轨迹</div>';
  app.querySelector("[data-timeline]").innerHTML = `${rulerMarkup}<div class="nle-track-stack">${stack}</div><div class="nle-playhead-layer"><div class="nle-playhead"></div></div>`;
  drawTimelineRuler();
  updatePlaybackChrome();
}

function timelineTrack(id) {
  return activePerformance()?.tracks.find(entry => entry.id === id);
}

function adoptTrackMonitor(track) {
  if (track.subject.kind === "camera") {
    monitoredCameraId = track.subject.ref;
    monitorMode = "camera";
    selectCamera(track.subject.ref);
  } else {
    const entry = objects.get(track.subject.ref);
    if (entry !== undefined) selectObject(track.subject.ref);
  }
  updateMonitorChrome();
  if (shell.dataset.preview === "open") applyPerformanceTime(playbackTime);
  if (track.subject.kind === "object") frameObject(objects.get(track.subject.ref));
}

function selectTimelineTrack(id, itemId) {
  const track = timelineTrack(id);
  if (track === undefined || activePerformanceId === undefined) return;
  timelineSelection = itemId === undefined
    ? { kind: "track", id: track.id, performance: activePerformanceId }
    : { kind: "item", id: itemId, track: track.id, performance: activePerformanceId };
  adoptTrackMonitor(track);
  if (itemId !== undefined) {
    const item = track.items.find(entry => entry.id === itemId);
    if (item !== undefined) seekPreview(temporalSeconds(item.start));
  }
  populateTimeline(snapshot);
}

function selectTimelineSubject(kind, id) {
  if (activePerformanceId === undefined) return;
  timelineSelection = { kind: "subject", id: `${kind}:${id}`, performance: activePerformanceId };
  if (kind === "camera") {
    monitoredCameraId = id;
    monitorMode = "camera";
    selectCamera(id);
    applyPerformanceTime(playbackTime);
  } else {
    if (objects.has(id)) selectObject(id);
    applyPerformanceTime(playbackTime);
    frameObject(objects.get(id));
  }
  updateMonitorChrome();
  populateTimeline(snapshot);
}

function selectTimelineShot(id, cameraId) {
  const performance = activePerformance();
  const shot = performance?.shots.find(entry => entry.id === id);
  if (shot === undefined || activePerformanceId === undefined) return;
  timelineSelection = { kind: "shot", id, performance: activePerformanceId };
  monitoredCameraId = cameraId;
  monitorMode = "shot";
  seekPreview(temporalSeconds(shot.start));
  updateMonitorChrome();
  populateTimeline(snapshot);
}

function seekTimelinePointer(surface, event) {
  const rect = surface.getBoundingClientRect();
  if (rect.width <= 0) return;
  const local = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const window = timelineWindow();
  seekPreview((window.start + local * window.span) * previewDuration());
}

function sceneReady() {
  if (pendingModelLoads.size !== 0) return;
  if (outputMode) {
    gridFine.visible = false;
    gridMajor.visible = false;
    if (requestedCamera !== null && snapshot?.scene.cameras.some(entry => entry.id === requestedCamera)) {
      monitorMode = "camera";
      monitoredCameraId = requestedCamera;
    }
    const duration = previewDuration();
    const captureStart = Number.isFinite(requestedStart) ? Math.max(0, Math.min(duration, requestedStart)) : 0;
    const captureEnd = Number.isFinite(requestedEnd) ? Math.max(captureStart, Math.min(duration, requestedEnd)) : duration;
    playbackTime = captureStart;
    setPreviewOpen(true);
    applyPerformanceTime(playbackTime);
    document.body.dataset.sceneCaptureStart = captureStart.toFixed(4);
    document.body.dataset.sceneCaptureEnd = captureEnd.toFixed(4);
  }
  document.body.dataset.sceneReady = "true";
}

function loadModel(record, entry) {
  if (record.preview?.kind !== "model") return;
  const resource = record.preview.resource;
  const token = Symbol(record.id);
  entry.modelLoading = true;
  entry.modelResource = resource;
  pendingModelLoads.add(token);
  loader.load(record.preview.resource, value => {
    const current = objects.get(record.id);
    if (current !== entry || current.modelResource !== resource) {
      pendingModelLoads.delete(token);
      sceneReady();
      return;
    }
    if (selectedKind === "object" && selected?.record.id === record.id) clearSelectionHighlight();
    for (const child of [...entry.group.children]) entry.group.remove(child);
    value.scene.traverse(object => { object.userData.sceneObject = record.id; if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    entry.group.add(value.scene);
    entry.rigRestPose = undefined;
    entry.activePose = "reference";
    entry.modelLoaded = true;
    entry.modelLoading = false;
    if (value.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(value.scene);
      for (const clip of value.animations) mixer.clipAction(clip).play();
      entry.mixer = mixer;
      mixer.setTime(shell.dataset.preview === "open" ? playbackTime : 0);
    }
    if (selectedKind === "object" && selected?.record.id === record.id) {
      updateSelectionHighlight();
      renderObjectProperties(selected);
    }
    pendingModelLoads.delete(token);
    sceneReady();
  }, undefined, () => {
    if (objects.get(record.id) === entry) {
      entry.modelLoading = false;
      showToast(`${record.name} 模型暂不可用，已保留占位体`);
    }
    pendingModelLoads.delete(token);
    sceneReady();
  });
}

function loadSnapshot(value, retainedSelection = { kind: "environment" }) {
  document.body.dataset.sceneReady = "false";
  snapshot = value;
  const nextPerformanceId = value.project.performances.some(entry => entry.id === activePerformanceId)
    ? activePerformanceId
    : value.project.performances.some(entry => entry.id === requestedPerformance)
      ? requestedPerformance
      : value.project.performances[0]?.id;
  activePerformanceId = nextPerformanceId;
  activePerformancePreview = value.performancePreviews?.find(entry => entry.performance === activePerformanceId);
  if (timelineSelection?.performance !== activePerformanceId) timelineSelection = undefined;
  if (!value.scene.cameras.some(entry => entry.id === monitoredCameraId)) {
    monitoredCameraId = undefined;
    if (monitorMode === "camera") monitorMode = "shot";
  }
  playbackTime = 0;
  previewPlaying = false;
  previousRenderTime = undefined;
  app.querySelector("[data-project-name]").textContent = value.project.name;
  const sceneName = app.querySelector("[data-scene-name]");
  if (sceneName) sceneName.textContent = value.project.name;
  transform.detach();
  setGridVisible(value.scene.grid.visible);
  const nextLibraryKey = JSON.stringify(value.libraries ?? []);
  if (nextLibraryKey !== renderedLibraryKey) {
    renderedLibraryKey = nextLibraryKey;
    renderLibrary(value.libraries ?? []);
  }
  const authoredEnvironment = value.project.environment;
  const authoredWorld = authoredEnvironment?.parameters?.world;
  const presetEntry = environmentEntry(authoredEnvironment);
  if (authoredWorld && typeof authoredWorld === "object") {
    const label = presetEntry?.label ?? "自定义环境";
    const entryId = presetEntry?.id;
    const worldChanged = currentWorld === undefined
      || JSON.stringify(currentWorld.world) !== JSON.stringify(authoredWorld)
      || currentWorldEntryId !== entryId;
    if (worldChanged) applyWorldEnvironment(authoredWorld, label, entryId, false);
    else {
      currentWorld = { label, world: structuredClone(authoredWorld) };
      app.querySelectorAll("[data-library-entry]").forEach(card => card.setAttribute("aria-selected", String(card.dataset.libraryEntry === entryId)));
    }
  }
  const visibleRecords = value.scene.objects.filter(record => record.editorVisible);
  const visibleIds = new Set(visibleRecords.map(record => record.id));
  for (const [id, entry] of objects) {
    if (visibleIds.has(id)) continue;
    authoredRoot.remove(entry.group);
    objects.delete(id);
  }
  for (const record of visibleRecords) {
    const resource = record.preview?.kind === "model" ? record.preview.resource : undefined;
    let entry = objects.get(record.id);
    if (entry === undefined) {
      const group = placeholder(record);
      authoredRoot.add(group);
      entry = { record, group, modelResource: resource, modelLoaded: false, modelLoading: false };
      objects.set(record.id, entry);
    } else {
      const resourceChanged = entry.modelResource !== resource;
      entry.record = record;
      if (resourceChanged) {
        entry.modelResource = resource;
        entry.modelLoaded = false;
        entry.modelLoading = false;
      }
    }
    applyTransform(entry.group, record.transform);
    entry.group.visible = record.enabled !== false;
    if (resource !== undefined && !entry.modelLoaded && !entry.modelLoading) loadModel(record, entry);
  }
  const authoredCamera = value.scene.cameras[0];
  if (authoredCamera) {
    previewCamera.position.set(authoredCamera.pose.position.x, authoredCamera.pose.position.y, authoredCamera.pose.position.z);
    previewCamera.quaternion.set(
      authoredCamera.pose.rotation.x, authoredCamera.pose.rotation.y,
      authoredCamera.pose.rotation.z, authoredCamera.pose.rotation.w,
    ).normalize();
    previewCamera.fov = authoredCamera.lens.fov;
    previewCamera.updateProjectionMatrix();
  }
  populateHierarchy(value);
  populateTimeline(value);
  updateMonitorChrome();
  updatePlaybackChrome();
  if (retainedSelection.kind === "object" && objects.has(retainedSelection.id)) selectObject(retainedSelection.id);
  else if (retainedSelection.kind === "camera" && value.scene.cameras.some(entry => entry.id === retainedSelection.id)) selectCamera(retainedSelection.id);
  else selectEnvironment();
  sceneReady();
}

function setTimelineCollapsed(collapsed) {
  shell.dataset.timelineCollapsed = String(collapsed);
  timelinePanel.inert = collapsed || shell.dataset.preview !== "open";
  collapseTimeline.setAttribute("aria-expanded", String(!collapsed));
  revealTimeline.hidden = !collapsed;
}
collapseTimeline.addEventListener("click", () => {
  setTimelineCollapsed(true);
  revealTimeline.focus({ preventScroll: true });
});
revealTimeline.addEventListener("click", () => {
  setTimelineCollapsed(false);
  collapseTimeline.focus({ preventScroll: true });
});

function setPreviewOpen(open) {
  shell.dataset.preview = open ? "open" : "closed";
  setTimelineCollapsed(false);
  syncObjectToolAvailability();
  app.querySelectorAll("[data-toggle-preview]").forEach(button => button.setAttribute("aria-pressed", String(open)));
  const label = app.querySelector("[data-preview-label]");
  if (label) label.textContent = open ? "退出预演" : "预演";
  if (open) {
    clearPoseRigHelper();
    orbit.enabled = false;
    transform.detach();
    transform.enabled = false;
    transformHelper.visible = false;
    if (activePerformancePreview?.error) showToast(activePerformancePreview.error);
    else applyPerformanceTime(playbackTime);
  } else {
    transform.enabled = true;
    orbit.enabled = selectedKind !== "camera";
    transformHelper.visible = false;
    previewPlaying = false;
    previousRenderTime = undefined;
    applyBaseSceneState();
    updatePlaybackChrome();
    const activeTool = app.querySelector('[data-tool][aria-pressed="true"]')?.dataset.tool;
    if (selectedKind === "object" && selected?.record.editable !== false && activeTool && activeTool !== "select") {
      transform.setMode(activeTool);
      transform.attach(selected.group);
      transformHelper.visible = true;
    }
  }
  updateSelectionHighlight();
  updateMonitorChrome();
  resize();
}

app.querySelectorAll("[data-toggle-preview]").forEach(button => button.addEventListener("click", () => {
  setPreviewOpen(shell.dataset.preview !== "open");
}));
app.querySelector("[data-close-preview]").addEventListener("click", () => setPreviewOpen(false));

function togglePreviewPlayback() {
  if (shell.dataset.preview !== "open") setPreviewOpen(true);
  if (activePerformancePreview === undefined || activePerformancePreview.frames.length === 0) {
    showToast(activePerformancePreview?.error ?? "当前 Performance 没有可播放的预演");
    return;
  }
  if (!previewPlaying && playbackTime >= Math.max(0, previewDuration() - 1 / previewRate())) {
    playbackTime = 0;
    applyPerformanceTime(0);
  }
  previewPlaying = !previewPlaying;
  previousRenderTime = undefined;
  updatePlaybackChrome();
}

app.querySelector("[data-preview-play]").addEventListener("click", togglePreviewPlayback);
app.querySelector("[data-preview-previous]").addEventListener("click", () => {
  previewPlaying = false;
  playbackTime = Math.max(0, playbackTime - 1 / previewRate());
  applyPerformanceTime(playbackTime);
});
app.querySelector("[data-preview-next]").addEventListener("click", () => {
  previewPlaying = false;
  playbackTime = Math.min(Math.max(0, previewDuration() - 1 / previewRate()), playbackTime + 1 / previewRate());
  applyPerformanceTime(playbackTime);
});

app.addEventListener("click", event => {
  const trigger = event.target.closest("[data-scene-select-trigger]");
  if (trigger) {
    const root = trigger.closest("[data-scene-select]");
    const open = trigger.getAttribute("aria-expanded") !== "true";
    closeSceneSelects(root);
    setSceneSelectOpen(root, open);
    return;
  }
  const option = event.target.closest("[data-scene-select-option]");
  if (option) {
    const root = option.closest("[data-scene-select]");
    const value = option.dataset.sceneSelectOption;
    syncSceneSelect(root.dataset.sceneSelect, value);
    setSceneSelectOpen(root, false);
    root.querySelector("[data-scene-select-trigger]").focus();
    if (root.dataset.sceneSelect === "performance") switchPerformance(value);
    if (root.dataset.sceneSelect === "monitor") {
      if (value === "follow") setMonitorMode("shot");
      else if (value.startsWith("camera:")) setMonitorMode("camera", value.slice(7));
    }
    return;
  }
  closeSceneSelects();
});
app.querySelectorAll("[data-scene-select]").forEach(root => root.addEventListener("keydown", event => {
  const trigger = event.target.closest("[data-scene-select-trigger]");
  if (trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    closeSceneSelects(root);
    setSceneSelectOpen(root, true, true);
    return;
  }
  const option = event.target.closest("[data-scene-select-option]");
  if (option && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const options = [...root.querySelectorAll("[data-scene-select-option]")];
    const index = options.indexOf(option);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : event.key === "ArrowDown" ? (index + 1) % options.length : (index - 1 + options.length) % options.length;
    options[next]?.focus();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setSceneSelectOpen(root, false);
    root.querySelector("[data-scene-select-trigger]").focus();
  }
}));
app.querySelector("[data-scene-export-open]").addEventListener("click", openSceneExportDialog);
for (const close of app.querySelectorAll("[data-scene-export-close]")) {
  close.addEventListener("click", () => {
    clearTimeout(sceneExportPollTimer);
    app.querySelector("[data-scene-export-dialog]").close();
  });
}
app.querySelector("[data-scene-export-form]").addEventListener("submit", async event => {
  event.preventDefault();
  if (snapshot === undefined || activePerformanceId === undefined) return;
  const form = event.currentTarget;
  try {
    const job = await request("/api/scene/export", {
      revision: snapshot.project.revision,
      fileName: form.querySelector("[data-scene-export-name]").value.trim(),
      performance: activePerformanceId,
      view: sceneSelect("export-view")?.dataset.value ?? "follow",
      range: sceneSelect("export-range")?.dataset.value ?? "performance",
      resolution: {
        width: Math.max(1, Math.round(Number(form.querySelector("[data-scene-export-width]").value))),
        height: Math.max(1, Math.round(Number(form.querySelector("[data-scene-export-height]").value))),
      },
      frameRate: Number(sceneSelect("export-rate")?.dataset.value ?? previewRate()),
    });
    renderSceneExportState(job);
    sceneExportPollTimer = setTimeout(() => { void pollSceneExportState(); }, 250);
  } catch (error) {
    renderSceneExportState({ state: "failed", error: error instanceof Error ? error.message : String(error) });
  }
});
app.querySelectorAll("[data-scene-export-width],[data-scene-export-height]").forEach(input => input.addEventListener("change", event => {
  const form = app.querySelector("[data-scene-export-form]");
  const aspect = sceneExportAspect();
  const width = form.querySelector("[data-scene-export-width]");
  const height = form.querySelector("[data-scene-export-height]");
  const scale = event.currentTarget === width
    ? Math.max(1, Math.round(Number(width.value) / aspect.numerator))
    : Math.max(1, Math.round(Number(height.value) / aspect.denominator));
  width.value = String(aspect.numerator * scale);
  height.value = String(aspect.denominator * scale);
}));
app.querySelector("[data-scene-export-cancel]").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/scene/export", { method: "DELETE" });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error?.message ?? "取消导出失败");
    renderSceneExportState(job);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  }
});
app.querySelector("[data-timeline-zoom]").addEventListener("input", event => {
  setTimelineZoom(Number(event.target.value));
});
app.querySelectorAll("[data-timeline-zoom-action]").forEach(button => button.addEventListener("click", () => {
  if (button.dataset.timelineZoomAction === "fit") settleTimelineWindow(0, 1);
  if (button.dataset.timelineZoomAction === "out") pinchTimelineZoom(timelinePlayheadFraction(), 1.25);
  if (button.dataset.timelineZoomAction === "in") pinchTimelineZoom(timelinePlayheadFraction(), .8);
}));

const timelineZoomStrip = app.querySelector(".nle-timeline-zoom-strip");
const timelineZoomFraction = event => {
  const rectangle = timelineZoomStrip.getBoundingClientRect();
  return (rectangle.width === 0 ? 0 : Math.max(0, Math.min(1, (event.clientX - rectangle.left) / rectangle.width)))
    * widestTimelineWindow;
};
timelineZoomStrip.addEventListener("pointerdown", event => {
  event.preventDefault();
  timelineZoomStrip.setPointerCapture(event.pointerId);
  const began = timelineWindow();
  const from = timelineZoomFraction(event);
  const grip = event.target.closest("[data-timeline-zoom-grip]")?.dataset.timelineZoomGrip;
  const windowHeld = event.target.closest("[data-timeline-zoom-window]") !== null;
  if (!windowHeld) {
    settleTimelineWindow(from - began.span / 2, from + began.span / 2);
    timelineZoomDrag = { kind: "window", began: timelineWindow(), from };
  } else {
    timelineZoomDrag = { kind: grip ?? "window", began, from };
  }
});
timelineZoomStrip.addEventListener("pointermove", event => {
  if (timelineZoomDrag === undefined || event.buttons !== 1) return;
  const at = timelineZoomFraction(event);
  if (timelineZoomDrag.kind === "start") {
    settleTimelineWindow(Math.min(at, timelineZoomDrag.began.end - narrowestTimelineWindow()), timelineZoomDrag.began.end);
  } else if (timelineZoomDrag.kind === "end") {
    settleTimelineWindow(timelineZoomDrag.began.start, Math.max(at, timelineZoomDrag.began.start + narrowestTimelineWindow()));
  } else {
    const shift = at - timelineZoomDrag.from;
    settleTimelineWindow(timelineZoomDrag.began.start + shift, timelineZoomDrag.began.end + shift);
  }
});
const finishTimelineZoom = event => {
  timelineZoomDrag = undefined;
  try { timelineZoomStrip.releasePointerCapture(event.pointerId); } catch { /* already released */ }
};
timelineZoomStrip.addEventListener("pointerup", finishTimelineZoom);
timelineZoomStrip.addEventListener("pointercancel", finishTimelineZoom);
timelineZoomStrip.addEventListener("dblclick", () => settleTimelineWindow(0, 1));

app.querySelector(".nle-timeline-scroll").addEventListener("wheel", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    event.preventDefault();
    const scale = app.querySelector(".nle-ruler-scale");
    const rectangle = scale.getBoundingClientRect();
    const anchor = rectangle.width === 0 ? .5 : (event.clientX - rectangle.left) / rectangle.width;
    pinchTimelineZoom(anchor, Math.exp(event.deltaY * .004));
    return;
  }
  if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    event.preventDefault();
    const delta = event.shiftKey ? event.deltaY : event.deltaX;
    const scale = app.querySelector(".nle-ruler-scale");
    slideTimelineWindow(delta / Math.max(1, scale.clientWidth));
  }
}, { passive: false });

timelinePanel.addEventListener("click", event => {
  const monitor = event.target.closest("[data-timeline-monitor-kind]");
  if (monitor) {
    event.stopPropagation();
    selectTimelineSubject(monitor.dataset.timelineMonitorKind, monitor.dataset.timelineMonitorRef);
    return;
  }
  const lock = event.target.closest("[data-timeline-track-lock]");
  if (lock) {
    event.stopPropagation();
    const projected = snapshot?.scene.performances.find(entry => entry.id === activePerformanceId)
      ?.tracks.find(entry => entry.id === lock.dataset.timelineTrackLock);
    if (projected !== undefined) {
      void transactView([{
        kind: "track-lock.set",
        performance: activePerformanceId,
        track: projected.id,
        locked: !projected.locked,
      }], { success: projected.locked ? `已解锁：${projected.name}` : `已锁定：${projected.name}` });
    }
    return;
  }
  const shot = event.target.closest("[data-timeline-shot]");
  if (shot) { selectTimelineShot(shot.dataset.timelineShot, shot.dataset.timelineCamera); return; }
  const item = event.target.closest("[data-timeline-item]");
  if (item) { selectTimelineTrack(item.dataset.timelineTrack, item.dataset.timelineItem); return; }
  const track = event.target.closest("[data-timeline-track]");
  if (track) { selectTimelineTrack(track.dataset.timelineTrack); return; }
  const shots = event.target.closest("[data-timeline-shots]");
  if (shots && activePerformanceId !== undefined) {
    timelineSelection = { kind: "shots", id: shots.dataset.timelineShots, performance: activePerformanceId };
    monitoredCameraId = shots.dataset.timelineShots;
    setMonitorMode("shot");
    populateTimeline(snapshot);
  }
});
timelinePanel.addEventListener("keydown", event => {
  if (!["Enter", " "].includes(event.key)) return;
  const target = event.target.closest("[role=button]");
  if (target === null) return;
  event.preventDefault();
  target.click();
});
timelinePanel.addEventListener("pointerdown", event => {
  if (event.button !== 0 || event.target.closest("button,select,input")) return;
  const surface = event.target.closest("[data-timeline-scrub],[data-timeline-ruler]");
  if (surface === null) return;
  timelineScrubPointer = { id: event.pointerId, surface };
  previewPlaying = false;
  previousRenderTime = undefined;
  surface.setPointerCapture?.(event.pointerId);
  seekTimelinePointer(surface, event);
});
timelinePanel.addEventListener("pointermove", event => {
  if (timelineScrubPointer?.id !== event.pointerId || event.buttons !== 1) return;
  seekTimelinePointer(timelineScrubPointer.surface, event);
});
const finishTimelineScrub = event => {
  if (timelineScrubPointer?.id !== event.pointerId) return;
  timelineScrubPointer.surface.releasePointerCapture?.(event.pointerId);
  timelineScrubPointer = undefined;
};
timelinePanel.addEventListener("pointerup", finishTimelineScrub);
timelinePanel.addEventListener("pointercancel", finishTimelineScrub);

app.querySelector("[data-library-search]").addEventListener("input", () => renderLibraryContent());
app.querySelector("[data-object-search]").addEventListener("input", () => {
  if (snapshot !== undefined) populateHierarchy(snapshot);
});

app.querySelectorAll("[data-collapse]").forEach(button => button.addEventListener("click", () => {
  const target = button.dataset.collapse;
  const panel = target === "assets" ? app.querySelector(".asset-panel") : app.querySelector(".inspector-panel");
  panel.dataset.collapsed = "true";
  shell.dataset[`${target}Collapsed`] = "true";
  button.setAttribute("aria-expanded", "false");
}));
app.querySelectorAll("[data-reveal]").forEach(button => button.addEventListener("click", () => {
  const target = button.dataset.reveal;
  const panel = target === "assets" ? app.querySelector(".asset-panel") : app.querySelector(".inspector-panel");
  panel.dataset.collapsed = "false";
  shell.dataset[`${target}Collapsed`] = "false";
  app.querySelector(`[data-collapse="${target}"]`)?.setAttribute("aria-expanded", "true");
}));

app.querySelector("[data-create-camera]").addEventListener("click", () => {
  const nextNumber = (snapshot?.scene.cameras.length ?? 0) + 1;
  commitGeneratedCamera(`Camera ${nextNumber}`, camera, camera.fov, { source: "director-view" });
});
app.querySelectorAll("[data-toast]").forEach(button => button.addEventListener("click", () => showToast(button.dataset.toast)));

app.querySelectorAll("[data-tool]").forEach(button => button.addEventListener("click", () => {
  if (shell.dataset.preview === "open") return;
  const tool = button.dataset.tool;
  app.querySelectorAll("[data-tool]").forEach(candidate => candidate.setAttribute("aria-pressed", String(candidate === button)));
  transform.detach();
  transformHelper.visible = false;
  if (tool !== "select") {
    transform.setMode(tool);
    if (selectedKind === "object" && selected) {
      transform.attach(selected.group);
      transformHelper.visible = true;
    }
  }
}));
app.querySelector("[data-ground-tool]").addEventListener("click", groundSelectedObject);
const displayTools = app.querySelector("[data-display-tools]");
const displayMenu = app.querySelector("[data-display-menu]");
function setDisplayMenuOpen(open) {
  displayMenu.hidden = !open;
  displayTools.setAttribute("aria-expanded", String(open));
}
displayTools.addEventListener("click", event => {
  event.stopPropagation();
  setDisplayMenuOpen(displayMenu.hidden);
});
displayMenu.addEventListener("click", event => event.stopPropagation());
addEventListener("click", () => setDisplayMenuOpen(false));
app.querySelector("[data-display-ground]").addEventListener("change", event => {
  editorGroundVisible = event.target.checked;
  floor.visible = worldGroundVisible && editorGroundVisible;
});
app.querySelector("[data-display-grid]").addEventListener("change", event => setGridVisible(event.target.checked, true));
app.querySelector("[data-display-labels]").addEventListener("change", event => {
  objectLabelsVisible = event.target.checked;
  updateObjectLabels();
});
app.querySelector("[data-display-gizmo]").addEventListener("change", event => {
  app.querySelector(".orientation-gizmo").hidden = !event.target.checked;
});
app.querySelector("[data-camera-target-cancel]").addEventListener("click", () => cancelCameraTargeting());

transform.addEventListener("dragging-changed", event => {
  orbit.enabled = !event.value && selectedKind !== "camera" && shell.dataset.preview !== "open";
  if (!event.value && selected) {
    const entry = selected;
    renderObjectProperties(entry);
    void commitObjectTransform(entry);
  }
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function sceneHitAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, selectedKind === "camera" ? previewCamera : camera);
  return raycaster.intersectObjects([...objects.values()].map(entry => entry.group), true)
    .find(entry => entry.object.userData.sceneObject);
}

function activateSceneHit(hit) {
  if (cameraTargeting !== undefined) {
    if (!hit) { showToast("请点击场景中的角色或物体"); return; }
    const target = objects.get(hit.object.userData.sceneObject);
    if (target === undefined) return;
    if (cameraTargeting.stage === "foreground") {
      cameraTargeting.foreground = target;
      cameraTargeting.stage = "focus";
      updateCameraTargetPrompt(`再点击 ${target.record.name} 注视的对象`);
      showToast(`前景角色：${target.record.name}`);
      return;
    }
    if (cameraTargeting.stage === "focus") {
      if (cameraTargeting.foreground?.record.id === target.record.id) { showToast("注视对象需要与前景角色不同"); return; }
      const { entry, foreground } = cameraTargeting;
      generateOverShoulderCamera(entry, foreground, target);
      cancelCameraTargeting();
      return;
    }
    const { entry } = cameraTargeting;
    generateSubjectCamera(entry, target);
    cancelCameraTargeting();
    return;
  }
  if (hit) selectObject(hit.object.userData.sceneObject);
  else selectEnvironment();
}

canvas.addEventListener("pointerdown", event => {
  if (shell.dataset.preview === "open" || event.button !== 0) return;
  viewportPointerGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    transform: transform.dragging || transform.axis !== null,
    placement: assetPlacement !== undefined,
  };
  if (assetPlacement !== undefined) {
    event.preventDefault();
    updateAssetPlacement(event.clientX, event.clientY);
    canvas.setPointerCapture?.(event.pointerId);
  }
});

canvas.addEventListener("pointermove", event => {
  if (assetPlacement !== undefined) updateAssetPlacement(event.clientX, event.clientY);
  if (viewportPointerGesture?.pointerId !== event.pointerId) return;
  viewportPointerGesture.moved ||= Math.hypot(
    event.clientX - viewportPointerGesture.startX,
    event.clientY - viewportPointerGesture.startY,
  ) > 3;
});

function finishViewportPointer(event) {
  if (viewportPointerGesture?.pointerId !== event.pointerId) return;
  const gesture = viewportPointerGesture;
  viewportPointerGesture = undefined;
  if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (gesture.placement) {
    if (event.type === "pointerup") {
      updateAssetPlacement(event.clientX, event.clientY);
      confirmAssetPlacement();
    }
    return;
  }
  if (event.type !== "pointerup" || gesture.moved || gesture.transform || transform.dragging || transform.axis !== null) return;
  activateSceneHit(sceneHitAt(event.clientX, event.clientY));
}
canvas.addEventListener("pointerup", finishViewportPointer);
canvas.addEventListener("pointercancel", finishViewportPointer);
canvas.addEventListener("dblclick", event => {
  if (shell.dataset.preview === "open" || assetPlacement !== undefined || cameraTargeting !== undefined) return;
  const hit = sceneHitAt(event.clientX, event.clientY);
  if (!hit) return;
  selectObject(hit.object.userData.sceneObject);
  frameObject();
});

addEventListener("keydown", event => {
  if (event.defaultPrevented) return;
  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void updateSnapshot("/api/scene/save", {}, { success: "Scene Project 已保存" });
    return;
  }
  if (command && event.key.toLowerCase() === "z") {
    event.preventDefault();
    const path = event.shiftKey ? "/api/scene/redo" : "/api/scene/undo";
    if ((event.shiftKey && snapshot?.canRedo) || (!event.shiftKey && snapshot?.canUndo)) {
      void updateSnapshot(path, {}, { success: event.shiftKey ? "已重做" : "已撤销" });
    }
    return;
  }
  if (event.target.matches?.("input,textarea,select")) return;
  const navigationKey = event.key.toLowerCase();
  if (["w", "a", "s", "d", "q", "e", "shift"].includes(navigationKey)
    && shell.dataset.preview !== "open" && selectedKind !== "camera") {
    event.preventDefault();
    heldNavigationKeys.add(navigationKey);
  }
  if (shell.dataset.preview === "open" && event.code === "Space") {
    if (event.target === collapseTimeline || event.target === revealTimeline) return;
    event.preventDefault();
    togglePreviewPlayback();
    return;
  }
  if (shell.dataset.preview === "open" && event.key === "ArrowLeft") {
    event.preventDefault();
    previewPlaying = false;
    playbackTime = Math.max(0, playbackTime - 1 / previewRate());
    applyPerformanceTime(playbackTime);
    return;
  }
  if (shell.dataset.preview === "open" && event.key === "ArrowRight") {
    event.preventDefault();
    previewPlaying = false;
    playbackTime = Math.min(Math.max(0, previewDuration() - 1 / previewRate()), playbackTime + 1 / previewRate());
    applyPerformanceTime(playbackTime);
    return;
  }
  if (["0", "1", "2", "3"].includes(event.key)) app.querySelector(`[data-tool="${["select", "translate", "rotate", "scale"][Number(event.key)]}"]`)?.click();
  if (event.key === "Escape") {
    if (!displayMenu.hidden) setDisplayMenuOpen(false);
    else if (assetPlacement !== undefined) cancelAssetPlacement();
    else if (cameraTargeting !== undefined) cancelCameraTargeting();
    else if (shell.dataset.preview === "open") setPreviewOpen(false);
    else selectEnvironment();
  }
  if (event.key.toLowerCase() === "f") frameObject();
  if (event.key.toLowerCase() === "g") groundSelectedObject();
});
addEventListener("keyup", event => heldNavigationKeys.delete(event.key.toLowerCase()));
addEventListener("blur", () => heldNavigationKeys.clear());

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  previewCamera.aspect = rect.width / Math.max(1, rect.height);
  previewCamera.updateProjectionMatrix();
  drawTimelineRuler();
  updatePlaybackChrome();
}
new ResizeObserver(resize).observe(shell);
resize();

function updateFreeNavigation(now) {
  const elapsed = previousNavigationTime === undefined ? 0 : Math.min(.05, (now - previousNavigationTime) / 1000);
  previousNavigationTime = now;
  if (elapsed <= 0 || heldNavigationKeys.size === 0 || selectedKind === "camera"
    || shell.dataset.preview === "open" || transform.dragging || assetPlacement !== undefined || cameraTargeting !== undefined) return;
  const forward = orbit.target.clone().sub(camera.position).normalize();
  const right = forward.clone().cross(camera.up).normalize();
  const movement = new THREE.Vector3();
  if (heldNavigationKeys.has("w")) movement.add(forward);
  if (heldNavigationKeys.has("s")) movement.sub(forward);
  if (heldNavigationKeys.has("d")) movement.add(right);
  if (heldNavigationKeys.has("a")) movement.sub(right);
  if (heldNavigationKeys.has("e")) movement.y += 1;
  if (heldNavigationKeys.has("q")) movement.y -= 1;
  if (movement.lengthSq() === 0) return;
  const distance = camera.position.distanceTo(orbit.target);
  const speed = Math.max(.45, Math.min(28, distance * .8)) * (heldNavigationKeys.has("shift") ? 3 : 1);
  const delta = movement.normalize().multiplyScalar(speed * elapsed);
  camera.position.add(delta);
  orbit.target.add(delta);
}

const gizmoAxisDirections = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
const gizmoInverseCamera = new THREE.Quaternion();
const gizmoProjectedDirection = new THREE.Vector3();

function updateOrientationGizmo() {
  const viewCamera = selectedKind === "camera" ? previewCamera : camera;
  gizmoInverseCamera.copy(viewCamera.quaternion).invert();
  const interactive = selectedKind !== "camera" && shell.dataset.preview !== "open";
  for (const [axis, worldDirection] of Object.entries(gizmoAxisDirections)) {
    gizmoProjectedDirection.copy(worldDirection).applyQuaternion(gizmoInverseCamera);
    const x = gizmoProjectedDirection.x * 25;
    const y = -gizmoProjectedDirection.y * 25;
    const length = Math.hypot(x, y);
    const depth = (gizmoProjectedDirection.z + 1) / 2;
    const line = orientationGizmo.querySelector(`[data-gizmo-line="${axis}"]`);
    const endpoint = orientationGizmo.querySelector(`[data-gizmo-axis="${axis}"]`);
    line.style.width = `${Math.max(0, length - 5)}px`;
    line.style.transform = `rotate(${Math.atan2(y, x)}rad)`;
    line.style.opacity = String(.42 + (1 - Math.abs(gizmoProjectedDirection.z)) * .42);
    endpoint.style.setProperty("--gizmo-x", `${x}px`);
    endpoint.style.setProperty("--gizmo-y", `${y}px`);
    endpoint.style.setProperty("--gizmo-scale", String(.82 + depth * .18));
    endpoint.style.opacity = String(.58 + depth * .42);
    endpoint.style.zIndex = String(10 + Math.round(depth * 8));
    endpoint.tabIndex = interactive ? 0 : -1;
    endpoint.setAttribute("aria-disabled", String(!interactive));
  }
}

function snapFreeViewToAxis(axis) {
  if (selectedKind === "camera" || shell.dataset.preview === "open") return;
  const direction = gizmoAxisDirections[axis];
  if (direction === undefined) return;
  const distance = Math.max(.3, camera.position.distanceTo(orbit.target));
  camera.position.copy(orbit.target).addScaledVector(direction, distance);
  camera.up.set(0, 1, 0);
  if (axis === "y") camera.up.set(0, 0, -1);
  camera.lookAt(orbit.target);
  orbit.update();
}

orientationGizmo.querySelectorAll("[data-gizmo-axis]").forEach(button => {
  button.addEventListener("click", () => snapFreeViewToAxis(button.dataset.gizmoAxis));
});

function render(now) {
  if (previewPlaying && shell.dataset.preview === "open" && activePerformancePreview !== undefined) {
    if (previousRenderTime !== undefined) {
      playbackTime += Math.min(.1, (now - previousRenderTime) / 1000);
      const duration = previewDuration();
      if (duration > 0 && playbackTime >= duration - 1 / previewRate()) {
        playbackTime = Math.max(0, duration - 1 / previewRate());
        previewPlaying = false;
      }
      applyPerformanceTime(playbackTime);
      const shown = timelineWindow();
      const progress = duration <= 0 ? 0 : playbackTime / duration;
      const position = (progress - shown.start) / Math.max(1e-6, shown.span);
      if (previewPlaying && position > .88 && shown.end < 1) slideTimelineWindow(Math.max(.25, position - .18));
    }
    previousRenderTime = previewPlaying ? now : undefined;
  }
  updateFreeNavigation(now);
  orbit.update();
  updateOrientationGizmo();
  updateObjectLabels();
  renderer.render(scene, shell.dataset.preview === "open" || selectedKind === "camera" ? previewCamera : camera);
  requestAnimationFrame(render);
}
render();

request("/api/scene")
  .then(loadSnapshot)
  .catch(error => {
    const sceneName = app.querySelector("[data-scene-name]");
    if (sceneName) sceneName.textContent = "未打开 Scene 文档";
    properties.innerHTML = `<div class="property-summary"><i>${icon("scene")}</i><span><strong>选择一个 .scene.json</strong><small>${error.message}</small></span></div>`;
    showToast("当前地址没有 Scene Project；界面布局仍可预览");
  });
