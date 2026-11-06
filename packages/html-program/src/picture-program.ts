import { assertBlobRef, canonicalStringify, compareCodeUnits } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, ResourceId } from "@hypit/hypit/protocol";
import { verifyPictureInterpretation } from "@hypit/media";
import type { PictureInterpretation, PreparedSignalPictureSource } from "@hypit/media";
import { assertFrameSpan } from "@hypit/temporal";
import type { ExactTemporalValue, FrameSpan, TemporalMap } from "@hypit/temporal";

import { presentationCaptureScopeRuntime } from "./capture-scope.js";
import { assertHtmlProgram, htmlArtifactUri } from "./program.js";
import { frameWorkIndexRuntime } from "./frame-work.js";
import { htmlVisualHtml, htmlVisualScript, readHtmlVisual } from "./html-visual.js";
import type { HtmlVisualProgram } from "./html-visual.js";
import type { HtmlPictureReconstruction } from "./picture-reconstruction.js";
import type { HtmlArtifact, HtmlProgram, HtmlVideoSource } from "./types.js";

export type HtmlPictureStyle = { readonly name: string; readonly value: string | number };

type HtmlPictureElementBase = {
  readonly id: string;
  /** Absolute output-frame spans in which this stable element instance exists. */
  readonly spans: readonly FrameSpan[];
  readonly style: readonly HtmlPictureStyle[];
};

export type HtmlPictureElement =
  | (HtmlPictureElementBase & { readonly kind: "box"; readonly children: readonly HtmlPictureElement[] })
  | (HtmlPictureElementBase & {
      readonly kind: "program";
      readonly program: HtmlVisualProgram;
      readonly slots: readonly { readonly name: string; readonly element: HtmlPictureElement }[];
      /** Named temporal-Control positions, indexed from the first enclosing frame. */
      readonly controlPositions?: Readonly<Record<string, readonly (ExactTemporalValue | null)[]>>;
      /** Optional source-local render coordinates expressed on the selected output frame grid. */
      readonly renderFrames?: readonly (number | null)[];
    })
  | (HtmlPictureElementBase & {
      readonly kind: "image";
      readonly artifact: BlobRef;
      readonly picture: PictureInterpretation;
    })
  | (HtmlPictureElementBase & {
      readonly kind: "video";
      readonly source: PreparedSignalPictureSource;
      readonly sampling: TemporalMap;
      readonly reconstruction?: HtmlPictureReconstruction;
      readonly muted?: boolean;
    });

export type HtmlPictureProgramInput = {
  readonly id: string;
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly frameCount: number;
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly root: HtmlPictureElement;
};

const ARTIFACT_URI = /hypit-artifact:\/\/([A-Za-z][A-Za-z0-9._:-]*)/gu;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function style(value: readonly HtmlPictureStyle[], label: string): string {
  const names = new Set<string>();
  return value.map((entry) => {
    assert(/^-?[a-z][a-z0-9-]*$/u.test(entry.name) && !names.has(entry.name),
      `${label} contains an invalid or repeated CSS property ${entry.name}.`);
    names.add(entry.name);
    if (typeof entry.value === "number") assert(Number.isFinite(entry.value), `${label}.${entry.name} is not finite.`);
    else assert(entry.value.length > 0 && !/[;<>{}\\]|!important|[\u0000-\u001f\u007f]/iu.test(entry.value),
      `${label}.${entry.name} is not a self-contained CSS value.`);
    return `${entry.name}:${String(entry.value)}`;
  }).join(";");
}

function mergeSpans(spans: readonly { readonly startFrame: number; readonly endFrameExclusive: number }[]) {
  const result: { startFrame: number; endFrameExclusive: number }[] = [];
  for (const span of [...spans].sort((a, b) => a.startFrame - b.startFrame
    || a.endFrameExclusive - b.endFrameExclusive)) {
    const previous = result.at(-1);
    if (previous !== undefined && span.startFrame <= previous.endFrameExclusive) {
      previous.endFrameExclusive = Math.max(previous.endFrameExclusive, span.endFrameExclusive);
    } else result.push({ ...span });
  }
  return result;
}

type ArtifactPlan = {
  readonly artifact: BlobRef;
  picture?: PictureInterpretation;
  readonly frames: { startFrame: number; endFrameExclusive: number }[];
};

