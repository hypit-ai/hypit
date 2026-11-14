import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyNleTransaction,
  createNleAuthoringHost,
  createNleProject,
  nleLinearTimeMapping,
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

import type {
  FeedbackView,
  NleWorkbenchMediaPlacementResponse,
  NleWorkbenchOperationResponse,
  NleWorkbenchSaveReceipt,
  NleWorkbenchSnapshot,
} from "../../src/index.js";
import { startWorkbenchServer } from "../../src/node/index.js";

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
  let connected = false;
  const server = await startWorkbenchServer({
    projectRoot: directory,
    projectFile,
    environment: {
      async observe() {
        return connected
          ? { status: "ready", environment: { selected: true, label: "hypit.environment.json" }, credentials: [] }
          : { status: "action-required", environment: { selected: true, label: "hypit.environment.json" },
              credentials: [], issue: "Connect HypiHub." };
      },
      async connect() { connected = true; return await this.observe(); },
    },
  });
  t.after(() => server.close());

  const environment = await responseJson<{ readonly status: string }>(
    await fetch(`${server.origin}/api/workbench/environment`),
  );
  assert.equal(environment.status, "action-required");
  const connectedEnvironment = await responseJson<{ readonly status: string }>(
    await fetch(`${server.origin}/api/workbench/environment`, { method: "POST" }),
  );
  assert.equal(connectedEnvironment.status, "ready");

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
  let exportedPictureTarget: "html" | "gpu-composition" | undefined;
  let reviewedRevision: number | undefined;
  let reviewedFrames: readonly number[] | undefined;
  const server = await startWorkbenchServer({
    projectRoot: directory,
    projectFile,
    exportProject: async request => {
      exportedRevision = request.project?.revision;
      exportedPictureTarget = request.pictureTarget;
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
    reviewProject: async request => {
      reviewedRevision = request.project?.revision;
      reviewedFrames = request.frames;
      request.onProgress?.({
        phase: "picture", state: "progress", detail: { phase: "complete", frames: 3, elapsedMs: 2 },
      });
      return {
        projectFile: request.projectFile,
        toDirectory: request.toDirectory,
        videoFile: join(request.toDirectory, "review.mp4"),
        frameRate: request.frameRate ?? { numerator: 30, denominator: 1 },
        programmeFrameCount: 30,
        reviewFrameCount: request.range.endFrameExclusive - request.range.startFrame,
        range: request.range,
        canvas: request.resolution ?? { width: 1920, height: 1080 },
        frames: request.frames.map(frame => ({
          frame,
          file: join(request.toDirectory, "frames", `frame-${String(frame).padStart(9, "0")}.png`),
        })),
      };
    },
  });
  try {
    const opened = await responseJson(await fetch(`${server.origin}/api/nle`));
    assert.deepEqual(opened.view.editRate, { numerator: 30, denominator: 1 });
    assert.equal(opened.dirty, true);
    assert.deepEqual(await responseJson(await fetch(`${server.origin}/api/nle/timeline`)), opened.scene);
    assert.deepEqual(await responseJson(await fetch(`${server.origin}/api/nle/canvas`)), opened.canvasScene);

    const track: NleTrack = {
      id: "picture-main",
      name: "Picture",
      kind: "picture",
      muted: false,
      items: [],
    };
    const edited = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Add Picture Track",
        transaction: { revision: opened.project.revision, commands: [{ kind: "track.add", track }] },
      }),
    }));
    assert.deepEqual(edited.patch.project.tracks, [track]);
    assert.equal(edited.format, "hypit.nle-service-operation-response@1");
    assert.equal(edited.receipt.format, "hypit.nle-service-operation@1");
    assert.deepEqual(edited.receipt.changed.tracks, ["picture-main"]);
    assert.equal(Object.hasOwn(edited, "mediaLibrary"), false);
    assert.equal(edited.patch.timeline.tracks[0]?.id, "picture-main");
    assert.equal(edited.dirty, true);
    assert.equal(edited.canUndo, true);
    assert.equal(edited.undoLabel, "Add Picture Track");

    const locked = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/view-transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: { revision: edited.patch.view.revision, commands: [
        { kind: "track-lock.set", track: track.id, locked: true },
      ] } }),
    }));
    assert.equal(locked.patch.view.tracks.find((state) => state.track === track.id)?.locked, true);
    assert.deepEqual(locked.receipt.invalidated, ["timeline", "canvas"]);
    const rejected = await fetch(`${server.origin}/api/nle/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Move locked Track",
        transaction: { revision: edited.patch.project.revision, commands: [{ kind: "track.move", id: track.id }] },
      }),
    });
    assert.equal(rejected.status, 400);

    const undone = await responseJson<NleWorkbenchOperationResponse>(
      await fetch(`${server.origin}/api/nle/undo`, { method: "POST", body: "{}" }),
    );
    assert.equal(undone.patch.project.trackOrder.length, 0);
    assert.equal(undone.canRedo, true);

    const redone = await responseJson<NleWorkbenchOperationResponse>(
      await fetch(`${server.origin}/api/nle/redo`, { method: "POST", body: "{}" }),
    );
    assert.equal(redone.patch.project.trackOrder.length, 1);
    assert.equal(redone.dirty, true);

    const exportStarted = await fetch(`${server.origin}/api/nle/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: redone.patch.project.revision,
        fileName: "edit.mp4",
        pictureTarget: "html",
        quality: "standard",
        frameRate: { numerator: 30, denominator: 1 },
        resolution: { width: redone.patch.project.canvas.width, height: redone.patch.project.canvas.height },
      }),
    });
    assert.equal(exportStarted.status, 202);
    await new Promise(resolve => setImmediate(resolve));
    const exported = await responseJson<import("../../src/index.js").NleWorkbenchExportState>(
      await fetch(`${server.origin}/api/nle/export`),
    );
    assert.equal(exported.state, "complete");
    assert.equal(exported.output?.path, "exports/edit.mp4");
    assert.equal(exportedRevision, redone.patch.project.revision);
    assert.equal(exportedPictureTarget, "html");

    const reviewStarted = await fetch(`${server.origin}/api/nle/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: redone.patch.project.revision,
        directoryName: "edit-r3",
        range: { startFrame: 0, endFrameExclusive: 3 },
        frames: [0, 2],
        pictureTarget: "html",
        quality: "standard",
        frameRate: { numerator: 30, denominator: 1 },
        resolution: { width: redone.patch.project.canvas.width, height: redone.patch.project.canvas.height },
      }),
    });
    assert.equal(reviewStarted.status, 202);
    await new Promise(resolve => setImmediate(resolve));
    const reviewed = await responseJson<import("../../src/index.js").NleWorkbenchReviewState>(
      await fetch(`${server.origin}/api/nle/review`),
    );
    assert.equal(reviewed.state, "complete");
    assert.equal(reviewed.revision, redone.patch.project.revision);
    assert.equal(reviewed.output?.video, "reviews/edit-r3/review.mp4");
    assert.deepEqual(reviewed.output?.frames.map(value => value.frame), [0, 2]);
    assert.equal(reviewedRevision, redone.patch.project.revision);
    assert.deepEqual(reviewedFrames, [0, 2]);

    const saved = await responseJson<NleWorkbenchSaveReceipt>(await fetch(`${server.origin}/api/nle/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectRevision: redone.patch.project.revision,
        viewRevision: redone.patch.view.revision,
      }),
    }));
    assert.equal(saved.dirty, false);
    assert.equal(saved.projectRevision, redone.patch.project.revision);
    assert.equal(saved.viewRevision, redone.patch.view.revision);
    assert.equal(parseNleProject(await readFile(projectFile, "utf8")).tracks.length, 1);
    assert.equal(parseNleTimelineView(await readFile(server.viewFile, "utf8")).project.path, "edit.nle.json");

    const onDisk = parseNleProject(await readFile(projectFile, "utf8"));
    await writeFile(projectFile, serializeNleProject(applyNleTransaction(onDisk, {
      revision: onDisk.revision,
      commands: [{ kind: "project.update", name: "Agent Edit" }],
    })));
    const fileStatus = await responseJson<import("../../src/index.js").NleWorkbenchFileStatus>(
      await fetch(`${server.origin}/api/nle/file-status`),
    );
    assert.equal(fileStatus.changed, true);
    assert.equal(fileStatus.dirty, false);
    const reloaded = await responseJson(await fetch(`${server.origin}/api/nle/reload`, {
      method: "POST",
      body: "{}",
    }));
    assert.equal(reloaded.project.name, "Agent Edit");
    assert.equal(reloaded.dirty, false);
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
    assert.deepEqual((await response.json() as { error: unknown }).error, {
      name: "NleRevisionConflict",
      message: "NLE Project changed: expected revision 9, found 0.",
      owner: "project",
      expectedRevision: 9,
      actualRevision: 0,
      observe: "/api/nle",
    });
    const current = await responseJson(await fetch(`${server.origin}/api/nle`));
    assert.equal(current.project.name, "Conflict");
    assert.equal(current.dirty, false);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("autosaves Project and Timeline View in the NLE application session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-autosave-"));
  const projectFile = join(directory, "edit.nle.json");
  const viewFile = join(directory, "edit.nle-view.json");
  await writeFile(projectFile, serializeNleProject(createNleProject({ id: "edit", name: "Before" })));
  await writeFile(viewFile, serializeNleTimelineView(createNleTimelineView({
    id: "edit-main",
    name: "Edit Timeline",
    project: { path: "edit.nle.json" },
  })));
  const server = await startWorkbenchServer({ projectRoot: directory, projectFile, viewFile });
  let eventReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const opened = await responseJson(await fetch(`${server.origin}/api/nle`));
    const eventResponse = await fetch(`${server.origin}/api/nle/events`);
    assert.equal(eventResponse.headers.get("content-type"), "text/event-stream; charset=utf-8");
    eventReader = eventResponse.body?.getReader();
    assert.ok(eventReader);
    const initialEvent = await eventReader.read();
    assert.match(new TextDecoder().decode(initialEvent.value), /hypit\.nle-service-application-state@1/u);
    const edited = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "Rename Project",
        transaction: {
          revision: opened.project.revision,
          commands: [{ kind: "project.update", name: "After" }],
        },
      }),
    }));
    assert.equal(edited.persistence.project.state, "dirty");
    const editEvent = await eventReader.read();
    assert.match(new TextDecoder().decode(editEvent.value), /"dirty":true/u);

    await new Promise(resolve => setTimeout(resolve, 800));
    const status = await responseJson<import("../../src/index.js").NleWorkbenchFileStatus>(
      await fetch(`${server.origin}/api/nle/file-status`),
    );
    assert.equal(status.dirty, false);
    assert.deepEqual(status.persistence, { project: { state: "clean" }, view: { state: "clean" } });
    assert.equal(parseNleProject(await readFile(projectFile, "utf8")).name, "After");
  } finally {
    await eventReader?.cancel();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("routes domain and package Inspector fields through one service seam", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-workbench-parameter-"));
  const projectFile = join(directory, "parameter.nle.json");
  const component = { module: { name: "@example/title" }, name: "title" } as const;
  const filter = { module: { name: "@example/filter" }, name: "default" } as const;
  const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });
  const item: NleComponentItem = {
    id: "title", kind: "present", source: "component", component, parameters: { text: "Hello" },
    sharedValues: [{ slot: "style", ref: "title-style" }],
    start: second(0), duration: second(2), sourceTime: nleLinearTimeMapping(second(2)), enabled: true,
    picture: {
      layout: { x: 0, y: 0, width: 100, height: 100, fit: "fill" },
      operators: [{
        id: "local-filter", operator: filter, parameters: { amount: 0.4 },
        controlTime: nleLinearTimeMapping(second(2)),
      }],
    },
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
  }], operators: [{
    operator: filter,
    project: ({ application }) => [{
      id: "filter", label: "Filter", domain: "how", fields: [{
        id: "amount", label: "Amount", control: "number",
        value: Number((application.parameters as Readonly<Record<string, unknown>>).amount),
        edit: (amount) => ({ kind: "set-amount", amount }),
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
  }], operatorParameters: [{
    operator: filter,
    inspect: ({ application }) => application.parameters,
    edit: (operation) => {
      const input = operation as Readonly<Record<string, unknown>>;
      if (input.kind !== "set-amount" || typeof input.amount !== "number") throw new Error("Filter edit is invalid.");
      return { amount: input.amount };
    },
  }], componentMedia: [{
    component,
    inputs: () => [{ key: "portrait:lead", label: "Lead portrait", requires: ["picture"], required: true }],
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
    assert.equal(scene.sections.find((section) => section.id
      === "operator:picture:local-filter:filter")?.fields[0]?.editable, true);
    const componentMedia = await responseJson<import("../../src/index.js").NleWorkbenchComponentMediaInputs>(
      await fetch(`${server.origin}/api/nle/component-media-inputs/title?revision=${opened.project.revision}`),
    );
    assert.deepEqual(componentMedia.inputs, [{
      key: "portrait:lead", label: "Lead portrait", requires: ["picture"], required: true,
    }]);
    const edited = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: opened.project.revision, item: "title", section: "title", field: "text", value: "Changed",
      }),
    }));
    assert.deepEqual((edited.patch.project.tracks[0]?.items[0] as NleComponentItem).parameters, { text: "Changed" });
    assert.equal(edited.canUndo, true);
    const filtered = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: edited.patch.project.revision,
        item: "title",
        section: "operator:picture:local-filter:filter",
        field: "amount",
        value: 0.7,
      }),
    }));
    assert.deepEqual((filtered.patch.project.tracks[0]?.items[0] as NleComponentItem)
      .picture?.operators?.[0]?.parameters, { amount: 0.7 });
    const restyled = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: filtered.patch.project.revision,
        item: "title",
        section: "component-value:title-style:style",
        field: "color",
        value: "#e3406a",
      }),
    }));
    assert.deepEqual(restyled.patch.project.componentValues[0]?.value, { color: "#e3406a" });
    assert.deepEqual((restyled.patch.project.tracks[0]?.items[0] as NleComponentItem).parameters, { text: "Changed" });
    const renamed = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: restyled.patch.project.revision,
        item: "title",
        section: "nle-occurrence",
        field: "name",
        value: "Opening",
      }),
    }));
    assert.equal(renamed.patch.project.tracks[0]?.items[0]?.name, "Opening");
    const repositioned = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: renamed.patch.project.revision,
        item: "title",
        section: "nle-picture-layout",
        field: "x",
        value: 24,
      }),
    }));
    const repositionedItem = repositioned.patch.project.tracks[0]?.items[0] as NleComponentItem;
    assert.equal(repositionedItem.picture !== undefined && "x" in repositionedItem.picture.layout
      ? repositionedItem.picture.layout.x : undefined, 24);
    const stale = await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: opened.project.revision, item: "title", section: "title", field: "text", value: "Stale",
      }),
    });
    assert.equal(stale.status, 409);
    const locked = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/view-transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: {
        revision: repositioned.patch.view.revision,
        commands: [{ kind: "track-lock.set", track: "picture", locked: true }],
      } }),
    }));
    const sharedEditOnLockedTrack = await fetch(`${server.origin}/api/nle/item-parameter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: repositioned.patch.project.revision,
        item: "title",
        section: "component-value:title-style:style",
        field: "color",
        value: "#000000",
      }),
    });
    assert.equal(locked.patch.view.tracks.find((state) => state.track === "picture")?.locked, true);
    assert.equal(sharedEditOnLockedTrack.status, 400);
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
        sourceTime: nleLinearTimeMapping(second(2)),
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
      resource: media.resource,
    })), [{
      id: "media/poster/poster.media.json",
      name: "poster",
      kind: "image",
      mediaType: "image/svg+xml",
      width: 64,
      height: 36,
      hasAudio: false,
      resource: "/api/nle/media-resource/media%2Fposter%2Fposter.media.json?generation=1",
    }, {
      id: "media/unused/unused.media.json",
      name: "poster",
      kind: "image",
      mediaType: "image/svg+xml",
      width: 64,
      height: 36,
      hasAudio: false,
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
    const layer = refreshed.scene.tracks[0]?.items[0]?.display.layers[0];
    assert.deepEqual(layer, {
      kind: "preview",
      role: "content",
      preview: {
        kind: "image",
        state: "ready",
        resource: "/api/nle/item-preview/poster-use?generation=1&kind=image",
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
      transform: candidate.affordances.translate || candidate.affordances.resize !== false,
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
    const previewUrl = `${server.origin}${layer?.kind === "preview" && layer.preview.state === "ready"
      ? layer.preview.resource : ""}`;
    const previewHead = await fetch(previewUrl, { method: "HEAD" });
    assert.equal(previewHead.status, 200);
    assert.equal(previewHead.headers.get("content-type"), "image/svg+xml");
    assert.ok(Number(previewHead.headers.get("content-length")) > 0);
    assert.equal(await previewHead.text(), "");
    const preview = await fetch(previewUrl);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "image/svg+xml");
    assert.match(await preview.text(), /fill="#e3406a"/u);

    const programme = await fetch(`${server.origin}/api/nle/programme?generation=${opened.programmeGeneration}`);
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

    assert.equal((await fetch(`${server.origin}/api/nle/item-preview/poster-use?generation=0&kind=image`)).status, 400);
    assert.equal((await fetch(`${server.origin}/api/nle/item-inspector/poster-use?revision=0`)).status, 400);

    const renamed = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "重命名素材",
        transaction: {
          revision: opened.project.revision,
          commands: [{ kind: "item.update", id: "poster-use", name: "Poster" }],
        },
      }),
    }));
    assert.equal(renamed.programmeGeneration, opened.programmeGeneration);
    assert.equal(renamed.receipt.invalidated.includes("programme"), false);
    assert.equal(Object.hasOwn(renamed, "mediaLibrary"), false);
    assert.equal(renamed.patch.timeline.tracks[0]?.items[0]?.display.layers[0]?.kind === "preview"
      ? renamed.patch.timeline.tracks[0].items[0].display.layers[0].preview.state === "ready"
        ? renamed.patch.timeline.tracks[0].items[0].display.layers[0].preview.resource : undefined
      : undefined, layer?.kind === "preview" && layer.preview.state === "ready" ? layer.preview.resource : undefined);

    const resizedTrack = await responseJson(await fetch(`${server.origin}/api/nle/view-transaction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: {
        revision: renamed.patch.view.revision,
        commands: [{ kind: "track-height.set", track: "picture", heightPx: 88 }],
      } }),
    }));
    assert.equal(resizedTrack.programmeGeneration, opened.programmeGeneration);

    const spatialAuthoring = await responseJson<{
      revision: number;
      items: readonly { item: string; translateFrame: boolean; setFocus: boolean }[];
    }>(await fetch(`${server.origin}/api/nle/spatial-authoring`));
    assert.equal(spatialAuthoring.revision, renamed.patch.project.revision);
    const posterSpatial = spatialAuthoring.items.find((item) => item.item === "poster-use");
    assert.equal(posterSpatial?.translateFrame, true);
    assert.equal(posterSpatial?.setFocus, true);

    const spatial = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/spatial-edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: renamed.patch.project.revision,
        item: "poster-use",
        layout: { x: 120, y: 80, width: 1600, height: 900, fit: "contain" },
      }),
    }));
    assert.deepEqual(spatial.patch.canvas.layers[0]?.layout,
      { x: 120, y: 80, width: 1600, height: 900, fit: "contain" });
    assert.deepEqual((spatial.patch.project.tracks[0]?.items[0] as NleComponentItem).picture?.layout,
      { x: 120, y: 80, width: 1600, height: 900, fit: "contain" });
    assert.equal(spatial.undoLabel, "调整 poster-use 画面布局");
    assert.equal(spatial.programmeGeneration, opened.programmeGeneration + 1);
    const translated = await responseJson<NleWorkbenchOperationResponse>(await fetch(`${server.origin}/api/nle/spatial-command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: spatial.patch.project.revision,
        item: "poster-use",
        edit: { kind: "frame.translate", deltaX: 10, deltaY: -20 },
      }),
    }));
    assert.deepEqual(translated.patch.canvas.layers[0]?.layout,
      { x: 130, y: 60, width: 1600, height: 900, fit: "contain" });
    assert.equal(translated.undoLabel, "移动 poster-use 画面");
    const placed = await responseJson<NleWorkbenchMediaPlacementResponse>(await fetch(`${server.origin}/api/nle/place-media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: translated.patch.project.revision,
        media: "media/unused/unused.media.json",
        track: "picture",
        at: second(2),
        duration: second(2),
      }),
    }));
    const placedItem = placed.operation.patch.project.tracks[0]?.items.find((item: { id: string }) => item.id === placed.item);
    assert.deepEqual(placedItem?.kind === "present" && placedItem.source === "media"
      ? placedItem.asset : undefined, { path: "../media/unused/unused.media.json" });
    assert.equal(Object.hasOwn(placed.operation, "mediaLibrary"), false);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
