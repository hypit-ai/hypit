import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyNleTransaction,
  createNleAuthoringHost,
  createNleProject,
  nleLinearSourceTime,
  parseNleProject,
  serializeNleProject,
  type NleTrack,
  type NleComponentItem,
} from "@hypit/nle";
import {
  createNleTimelineView,
  createNleTimelinePresentationHost,
  createNleInspectorPresentationHost,
  parseNleTimelineView,
  serializeNleTimelineView,
} from "@hypit/nle-view";

import type { FeedbackView, NleWorkbenchMediaPlacementResponse, NleWorkbenchSnapshot } from "../src/index.js";
import { startWorkbenchServer } from "../src/node/index.js";

async function responseJson<T = NleWorkbenchSnapshot>(response: Response): Promise<T> {
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text) as T;
}

test("persists Comments in the project Feedback file for the explicit NLE context", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-feedback-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const edits = join(directory, "edits");
  await mkdir(edits);
  const projectFile = join(edits, "film.nle.json");
  await writeFile(projectFile, serializeNleProject(createNleProject({ id: "film", name: "Film" })));
  const server = await startWorkbenchServer({ projectRoot: directory, projectFile });
  t.after(() => server.close());

  const opened = await responseJson<FeedbackView>(await fetch(`${server.origin}/api/nle/feedback`));
  assert.equal(opened.context, "edits/film.nle.json");
  assert.deepEqual(opened.comments, []);
  const comment = {
    id: "c-opening",
    context: opened.context,
    at: 1.25,
    text: "开场再快一点",
    resolved: false,
    attachments: [],
  } as const;
  const saved = await responseJson<FeedbackView>(await fetch(`${server.origin}/api/nle/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mutation: { type: "add", comment }, uploads: [] }),
  }));
  assert.deepEqual(saved.comments, [comment]);
  assert.equal(server.feedbackFile, join(directory, "feedback", "project.feedback.json"));
  assert.deepEqual(JSON.parse(await readFile(server.feedbackFile, "utf8")), {
    format: "hypit.feedback@1",
    comments: [comment],
  });
});

test("promotes a staged image only when its Feedback comment is saved", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-feedback-image-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const projectFile = join(directory, "film.nle.json");
  await writeFile(projectFile, serializeNleProject(createNleProject({ id: "film", name: "Film" })));
  const server = await startWorkbenchServer({ projectRoot: directory, projectFile });
  t.after(() => server.close());
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const uploaded = await responseJson<{
    readonly token: string;
    readonly attachment: { readonly id: string; readonly path: string; readonly mediaType: string; readonly name: string };
  }>(await fetch(`${server.origin}/api/nle/feedback/upload?name=frame.png`, {
    method: "POST",
    headers: { "content-type": "image/png" },
    body: bytes,
  }));
  const comment = {
    id: "c-frame",
    context: "film.nle.json",
    at: 2,
    text: "看这张截图",
    resolved: false,
    attachments: [uploaded.attachment],
  };
  const saved = await responseJson<FeedbackView>(await fetch(`${server.origin}/api/nle/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mutation: { type: "add", comment },
      uploads: [{ token: uploaded.token, attachment: uploaded.attachment }],
    }),
  }));
  assert.deepEqual(saved.comments, [comment]);
  assert.deepEqual(new Uint8Array(await (await fetch(
    `${server.origin}/api/nle/feedback/attachment?id=${encodeURIComponent(uploaded.attachment.id)}`,
  )).arrayBuffer()), bytes);
  const attachmentFile = join(directory, "feedback", uploaded.attachment.path);
  assert.deepEqual(new Uint8Array(await readFile(attachmentFile)), bytes);
  const deleted = await responseJson<FeedbackView>(await fetch(`${server.origin}/api/nle/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mutation: { type: "delete", before: comment }, uploads: [] }),
  }));
  assert.deepEqual(deleted.comments, []);
  await assert.rejects(readFile(attachmentFile), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
});

test("edits and saves one real NLE Project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-"));
  const projectFile = join(directory, "edit.nle.json");
  await writeFile(projectFile, serializeNleProject(createNleProject({ id: "edit", name: "Workbench edit" })));
  let exportedRevision: number | undefined;
  const server = await startWorkbenchServer({
    projectRoot: directory,
    projectFile,
    exportProject: async request => {
      exportedRevision = request.project?.revision;
      request.onProgress?.({
        phase: "picture", state: "progress", detail: { phase: "complete", frames: 12, elapsedMs: 4 },
      });
      return {
        projectFile: request.projectFile,
        outputFile: request.outputFile,
        frameRate: request.frameRate ?? { numerator: 30, denominator: 1 },
        frameCount: 12,
        canvas: request.resolution ?? { width: 1920, height: 1080 },
      };
    },
  });
  try {
    const opened = await responseJson(await fetch(`${server.origin}/api/nle`));
    assert.deepEqual(opened.view.editRate, { numerator: 30, denominator: 1 });
    assert.equal(opened.dirty, true);

    const track: NleTrack = {
      id: "picture-main",
      name: "Picture",
      kind: "picture",
      muted: false,
      items: [],
    };
    const edited = await responseJson(await fetch(`${server.origin}/api/nle/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Add Picture Track",
        transaction: { revision: opened.project.revision, commands: [{ kind: "track.add", track }] },
      }),
    }));
    assert.deepEqual(edited.project.tracks, [track]);
    assert.equal(edited.scene.tracks[0]?.id, "picture-main");
    assert.equal(edited.dirty, true);
    assert.equal(edited.canUndo, true);
    assert.equal(edited.undoLabel, "Add Picture Track");

    const locked = await responseJson(await fetch(`${server.origin}/api/nle/view-transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: { revision: edited.view.revision, commands: [
        { kind: "track-lock.set", track: track.id, locked: true },
      ] } }),
    }));
    assert.equal(locked.view.tracks.find((state) => state.track === track.id)?.locked, true);
    const rejected = await fetch(`${server.origin}/api/nle/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Move locked Track",
        transaction: { revision: edited.project.revision, commands: [{ kind: "track.move", id: track.id }] },
      }),
    });
    assert.equal(rejected.status, 400);

    const undone = await responseJson(await fetch(`${server.origin}/api/nle/undo`, { method: "POST", body: "{}" }));
    assert.equal(undone.project.tracks.length, 0);
    assert.equal(undone.canRedo, true);

    const redone = await responseJson(await fetch(`${server.origin}/api/nle/redo`, { method: "POST", body: "{}" }));
    assert.equal(redone.project.tracks.length, 1);
    assert.equal(redone.dirty, true);

    const exportStarted = await fetch(`${server.origin}/api/nle/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: redone.project.revision,
        fileName: "edit.mp4",
        quality: "standard",
        frameRate: { numerator: 30, denominator: 1 },
        resolution: { width: redone.project.canvas.width, height: redone.project.canvas.height },
      }),
    });
    assert.equal(exportStarted.status, 202);
    await new Promise(resolve => setImmediate(resolve));
    const exported = await responseJson<import("../src/index.js").NleWorkbenchExportState>(
      await fetch(`${server.origin}/api/nle/export`),
    );
    assert.equal(exported.state, "complete");
    assert.equal(exported.output?.path, "exports/edit.mp4");
    assert.equal(exportedRevision, redone.project.revision);

    const saved = await responseJson(await fetch(`${server.origin}/api/nle/save`, { method: "POST", body: "{}" }));
    assert.equal(saved.dirty, false);
    assert.equal(parseNleProject(await readFile(projectFile, "utf8")).tracks.length, 1);
    assert.equal(parseNleTimelineView(await readFile(server.viewFile, "utf8")).project.path, "edit.nle.json");
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects stale Workbench transactions without changing the open Project", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-conflict-"));
  const projectFile = join(directory, "edit.nle.json");
  await writeFile(projectFile, serializeNleProject(createNleProject({ id: "edit", name: "Conflict" })));
  await writeFile(join(directory, "edit.nle-view.json"), serializeNleTimelineView(createNleTimelineView({
    id: "edit-main",
    name: "Conflict Timeline",
    project: { path: "edit.nle.json" },
  })));
  const server = await startWorkbenchServer({ projectRoot: directory, projectFile });
  try {
    const response = await fetch(`${server.origin}/api/nle/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Stale rename",
        transaction: { revision: 9, commands: [{ kind: "project.update", name: "Wrong" }] },
      }),
    });
    assert.equal(response.status, 409);
    const current = await responseJson(await fetch(`${server.origin}/api/nle`));
    assert.equal(current.project.name, "Conflict");
    assert.equal(current.dirty, false);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("edits one package field through Inspector semantics and NLE authoring", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-parameter-"));
  const projectFile = join(directory, "parameter.nle.json");
  const component = { module: { name: "@example/title", version: "1" }, name: "title" } as const;
  const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });
  const item: NleComponentItem = {
    id: "title", kind: "present", source: "component", component, parameters: { text: "Hello" },
    bindings: [{ slot: "style", ref: "title-style" }],
    start: second(0), duration: second(2), sourceTime: nleLinearSourceTime(second(2)), enabled: true,
    picture: { layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" } },
  };
  const project = applyNleTransaction(createNleProject({ id: "parameter", name: "Parameter" }), {
    revision: 0,
    commands: [{ kind: "component-value.add", value: {
      id: "title-style", name: "Title style", component, slot: "style", value: { color: "#ffffff" },
    } }, { kind: "track.add", track: {
      id: "picture", name: "Picture", kind: "picture", muted: false, items: [item],
    } }],
  });
  await writeFile(projectFile, serializeNleProject(project));
  const inspectorPackages: Parameters<typeof createNleInspectorPresentationHost>[0] = [{ components: [{
    component,
    project: ({ item: selected }) => [{
      id: "title", label: "Title", domain: "how", fields: [{
        id: "text", label: "Text", control: "text",
        value: String((selected.parameters as Readonly<Record<string, unknown>>).text),
        edit: (value) => ({ kind: "set-text", text: value }),
      }],
    }],
  }], componentValues: [{
    component, slot: "style", project: ({ value }) => [{
      id: "style", label: "Style", domain: "how", fields: [{
        id: "color", label: "Color", control: "color",
        value: String((value.value as Readonly<Record<string, unknown>>).color),
        edit: (color) => ({ kind: "set-color", color }),
      }],
    }],
  }] }];
  const authoring = createNleAuthoringHost([{ componentParameters: [{
    component,
    inspect: ({ item: selected }) => selected.parameters,
    edit: (operation) => {
      if (operation === null || typeof operation !== "object" || Array.isArray(operation)) {
        throw new Error("Title edit is invalid.");
      }
      const edit = operation as Readonly<Record<string, unknown>>;
      if (edit.kind !== "set-text" || typeof edit.text !== "string") throw new Error("Title edit is invalid.");
      return { text: edit.text };
    },
  }], componentValues: [{
    component, slot: "style", inspect: ({ value }) => value.value,
    edit: (operation) => {
      const input = operation as Readonly<Record<string, unknown>>;
      if (input.kind !== "set-color" || typeof input.color !== "string") throw new Error("Style edit is invalid.");
      return { color: input.color };
    },
  }] }]);
  const inspectors = createNleInspectorPresentationHost(inspectorPackages, authoring);
  const posterBytes = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
  );
  const presentations = createNleTimelinePresentationHost([{ components: [{
    component,
    displayName: "Title",
    tone: "orange",
    chrome: "standard",
    poster: {
      mediaType: "image/svg+xml",
      layout: "repeat-x",
      open: () => posterBytes,
    },
  }] }]);
  const server = await startWorkbenchServer({
    projectRoot: directory, projectFile, inspectors, authoring, presentations,
  });
  try {
    const opened = await responseJson(await fetch(`${server.origin}/api/nle`));
    const poster = opened.scene.tracks[0]?.items[0]?.display.layers[0];
    assert.equal(poster?.kind, "preview");
    assert.equal(poster?.kind === "preview" ? poster.layout : undefined, "repeat-x");
    const posterPath = poster?.kind === "preview" && poster.preview.state === "ready"
      ? poster.preview.resource : undefined;
    assert.ok(posterPath !== undefined);
    assert.equal(new URL(posterPath, server.origin).searchParams.get("revision"), String(opened.project.revision));
    const posterResponse = await fetch(`${server.origin}${posterPath}`);
    assert.equal(posterResponse.status, 200);
    assert.equal(posterResponse.headers.get("cache-control"), "no-store");
    assert.equal(posterResponse.headers.get("content-type"), "image/svg+xml");
    assert.deepEqual(new Uint8Array(await posterResponse.arrayBuffer()), posterBytes);
    const scene = await (await fetch(`${server.origin}/api/nle/item-inspector/title?revision=${opened.project.revision}`)).json() as {
      readonly sections: readonly { readonly id: string; readonly fields: readonly {
        readonly id: string; readonly value: string | number | boolean; readonly editable?: boolean;
      }[] }[];
    };
    assert.equal(scene.sections.find((section) => section.id === "title")?.fields[0]?.editable, true);
    const edited = await responseJson(await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: opened.project.revision, item: "title", section: "title", field: "text", value: "Changed",
      }),
    }));
    assert.deepEqual((edited.project.tracks[0]?.items[0] as NleComponentItem).parameters, { text: "Changed" });
    assert.equal(edited.canUndo, true);
    const restyled = await responseJson(await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: edited.project.revision,
        item: "title",
        section: "component-value:title-style:style",
        field: "color",
        value: "#e3406a",
      }),
    }));
    assert.deepEqual(restyled.project.componentValues[0]?.value, { color: "#e3406a" });
    assert.deepEqual((restyled.project.tracks[0]?.items[0] as NleComponentItem).parameters, { text: "Changed" });
    const stale = await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: opened.project.revision, item: "title", section: "title", field: "text", value: "Stale",
      }),
    });
    assert.equal(stale.status, 409);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("projects file-backed Media preview observations without persisting them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-preview-"));
  const mediaDirectory = join(directory, "media", "poster");
  const projectFile = join(directory, "edits", "preview.nle.json");
  await mkdir(mediaDirectory, { recursive: true });
  await mkdir(join(directory, "edits"));
  await writeFile(join(mediaDirectory, "poster.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="#e3406a"/></svg>');
  await writeFile(join(mediaDirectory, "poster.media.json"), `${JSON.stringify({
    format: "hypit.media-asset@1",
    id: "poster",
    media: {
      file: { path: "poster.svg", mediaType: "image/svg+xml" },
      interpretation: {
        id: "poster-media",
        picture: {
          kind: "constant",
          streamIndex: 0,
          interpretation: {
            codedWidth: 64,
            codedHeight: 36,
            sampleAspectRatio: { numerator: 1, denominator: 1 },
            rotationDegrees: 0,
            picture: {
              colorPrimaries: "bt709",
              colorTransfer: "srgb",
              colorMatrix: "rgb",
              colorRange: "full",
              bitDepth: 8,
              alphaMode: "straight",
            },
          },
        },
      },
    },
    representations: [],
  }, undefined, 2)}\n`);
  const unusedDirectory = join(directory, "media", "unused");
  await mkdir(unusedDirectory);
  await copyFile(join(mediaDirectory, "poster.svg"), join(unusedDirectory, "poster.svg"));
  await copyFile(join(mediaDirectory, "poster.media.json"), join(unusedDirectory, "unused.media.json"));
  const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });
  const initial = createNleProject({ id: "preview", name: "Preview" });
  const project = applyNleTransaction(initial, { revision: 0, commands: [
    { kind: "track.add", track: {
      id: "picture",
      name: "Picture",
      kind: "picture",
      muted: false,
      items: [{
        id: "poster-use",
        kind: "present",
        source: "media",
        asset: { path: "../media/poster/poster.media.json" },
        start: second(0),
        duration: second(2),
        sourceTime: nleLinearSourceTime(second(2)),
        enabled: true,
        picture: { layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "fill" } },
      }],
    } },
  ] });
  await writeFile(projectFile, serializeNleProject(project));
  const server = await startWorkbenchServer({ projectRoot: directory, projectFile });
  try {
    const opened = await responseJson(await fetch(`${server.origin}/api/nle`));
    assert.deepEqual(opened.mediaLibrary.assets.map((media) => ({
      id: media.id,
      name: media.name,
      kind: media.kind,
      mediaType: media.mediaType,
      width: media.width,
      height: media.height,
      hasAudio: media.hasAudio,
      usedBy: media.usedBy,
      resource: media.resource,
    })), [{
      id: "media/poster/poster.media.json",
      name: "poster",
      kind: "image",
      mediaType: "image/svg+xml",
      width: 64,
      height: 36,
      hasAudio: false,
      usedBy: 1,
      resource: "/api/nle/media-resource/media%2Fposter%2Fposter.media.json?generation=1",
    }, {
      id: "media/unused/unused.media.json",
      name: "poster",
      kind: "image",
      mediaType: "image/svg+xml",
      width: 64,
      height: 36,
      hasAudio: false,
      usedBy: 0,
      resource: "/api/nle/media-resource/media%2Funused%2Funused.media.json?generation=1",
    }]);
    const libraryResource = await fetch(`${server.origin}${opened.mediaLibrary.assets[0]?.resource}`, {
      headers: { range: "bytes=0-4" },
    });
    assert.equal(libraryResource.status, 206);
    assert.equal(await libraryResource.text(), "<svg ");
    const lateDirectory = join(directory, "media", "z-late");
    await mkdir(lateDirectory);
    await copyFile(join(mediaDirectory, "poster.svg"), join(lateDirectory, "poster.svg"));
    await copyFile(join(mediaDirectory, "poster.media.json"), join(lateDirectory, "z-late.media.json"));
    const cached = await responseJson(await fetch(`${server.origin}/api/nle`));
    assert.equal(cached.mediaLibrary.generation, 1);
    assert.equal(cached.mediaLibrary.assets.length, 2);
    const refreshed = await responseJson(await fetch(`${server.origin}/api/nle/media-library/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    assert.equal(refreshed.mediaLibrary.generation, 2);
    assert.deepEqual(refreshed.mediaLibrary.assets.map((media) => media.id), [
      "media/poster/poster.media.json",
      "media/unused/unused.media.json",
      "media/z-late/z-late.media.json",
    ]);
    assert.match(refreshed.mediaLibrary.assets[0]?.resource ?? "", /generation=2$/u);
    const layer = opened.scene.tracks[0]?.items[0]?.display.layers[0];
    assert.deepEqual(layer, {
      kind: "preview",
      role: "content",
      preview: {
        kind: "image",
        state: "ready",
        resource: "/api/nle/item-preview/poster-use?revision=1&kind=image",
      },
      layout: "filmstrip",
    });
    assert.equal(Object.hasOwn(opened.project.tracks[0]!.items[0]!, "display"), false);
    assert.equal(Object.hasOwn(opened.view, "previews"), false);
    assert.deepEqual(opened.canvasScene.layers.map((candidate) => ({
      id: candidate.id,
      source: candidate.source,
      layout: candidate.layout,
      owner: candidate.owner,
      transform: candidate.editing.transform,
    })), [{
      id: "poster-use",
      source: "media",
      layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "fill" },
      owner: { kind: "item" },
      transform: true,
    }]);
    const inspectorResponse = await fetch(`${server.origin}/api/nle/item-inspector/poster-use?revision=1`);
    assert.equal(inspectorResponse.status, 200);
    const inspector = await inspectorResponse.json() as {
      readonly format: string;
      readonly sections: readonly { readonly id: string; readonly owner: { readonly kind: string } }[];
    };
    assert.equal(inspector.format, "hypit.nle-inspector-scene@1");
    assert.equal(inspector.sections.find((section) => section.id === "nle-occurrence")?.owner.kind, "nle");
    assert.equal(inspector.sections.find((section) => section.id === "media-source")?.owner.kind, "media");
    assert.equal(inspector.sections.find((section) => section.id === "media-facts")?.owner.kind, "host");
    const preview = await fetch(`${server.origin}${layer?.kind === "preview" && layer.preview.state === "ready"
      ? layer.preview.resource : ""}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "image/svg+xml");
    assert.match(await preview.text(), /fill="#e3406a"/u);

    const programme = await fetch(`${server.origin}/api/nle/programme?revision=${opened.project.revision}`
      + `&viewRevision=${opened.view.revision}`);
    const programmeHtml = await programme.text();
    assert.equal(programme.status, 200, programmeHtml);
    assert.equal(programme.headers.get("x-hypit-frame-count"), "60");
    assert.match(programme.headers.get("content-security-policy") ?? "", /script-src 'unsafe-inline' 'unsafe-eval'/u);
    assert.match(programmeHtml, /window\.__hypitDocument/u);
    assert.match(programmeHtml, /hypit\.html-document\.command@1/u);
    const resourcePath = /data-hypit-artifact-src="([^"]*\/api\/nle\/programme-resource\/[^"]+)"/u
      .exec(programmeHtml)?.[1]?.replaceAll("&amp;", "&");
    assert.ok(resourcePath !== undefined);
    const programmeResource = await fetch(`${server.origin}${resourcePath}`);
    assert.equal(programmeResource.status, 200);
    assert.equal(programmeResource.headers.get("accept-ranges"), "bytes");
    assert.match(await programmeResource.text(), /fill="#e3406a"/u);
    const partialResource = await fetch(`${server.origin}${resourcePath}`, { headers: { range: "bytes=0-4" } });
    assert.equal(partialResource.status, 206);
    assert.match(partialResource.headers.get("content-range") ?? "", /^bytes 0-4\//u);
    assert.equal(await partialResource.text(), "<svg ");

    assert.equal((await fetch(`${server.origin}/api/nle/item-preview/poster-use?revision=0`)).status, 400);
    assert.equal((await fetch(`${server.origin}/api/nle/item-inspector/poster-use?revision=0`)).status, 400);

    const spatial = await responseJson(await fetch(`${server.origin}/api/nle/spatial-edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: opened.project.revision,
        item: "poster-use",
        layout: { x: 120, y: 80, width: 1600, height: 900, fit: "contain" },
      }),
    }));
    assert.deepEqual(spatial.canvasScene.layers[0]?.layout,
      { x: 120, y: 80, width: 1600, height: 900, fit: "contain" });
    assert.deepEqual((spatial.project.tracks[0]?.items[0] as NleComponentItem).picture?.layout,
      { x: 120, y: 80, width: 1600, height: 900, fit: "contain" });
    assert.equal(spatial.undoLabel, "调整 poster-use 画面布局");
    const placed = await responseJson<NleWorkbenchMediaPlacementResponse>(await fetch(`${server.origin}/api/nle/place-media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: spatial.project.revision,
        media: "media/unused/unused.media.json",
        track: "picture",
        at: second(2),
        duration: second(2),
      }),
    }));
    const placedItem = placed.snapshot.project.tracks[0]?.items.find((item: { id: string }) => item.id === placed.item);
    assert.deepEqual(placedItem?.kind === "present" && placedItem.source === "media"
      ? placedItem.asset : undefined, { path: "../media/unused/unused.media.json" });
    assert.equal(placed.snapshot.mediaLibrary.assets[0]?.usedBy, 1);
    assert.equal(placed.snapshot.mediaLibrary.assets[1]?.usedBy, 1);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
