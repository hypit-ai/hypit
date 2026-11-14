import assert from "node:assert/strict";
import test from "node:test";

import { projectObjectRef } from "@hypit/project";

import {
  createProjectBenchFacet,
  createProjectBenchHostFromFacets,
} from "../src/index.js";

test("independent Benches open exact Project Objects without a shared shell", async () => {
  const closed: string[] = [];
  const host = createProjectBenchHostFromFacets([
    createProjectBenchFacet({
      id: "hypit.nle-bench",
      label: "Timeline",
      formats: ["hypit.nle@1"],
      open: ({ object }) => ({
        title: object.path,
        surface: { kind: "web", url: "http://127.0.0.1:5181/nle" },
        close: () => { closed.push("nle"); },
      }),
    }),
    createProjectBenchFacet({
      id: "hypit.scene-bench",
      label: "Scene",
      formats: ["hypit.scene@1"],
      open: ({ object }) => ({
        title: object.path,
        surface: { kind: "web", url: "http://127.0.0.1:5182/3d" },
        close: () => { closed.push("scene"); },
      }),
    }),
  ]);
  const scene = projectObjectRef("episode/opening.scene.json", "hypit.scene@1");

  assert.deepEqual(host.available(scene), [{ id: "hypit.scene-bench", label: "Scene" }]);
  const session = await host.open("hypit.scene-bench", { projectRoot: "/project", object: scene });
  assert.equal(session.surface.url, "http://127.0.0.1:5182/3d");
  await session.close();
  assert.deepEqual(closed, ["scene"]);
});

test("a Bench cannot become a fallback for an unrelated object format", async () => {
  const host = createProjectBenchHostFromFacets([createProjectBenchFacet({
    id: "hypit.nle-bench",
    label: "Timeline",
    formats: ["hypit.nle@1"],
    open: () => ({
      title: "Timeline",
      surface: { kind: "web", url: "http://127.0.0.1:5181/nle" },
      close() {},
    }),
  })]);
  const scene = projectObjectRef("opening.scene.json", "hypit.scene@1");
  assert.deepEqual(host.available(scene), []);
  await assert.rejects(host.open("hypit.nle-bench", { projectRoot: "/project", object: scene }),
    /cannot open/u);
});

test("Bench identity is not a document format version", () => {
  assert.throws(() => createProjectBenchFacet({
    id: "example.timeline-bench@1",
    label: "Timeline",
    formats: ["example.timeline@1"],
    open: async () => ({
      title: "Timeline",
      surface: { kind: "web", url: "http://127.0.0.1:5181/nle" },
      close() {},
    }),
  }), /unversioned identity/u);
});

test("one Bench may open the same Project Object into independent sessions", async () => {
  let next = 0;
  const closed: number[] = [];
  const host = createProjectBenchHostFromFacets([createProjectBenchFacet({
    id: "example.timeline-bench",
    label: "Timeline",
    formats: ["hypit.nle@1"],
    open: () => {
      const session = ++next;
      return {
        title: `Timeline ${session}`,
        surface: { kind: "web", url: `http://127.0.0.1:${5200 + session}/nle` },
        close: () => { closed.push(session); },
      };
    },
  })]);
  const object = projectObjectRef("edits/main.nle.json", "hypit.nle@1");
  const [left, right] = await Promise.all([
    host.open("example.timeline-bench", { projectRoot: "/project", object }),
    host.open("example.timeline-bench", { projectRoot: "/project", object }),
  ]);

  assert.notEqual(left.surface.url, right.surface.url);
  assert.deepEqual(host.available(object), [{ id: "example.timeline-bench", label: "Timeline" }]);
  await right.close();
  assert.deepEqual(closed, [2]);
  await left.close();
  assert.deepEqual(closed, [2, 1]);
});