function assertSpans(spans: readonly FrameSpan[], frameCount: number, label: string): void {
  let previousEnd = -1;
  for (const span of spans) {
    assertFrameSpan(span, frameCount);
    assert(span.startFrame >= previousEnd, `${label} frame spans overlap or are unordered.`);
    previousEnd = span.endFrameExclusive;
  }
}

function collectArtifacts(input: HtmlPictureProgramInput): readonly HtmlArtifact[] {
  const plans = new Map<ResourceId, ArtifactPlan>();
  const add = (artifact: BlobRef, spans: readonly FrameSpan[], picture?: PictureInterpretation): void => {
    if (spans.length === 0) return;
    assertBlobRef(artifact);
    const existing = plans.get(artifact.resource);
    assert(existing === undefined || existing.artifact.size === artifact.size
      && existing.artifact.mediaType === artifact.mediaType,
    `HTML renderer Artifact ${artifact.resource} has conflicting metadata.`);
    assert(existing?.picture === undefined || picture === undefined
      || canonicalStringify(existing.picture) === canonicalStringify(picture),
    `HTML renderer picture ${artifact.resource} has conflicting interpretations.`);
    const plan = existing ?? { artifact: structuredClone(artifact), frames: [] };
    if (plan.picture === undefined && picture !== undefined) plan.picture = structuredClone(picture);
    plan.frames.push(...spans.map((span) => ({ ...span })));
    plans.set(artifact.resource, plan);
  };
  const visit = (element: HtmlPictureElement): void => {
    if (element.kind === "image") add(element.artifact, element.spans, element.picture);
    else if (element.kind === "video") add(element.source.source, element.spans);
    else if (element.kind === "program") {
      for (const dependency of readHtmlVisual(element.program).dependencies) {
        add(dependency.artifact, element.spans,
          dependency.kind === "picture" ? dependency.picture : undefined);
      }
      for (const slot of element.slots) visit(slot.element);
    } else for (const child of element.children) visit(child);
  };
  visit(input.root);
  return [...plans.values()].sort((left, right) => compareCodeUnits(
    left.artifact.resource, right.artifact.resource,
  )).map((plan, index): HtmlArtifact => ({
    id: `artifact-${String(index + 1).padStart(4, "0")}`,
    artifact: structuredClone(plan.artifact),
    ...(plan.picture === undefined
      ? { kind: "bytes" as const }
      : { kind: "picture" as const, picture: structuredClone(plan.picture) }),
    usage: { kind: "frames", spans: mergeSpans(plan.frames) },
  }));
}

function preparedPictureExtent(source: PreparedSignalPictureSource): { width: number; height: number } {
  const picture = source.interpretation;
  let width = picture.codedWidth * picture.sampleAspectRatio.numerator / picture.sampleAspectRatio.denominator;
  let height = picture.codedHeight;
  if (picture.rotationDegrees === 90 || picture.rotationDegrees === 270) [width, height] = [height, width];
  assert(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0,
    "HTML renderer video display extent is invalid.");
  return { width, height };
}

function frameRuntime(frameCount: number): string {
  return `(() => {
    let presents;
    let prepared;
    const initialize = spans => {
      htmlPrepareFrameSelection(spans);
      for (const initializer of htmlFrameProgramInitializers) initializer();
      htmlFrameProgramInitializers.length = 0;
      presents = [...document.querySelectorAll('[data-hypit-contribution-start-frame]')].map(element => ({
        element,
        startFrame: Number(element.getAttribute('data-hypit-contribution-start-frame')),
        endFrameExclusive: Number(element.getAttribute('data-hypit-contribution-end-frame')),
        spans: (element.getAttribute('data-hypit-contribution-spans') || '').split(',').filter(Boolean).map(value => {
          const [startFrame, endFrameExclusive] = value.split(':').map(Number);
          return { startFrame, endFrameExclusive };
        }),
      }));
    };
    const applyPreparedFrame = async frame => {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame >= ${frameCount}) throw new Error('HTML Program frame is outside its domain.');
      for (const present of presents) present.element.style.display = present.spans.some(span =>
        frame >= span.startFrame && frame < span.endFrameExclusive) ? '' : 'none';
      const pending = [];
      window.dispatchEvent(new CustomEvent('hypit-frame', { detail: { frame, waitUntil(value) { pending.push(Promise.resolve(value)); } }}));
      await Promise.all(pending);
      void document.documentElement.getBoundingClientRect();
    };
    const begin = (spans, frame) => {
      if (prepared !== undefined) return prepared;
      prepared = (async () => { initialize(spans); await document.fonts.ready; await applyPreparedFrame(frame); })();
      return prepared;
    };
    const applyFrame = async frame => {
      if (!Number.isSafeInteger(frame) || frame < 0 || frame >= ${frameCount}) throw new Error('HTML Program frame is outside its domain.');
      if (prepared === undefined) return begin(undefined, frame);
      await prepared;
      await applyPreparedFrame(frame);
    };
    Object.defineProperty(window, '__hypitFrameProgram', { configurable: false, writable: false, value: Object.freeze({
      frameCount: ${frameCount}, prepare(spans) { return begin(spans, spans?.[0]?.startFrame ?? 0); }, applyFrame,
    }) });
  })();`;
}

