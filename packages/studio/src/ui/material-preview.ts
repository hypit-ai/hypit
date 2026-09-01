import type { StudioMaterialPreview } from "../shared.js";

type Storyboard = {
  readonly imageUrl: string;
  readonly count: number;
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
};

const generatedAudio = new Map<string, Promise<string | undefined>>();
const resolvedAudio = new Map<string, string | undefined>();
const storyboards = new Map<string, Promise<Storyboard | undefined>>();
const resolvedStoryboards = new Map<string, Storyboard | undefined>();

function previewUrl(preview: StudioMaterialPreview): string {
  if (preview.source.kind === "artifact") return `/__studio/material/${preview.source.resource}`;
  const query = new URLSearchParams({
    module: preview.source.module,
    version: preview.source.version,
    surface: preview.source.surface,
  });
  return `/__studio/surface-preview?${query.toString()}`;
}

function positiveHeader(response: Response, name: string): number | undefined {
  const value = Number(response.headers.get(name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function loadStoryboard(materialUrl: string): Promise<Storyboard | undefined> {
  const storyboardUrl = materialUrl.replace("/__studio/material/", "/__studio/storyboard/");
  if (storyboardUrl === materialUrl) return undefined;
  const response = await fetch(storyboardUrl);
  if (!response.ok) return undefined;
  const count = positiveHeader(response, "x-hypit-storyboard-count");
  const columns = positiveHeader(response, "x-hypit-storyboard-columns");
  const rows = positiveHeader(response, "x-hypit-storyboard-rows");
  const tileWidth = positiveHeader(response, "x-hypit-storyboard-tile-width");
  const tileHeight = positiveHeader(response, "x-hypit-storyboard-tile-height");
  if (count === undefined || columns === undefined || rows === undefined
    || tileWidth === undefined || tileHeight === undefined) return undefined;
  return {
    imageUrl: URL.createObjectURL(await response.blob()),
    count: Math.floor(count),
    columns: Math.floor(columns),
    rows: Math.floor(rows),
    tileWidth: Math.floor(tileWidth),
    tileHeight: Math.floor(tileHeight),
  };
}

function storyboardFor(url: string): Promise<Storyboard | undefined> {
  const held = storyboards.get(url);
  if (held !== undefined) return held;
  const pending = loadStoryboard(url).catch(() => undefined).then((storyboard) => {
    resolvedStoryboards.set(url, storyboard);
    return storyboard;
  });
  storyboards.set(url, pending);
  return pending;
}

function renderStoryboard(target: HTMLElement, storyboard: Storyboard): void {
  if (!target.isConnected) return;
  const lane = target.closest<HTMLElement>(".lane");
  if (lane === null) return;
  const targetBox = target.getBoundingClientRect();
  const laneBox = lane.getBoundingClientRect();
  const visibleLeft = Math.max(targetBox.left, laneBox.left);
  const visibleRight = Math.min(targetBox.right, laneBox.right);
  if (visibleRight <= visibleLeft || targetBox.width < 1 || targetBox.height < 1) return;

  const slotWidth = Math.max(1, targetBox.height * storyboard.tileWidth / storyboard.tileHeight);
  const firstSlot = Math.floor((visibleLeft - targetBox.left) / slotWidth);
  const lastSlot = Math.ceil((visibleRight - targetBox.left) / slotWidth);
  const frames: HTMLElement[] = [];
  for (let slot = firstSlot; slot < lastSlot; slot += 1) {
    const left = slot * slotWidth;
    const progress = Math.max(0, Math.min(1, (left + slotWidth / 2) / targetBox.width));
    const index = Math.min(storyboard.count - 1, Math.floor(progress * storyboard.count));
    const column = index % storyboard.columns;
    const row = Math.floor(index / storyboard.columns);
    const frame = document.createElement("span");
    frame.className = "clip-video-frame";
    frame.style.left = `${left}px`;
    // Adjacent frames share the same fractional boundary. Adding a full CSS
    // pixel here lets the next frame overpaint roughly 3% of a 9:16 thumbnail,
    // which reads as a horizontal crop even though the atlas itself is exact.
    frame.style.width = `${slotWidth}px`;
    frame.style.backgroundImage = `url(${JSON.stringify(storyboard.imageUrl)})`;
    frame.style.backgroundSize = `${storyboard.columns * slotWidth}px ${storyboard.rows * targetBox.height}px`;
    frame.style.backgroundPosition = `${-column * slotWidth}px ${-row * targetBox.height}px`;
    frames.push(frame);
  }
  target.replaceChildren(...frames);
  target.classList.add("ready");
}

async function audioWaveform(url: string): Promise<string | undefined> {
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const audioContext = new AudioContext();
  try {
    const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
    const width = 2048;
    const height = 56;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const samplesPerColumn = Math.max(1, Math.floor(buffer.length / width));
    const segments: string[] = [];
    for (let x = 0; x < width; x += 1) {
      const from = x * samplesPerColumn;
      const to = Math.min(buffer.length, from + samplesPerColumn);
      let peak = 0;
      for (const channel of channels) {
        for (let sample = from; sample < to; sample += 1) {
          peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
        }
      }
      const amplitude = Math.max(1, peak * (height - 4));
      const top = (height - amplitude) / 2;
      segments.push(`M${x} ${top.toFixed(2)}V${(top + amplitude).toFixed(2)}`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${segments.join("")}" fill="none" stroke="rgba(255,255,255,.76)" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } finally {
    await audioContext.close();
  }
}

function audioPreview(url: string): Promise<string | undefined> {
  const held = generatedAudio.get(url);
  if (held !== undefined) return held;
  const pending = audioWaveform(url).catch(() => undefined).then((waveform) => {
    resolvedAudio.set(url, waveform);
    return waveform;
  });
  generatedAudio.set(url, pending);
  return pending;
}

/** Mount only a real selected artifact; failed decoding deliberately leaves the item plain. */
export function mountMaterialPreview(target: HTMLElement, preview: StudioMaterialPreview): void {
  const url = previewUrl(preview);
  target.classList.add(`clip-material-${preview.kind}`);
  if (preview.kind === "video") {
    if (resolvedStoryboards.has(url)) {
      const storyboard = resolvedStoryboards.get(url);
      if (storyboard !== undefined) renderStoryboard(target, storyboard);
      return;
    }
    void storyboardFor(url).then((storyboard) => {
      if (storyboard !== undefined) renderStoryboard(target, storyboard);
    });
    return;
  }
  if (preview.kind === "image") {
    target.style.backgroundImage = `url(${JSON.stringify(url)})`;
    target.classList.add("ready");
    return;
  }
  if (resolvedAudio.has(url)) {
    const waveform = resolvedAudio.get(url);
    if (waveform !== undefined) {
      target.style.backgroundImage = `url(${JSON.stringify(waveform)})`;
      target.classList.add("ready");
    }
    return;
  }
  void audioPreview(url).then((waveform) => {
    if (waveform === undefined || !target.isConnected) return;
    target.style.backgroundImage = `url(${JSON.stringify(waveform)})`;
    target.classList.add("ready");
  });
}
