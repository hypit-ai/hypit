import { randomUUID } from "node:crypto";
import { glob } from "node:fs/promises";
import { CanvasError, identity, readMediaReference, record, text } from "@hypit/canvas";
import type { CanvasTimelinePort } from "@hypit/canvas-studio";
import type { CanvasTimelinePlaced, CanvasTimelineResponse, CanvasTimelineTarget } from "@hypit/canvas-studio/protocol";
import { NleEditingSurfaceRevisionConflict } from "@hypit/nle/surface";
import { openNleStudioProductSession, type NleStudioProductSession } from "@hypit/nle-studio";
import type { ProjectHost } from "@hypit/project";
import { resolveNodeProjectFile } from "@hypit/project/node";

type Target = {
  readonly id: string;
  readonly editor: NleStudioProductSession;
  readonly placements: Map<string, CanvasTimelinePlaced>;
};

async function observeTarget(target: Target): Promise<CanvasTimelineTarget> {
  const [project, timeline, status] = await Promise.all([
    target.editor.observe({ kind: "project" }), target.editor.observe({ kind: "timeline" }), target.editor.observe({ kind: "status" }),
  ]);
  if (project.kind !== "project" || timeline.kind !== "timeline" || status.kind !== "status") {
    throw new Error("NLE Studio returned an invalid timeline observation.");
  }
  const scene = timeline.value.scene;
  return {
    target: target.id, document: project.value.document, name: project.value.name, composition: scene.composition,
    compositions: timeline.value.compositions, tracks: scene.tracks.filter(track => !track.locked && track.role === track.kind)
      .map(({ id, name, kind }) => ({ id, name, kind })),
    editRate: scene.editRate, endFrame: scene.maximumFrame,
    projectRevision: status.value.projectRevision,
  };
}

function frameNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new CanvasError("invalid-placement", label + " must be a non-negative integer.");
  return value;
}

async function save(target: Target, request: string, placed: CanvasTimelinePlaced) {
  try {
    await target.editor.save();
    const { saveIssue: _issue, ...saved } = placed;
    target.placements.set(request, saved);
    return saved;
  } catch (error) {
    const pending = { ...placed, saveIssue: error instanceof Error ? error.message : String(error) };
    target.placements.set(request, pending);
    return pending;
  }
}

export function openCanvasTimeline(project: ProjectHost): CanvasTimelinePort {
  const root = project.boundary.root;
  let target: Target | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  async function release() {
    const previous = target;
    target = undefined;
    await previous?.editor.close();
  }
  async function handle(value: unknown): Promise<CanvasTimelineResponse> {
    const request = record(value, "Canvas timeline request");
    const exact = (...fields: string[]) => record(value, "Canvas timeline request", ["kind", ...fields]);
    if (request.kind === "documents") {
      exact();
      const paths: string[] = [];
      for await (const path of glob("**/*.svml", { cwd: root, exclude: ["**/node_modules/**", "**/.git/**", "**/.hypit/**"] })) paths.push(path);
      return { kind: "documents", paths: paths.sort((a, b) => a.localeCompare(b)) };
    }
    if (request.kind === "open") {
      exact("document");
      const { path: document } = await resolveNodeProjectFile(root, text(request.document, "NLE document"), "NLE document");
      const editor = await openNleStudioProductSession({ project, document });
      const next: Target = { id: randomUUID(), editor, placements: new Map() };
      try {
        const observation = await observeTarget(next);
        await release();
        target = next;
        return { kind: "target", value: observation };
      } catch (error) {
        await editor.close();
        throw error;
      }
    }
    if (request.kind === "close") {
      exact("target");
      if (target?.id === request.target) await release();
      return { kind: "closed" };
    }
    const selected = target;
    if (!selected || selected.id !== request.target) throw new CanvasError("editing-target-expired", "Open a timeline document first.");
    if (request.kind === "select") {
      exact("target", "composition");
      const current = await observeTarget(selected);
      await selected.editor.operate({
        kind: "composition.select", target: text(request.composition, "Composition"),
        composition: current.composition, expectedProjectRevision: current.projectRevision,
      });
      return { kind: "target", value: await observeTarget(selected) };
    }
    if (request.kind === "place") {
      exact("target", "request", "composition", "expectedProjectRevision", "media", "track", "atFrame", "durationFrames", "insert", "includeAudio");
      const id = identity("placement-" + text(request.request, "Placement request"), "Placement request");
      const prior = selected.placements.get(id);
      if (prior) return prior.saveIssue === undefined ? prior : await save(selected, id, prior);
      const media = readMediaReference(request.media);
      if (request.includeAudio !== undefined && typeof request.includeAudio !== "boolean") throw new CanvasError("invalid-placement", "Include audio must be a boolean.");
      const composition = text(request.composition, "Composition");
      const trackId = request.track === undefined ? undefined : text(request.track, "Track");
      if (request.insert !== undefined && typeof request.insert !== "boolean") throw new CanvasError("invalid-placement", "Insert must be a boolean.");
      if (request.insert && trackId === undefined) throw new CanvasError("invalid-placement", "Choose a Track for insertion.");
      try {
        const receipt = await selected.editor.operate({
          kind: "media.materialize", composition, media: media.path,
          atFrame: frameNumber(request.atFrame, "Timeline frame"),
          expectedProjectRevision: frameNumber(request.expectedProjectRevision, "Project revision"),
          ...(trackId === undefined ? {} : request.insert ? { track: trackId, insertTracks: [trackId] } : { track: trackId }),
          ...(request.durationFrames === undefined ? {} : { durationFrames: frameNumber(request.durationFrames, "Duration") }),
          ...(request.includeAudio === undefined ? {} : { includeAudio: request.includeAudio }),
        });
        const { item, track } = receipt.result ?? {};
        if (typeof item !== "string" || typeof track !== "string") throw new Error("NLE Studio returned an invalid placement receipt.");
        return await save(selected, id, { kind: "placed", composition, item, track });
      } catch (error) {
        if (error instanceof NleEditingSurfaceRevisionConflict) throw new CanvasError("revision-conflict", error.message);
        throw error;
      }
    }
    throw new CanvasError("invalid-placement", "Unknown Canvas timeline request.");
  }
  return { handle: input => serialize(() => handle(input)), close: () => serialize(release) };
}
