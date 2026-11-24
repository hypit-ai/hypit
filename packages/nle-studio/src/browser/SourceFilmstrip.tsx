import { picturePreviewRates, type PicturePreviewRate } from "@hypit/media";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { mediaSeconds, sourceBlock, useSourcePreview, type PreviewSource, type SourcePreviewBlock } from "./source-preview.js";

type FilmstripSize = { readonly width: number; readonly height: number };
type FilmstripSamples = { readonly density: PicturePreviewRate; readonly blocks: readonly SourcePreviewBlock[] };
type PictureSample = {
  readonly block: SourcePreviewBlock;
  readonly density: PicturePreviewRate;
  readonly tile: number | null;
};
type TimedPictureSample = PictureSample & { readonly at: number };

const checkerSize = 6;
let checkerTile: { readonly base: string; readonly contrast: string; readonly canvas: HTMLCanvasElement } | undefined;

function transparencyPattern(context: CanvasRenderingContext2D, element: HTMLCanvasElement, scaleX: number, scaleY: number) {
  const style = getComputedStyle(element);
  const base = style.getPropertyValue("--nle-media-bg");
  const contrast = style.getPropertyValue("--nle-alpha-checker");
  if (checkerTile?.base !== base || checkerTile.contrast !== contrast) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = checkerSize * 2;
    const tile = canvas.getContext("2d");
    if (tile === null) return null;
    tile.fillStyle = base;
    tile.fillRect(0, 0, canvas.width, canvas.height);
    tile.fillStyle = contrast;
    tile.fillRect(0, 0, checkerSize, checkerSize);
    tile.fillRect(checkerSize, checkerSize, checkerSize, checkerSize);
    checkerTile = { base, contrast, canvas };
  }
  const pattern = context.createPattern(checkerTile.canvas, "repeat");
  pattern?.setTransform(new DOMMatrix([scaleX, 0, 0, scaleY, 0, 0]));
  return pattern;
}

function sampleAt(sources: readonly FilmstripSamples[], seconds: number): PictureSample | undefined {
  for (const { blocks, density } of sources) {
    const block = sourceBlock(blocks, seconds);
    if (block === undefined) continue;
    if (block.image === undefined) return { block, density, tile: null };
    const { atlas, positions } = block;
    if (atlas === undefined) return { block, density, tile: 0 };
    const index = Math.max(0, Math.min((positions?.length ?? 1) - 1,
      Math.floor((seconds - block.start) * density + 1e-8)));
    const at = positions?.[index];
    const tile = at === undefined ? undefined : atlas.samples.find(sample => mediaSeconds(sample.at) === mediaSeconds(at))?.tile;
    return { block, density, tile: tile ?? null };
  }
}

function availablePictures(sources: readonly FilmstripSamples[]): TimedPictureSample[] {
  const pictures: TimedPictureSample[] = [];
  const seen = new Set<SourcePreviewBlock>();
  for (const { blocks, density } of sources) for (const block of blocks) {
    if (block.image === undefined || seen.has(block)) continue;
    seen.add(block);
    if (block.atlas !== undefined) {
      for (const { at, tile } of block.atlas.samples) pictures.push({ block, density, tile, at: mediaSeconds(at) });
    } else {
      const at = block.positions?.[0];
      pictures.push({ block, density, tile: 0,
        at: at === undefined ? (Number.isFinite(block.start) ? block.start : 0) : mediaSeconds(at) });
    }
  }
  return pictures;
}

function nearestPicture(pictures: readonly TimedPictureSample[], seconds: number): PictureSample | undefined {
  let nearest: TimedPictureSample | undefined;
  for (const picture of pictures) {
    if (nearest === undefined || Math.abs(picture.at - seconds) < Math.abs(nearest.at - seconds)) nearest = picture;
  }
  return nearest;
}