/** Compile already-evaluated Picture frames directly; no Track, Timeline or Composition value exists. */
export function compileHtmlPictureProgram(input: HtmlPictureProgramInput): HtmlProgram {
  assert(input.id.trim().length > 0, "HTML Picture Programme id is empty.");
  assert(Number.isSafeInteger(input.frameRate.numerator) && input.frameRate.numerator > 0
    && Number.isSafeInteger(input.frameRate.denominator) && input.frameRate.denominator > 0,
  "HTML Picture Programme frame rate is invalid.");
  assert(Number.isSafeInteger(input.canvas.width) && input.canvas.width > 0
    && Number.isSafeInteger(input.canvas.height) && input.canvas.height > 0
    && input.canvas.clearColor.length > 0
    && Number.isSafeInteger(input.frameCount) && input.frameCount > 0,
  "HTML Picture Programme output is invalid.");
  const validate = (element: HtmlPictureElement): void => {
    assertSpans(element.spans, input.frameCount, `HTML Picture ${element.id}`);
    if (element.kind === "box") for (const child of element.children) validate(child);
    else if (element.kind === "program") {
      for (const slot of element.slots) validate(slot.element);
      const start = element.spans[0]!.startFrame;
      const end = element.spans.at(-1)!.endFrameExclusive;
      const length = end - start;
      if (element.renderFrames !== undefined) {
        assert(element.renderFrames.length === length,
          `HTML Picture ${element.id} render-frame map has the wrong length.`);
      }
      for (const [name, positions] of Object.entries(element.controlPositions ?? {})) {
        assert(name.length > 0 && positions.length === length,
          `HTML Picture ${element.id} Control ${name} has the wrong length.`);
      }
    }
  };
  validate(input.root);
  const artifacts = collectArtifacts(input);
  const artifactIds = new Map(artifacts.map((entry) => [entry.artifact.resource, entry.id] as const));
  const videoSources: HtmlVideoSource[] = [];
  const programs: { id: string; startFrame: number; durationFrames: number;
    spans: readonly FrameSpan[]; controlPositions?: Readonly<Record<string, readonly (ExactTemporalValue | null)[]>>;
    renderFrames?: readonly (number | null)[]; program: ReturnType<typeof readHtmlVisual> }[] = [];
  const css: string[] = [];
  let serial = 0;
  const render = (element: HtmlPictureElement): string => {
    serial += 1;
    const domId = `hypit-picture-${serial}`;
    const startFrame = element.spans[0]?.startFrame ?? 0;
    const endFrameExclusive = element.spans.at(-1)?.endFrameExclusive ?? 0;
    const encodedSpans = element.spans.map((span) => `${span.startFrame}:${span.endFrameExclusive}`).join(",");
    const common = `id="${domId}" data-hypit-element-id="${escapeHtml(element.id)}" data-hypit-contribution-start-frame="${startFrame}" data-hypit-contribution-end-frame="${endFrameExclusive}" data-hypit-contribution-spans="${encodedSpans}" style="${escapeHtml(style(element.style, `HTML Picture ${element.id}`))}"`;
    if (element.spans.length === 0) return `<div ${common} hidden></div>`;
    if (element.kind === "box") return `<div ${common}>${element.children.map((child) => render(child)).join("")}</div>`;
    if (element.kind === "program") {
      const program = readHtmlVisual(element.program);
      const names = new Set<string>();
      const slots = new Map(element.slots.map((slot) => {
        assert(slot.name.length > 0 && !names.has(slot.name), `HTML Picture ${element.id} repeats slot ${slot.name}.`);
        names.add(slot.name);
        return [slot.name, render(slot.element)] as const;
      }));
      programs.push({ id: domId, startFrame, durationFrames: endFrameExclusive - startFrame,
        spans: element.spans.map((span) => ({ ...span })),
        ...(element.controlPositions === undefined ? {} : {
          controlPositions: structuredClone(element.controlPositions),
        }),
        ...(element.renderFrames === undefined ? {} : { renderFrames: [...element.renderFrames] }),
        program });
      if (program.css !== undefined) css.push(`@scope (#${domId}) { ${program.css} }`);
      return `<div ${common}>${htmlVisualHtml(program, slots)}</div>`;
    }
    if (element.kind === "image") {
      verifyPictureInterpretation(element.picture, `HTML Picture ${element.id}`);
      return `<img ${common} data-hypit-artifact-src="${htmlArtifactUri(element.artifact.resource)}"/>`;
    }
    const extent = preparedPictureExtent(element.source);
    videoSources.push({
      kind: "media", id: domId, elementId: element.id,
      startFrame, endFrameExclusive,
      usage: { kind: "frames", spans: element.spans.map((span) => ({ ...span })) },
      source: structuredClone(element.source), sampling: structuredClone(element.sampling),
      ...(element.reconstruction === undefined ? {} : {
        reconstruction: structuredClone(element.reconstruction),
      }),
    });
    const plane = `width:${extent.width}px;height:${extent.height}px;${style(element.style, `HTML Picture ${element.id}`)}`;
    return `<span id="${domId}" data-hypit-element-id="${escapeHtml(element.id)}" data-hypit-contribution-start-frame="${startFrame}" data-hypit-contribution-end-frame="${endFrameExclusive}" data-hypit-contribution-spans="${encodedSpans}" data-hypit-media-display-plane style="${escapeHtml(plane)}"><span data-hypit-media-payload-host style="position:relative;display:block;width:100%;height:100%;object-fit:inherit;object-position:inherit"><video data-hypit-video-source="media" data-hypit-start-frame="${startFrame}" data-hypit-end-frame="${endFrameExclusive}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:inherit;object-position:inherit;pointer-events:none" muted playsinline data-hypit-artifact-src="${htmlArtifactUri(element.source.source.resource)}"></video><span data-hypit-decoded-media-slot style="position:absolute;inset:0;overflow:hidden;object-fit:inherit;object-position:inherit;pointer-events:none"></span></span></span>`;
  };
  const frames = `<div data-hypit-capture-root data-hypit-contribution-start-frame="0" data-hypit-contribution-end-frame="${input.frameCount}" data-hypit-contribution-spans="0:${input.frameCount}" style="position:absolute;inset:0;overflow:hidden;pointer-events:none;isolation:isolate">${render(input.root)}</div>`;
  const initializers = programs.length === 0 ? "" : `<script>htmlRegisterFrameProgramInitializer(() => {\n${htmlVisualScript(programs, {
    ...input.canvas, frameRate: input.frameRate,
  })}\n});</script>`;
  let html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}[data-hypit-program-root]{position:relative;overflow:hidden;background:transparent}:where([data-hypit-media-display-plane]){display:inline-block;width:var(--hypit-media-intrinsic-width);height:var(--hypit-media-intrinsic-height)}*,*::before,*::after{box-sizing:border-box}${css.join("\n")}</style></head>
<body><script>${frameWorkIndexRuntime}</script><div data-hypit-program-root data-hypit-program-id="${escapeHtml(input.id)}" data-hypit-width="${input.canvas.width}" data-hypit-height="${input.canvas.height}" data-hypit-frame-numerator="${input.frameRate.numerator}" data-hypit-frame-denominator="${input.frameRate.denominator}" data-hypit-frame-count="${input.frameCount}" style="width:${input.canvas.width}px;height:${input.canvas.height}px"><div data-hypit-canvas-clear style="position:absolute;inset:0;background:${escapeHtml(input.canvas.clearColor)};pointer-events:none"></div>${frames}</div><script>${presentationCaptureScopeRuntime}</script>${initializers}<script>${frameRuntime(input.frameCount)}</script></body></html>`;
  html = html.replace(ARTIFACT_URI, (_uri, resource: string) => {
    const id = artifactIds.get(resource as ResourceId);
    assert(id !== undefined, `HTML Picture Programme references undeclared Artifact ${resource}.`);
    return htmlArtifactUri(id);
  });
  const program: HtmlProgram = {
    frameRate: { ...input.frameRate }, frameCount: input.frameCount,
    canvas: { width: input.canvas.width, height: input.canvas.height },
    artifacts, videoSources, html,
  };
  assertHtmlProgram(program);
  return program;
}