export function SourceFilmstrip({ source, sourceAt, tileRatio, layout,
  active = true, timed = false, onPictureAspect, className, placeholder }: {
  readonly source: PreviewSource;
  readonly sourceAt: (pixels: number, spanWidth: number) => ExactTemporalValue | undefined;
  readonly tileRatio: number;
  readonly layout?: FilmstripSize;
  readonly active?: boolean;
  readonly timed?: boolean;
  readonly onPictureAspect?: (aspect: number) => void;
  readonly className: string;
  readonly placeholder?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<HTMLCanvasElement>(undefined);
  const retained = useRef<{ readonly identity: string; readonly samples: readonly FilmstripSamples[] }>(undefined);
  const sourceIdentity = source.target === undefined ? JSON.stringify([source.media, source.version ?? source.generation])
    : JSON.stringify(source.target);
  const [presented, setPresented] = useState(false);
  const hasPlaceholder = placeholder !== undefined;
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const { width: spanWidth, height: spanHeight } = layout ?? measured;
  const observeSize = layout === undefined;
  useLayoutEffect(() => {
    const element = canvas.current;
    if (element === null || !observeSize) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setMeasured(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [observeSize]);

  const width = spanHeight * tileRatio;
  const cells = useMemo(() => width <= 0 ? [] : Array.from({ length: Math.ceil(spanWidth / width) }, (_, index) => {
    const left = index * width;
    return sourceAt((left + Math.min(spanWidth, left + width)) / 2, spanWidth);
  }), [spanWidth, sourceAt, width]);
  const selection = useMemo(() => ({ preset: "filmstrip" as const,
    positions: cells.filter((position): position is ExactTemporalValue => position !== undefined),
  }), [cells]);
  const density = useMemo((): PicturePreviewRate => {
    if (!timed || spanWidth <= 0 || width <= 0) return 2;
    let step = Infinity;
    // Use local source-clock motion within each tile. Cuts and gaps do not define the sampling scale.
    for (let left = 0; left + width <= spanWidth; left += width) {
      const first = sourceAt(left + width / 4, spanWidth);
      const last = sourceAt(left + 3 * width / 4, spanWidth);
      if (first === undefined || last === undefined) continue;
      const difference = Math.abs(mediaSeconds(last) - mediaSeconds(first));
      if (difference > 1e-6) step = Math.min(step, 2 * difference);
    }
    if (step === Infinity && cells.length === 1) {
      const first = sourceAt(spanWidth / 4, spanWidth);
      const last = sourceAt(3 * spanWidth / 4, spanWidth);
      if (first !== undefined && last !== undefined) {
        const difference = Math.abs(mediaSeconds(last) - mediaSeconds(first));
        if (difference > 1e-6) step = 2 * difference * width / spanWidth;
      }
    }
    return picturePreviewRates.find(rate => step * rate >= 1) ?? picturePreviewRates.at(-1)!;
  }, [cells.length, sourceAt, spanWidth, timed, width]);
  const fineSelection = useMemo(() => density === 2 ? undefined : { ...selection, samplesPerSecond: density }, [density, selection]);
  const coarse = useSourcePreview(source, selection, active);
  const fine = useSourcePreview(source, fineSelection, active);
  const positions = useMemo(() => cells.map(position => position === undefined ? undefined : mediaSeconds(position)), [cells]);
  const actualAspect = (fine.find(block => block.displayAspectRatio !== undefined)
    ?? coarse.find(block => block.displayAspectRatio !== undefined))?.displayAspectRatio;
  useLayoutEffect(() => {
    if (actualAspect !== undefined) onPictureAspect?.(actualAspect);
  }, [actualAspect, onPictureAspect]);

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!active || !element || spanWidth <= 0 || spanHeight <= 0 || width <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.min(8192, Math.ceil(spanWidth * ratio));
    const pixelHeight = Math.ceil(spanHeight * ratio);
    const buffer = scratch.current ??= document.createElement("canvas");
    if (buffer.width !== pixelWidth) buffer.width = pixelWidth;
    if (buffer.height !== pixelHeight) buffer.height = pixelHeight;
    const context = buffer.getContext("2d");
    const output = element.getContext("2d");
    if (context === null || output === null) return;
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.imageSmoothingQuality = "high";
    const pixelScale = pixelWidth / spanWidth;
    const backdrop = transparencyPattern(context, element, pixelScale, pixelHeight / spanHeight);
    if (backdrop !== null) context.fillStyle = backdrop;
    const aspect = width / spanHeight;
    const previous = retained.current?.identity === sourceIdentity ? retained.current.samples : [];
    const sources = [{ density, blocks: fine }, { density: 2 as const, blocks: coarse }, ...previous];
    const used = new Map<PicturePreviewRate, Set<SourcePreviewBlock>>();
    let pictures: TimedPictureSample[] | undefined;
    let painted = false;
    for (const [index, seconds] of positions.entries()) {
      if (seconds === undefined) continue;
      // A resolved gap has a null tile. Only a missing sample borrows a nearby picture.
      const sample = sampleAt(sources, seconds) ?? nearestPicture(pictures ??= availablePictures(sources), seconds);
      if (sample === undefined) continue;
      const { block, tile } = sample;
      const blocks = used.get(sample.density) ?? new Set<SourcePreviewBlock>();
      blocks.add(block);
      used.set(sample.density, blocks);
      const { image, atlas } = block;
      if (image === undefined || tile === null) continue;
      const left = Math.round(index * width * pixelScale);
      const right = Math.round((index + 1) * width * pixelScale);
      if (right <= left) continue;
      painted = true;
      const columns = atlas?.columns ?? 1;
      const sourceWidth = atlas?.tileWidth ?? image.naturalWidth;
      const sourceHeight = atlas?.tileHeight ?? image.naturalHeight;
      const cropWidth = Math.min(sourceWidth, sourceHeight * aspect);
      const cropHeight = Math.min(sourceHeight, sourceWidth / aspect);
      if (backdrop !== null) context.fillRect(left, 0, right - left, pixelHeight);
      context.drawImage(image, (tile % columns) * sourceWidth + (sourceWidth - cropWidth) / 2,
        Math.floor(tile / columns) * sourceHeight + (sourceHeight - cropHeight) / 2, cropWidth, cropHeight,
        left, 0, right - left, pixelHeight);
    }
    if (element.width !== pixelWidth) element.width = pixelWidth;
    if (element.height !== pixelHeight) element.height = pixelHeight;
    output.clearRect(0, 0, pixelWidth, pixelHeight);
    output.drawImage(buffer, 0, 0);
    if (used.size > 0) retained.current = { identity: sourceIdentity,
      samples: [...used].sort(([left], [right]) => right - left).map(([density, blocks]) => ({ density, blocks: [...blocks] })) };
    if (hasPlaceholder) setPresented(painted);
  }, [active, coarse, density, fine, hasPlaceholder, positions, sourceIdentity, spanWidth, spanHeight, width]);

  return <><canvas ref={canvas} className={className} aria-hidden="true"/>{!presented && placeholder}</>;
}
