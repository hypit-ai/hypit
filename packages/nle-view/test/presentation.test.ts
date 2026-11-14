import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNleTransaction,
  createNleProject,
  nleLinearTimeMapping,
  type NleComponentItem,
} from "@hypit/nle";

import {
  createNleTimelinePresentationFacet,
  createNleTimelinePresentationHost,
  nleTimelinePresentationPackagesFromFacets,
  mergeNleTimelineItemObservations,
  projectNleTimeline,
  createNleTimelineView,
} from "../src/index.js";

const second = (value: number) => ({ ticks: String(value), timeBase: { numerator: 1, denominator: 1 } });
const component = { module: { name: "@example/title" }, name: "default" } as const;

function project() {
  const item: NleComponentItem = {
    id: "title",
    kind: "present",
    source: "component",
    component,
    parameters: { text: "Package-owned title" },
    start: second(0),
    duration: second(2),
    sourceTime: nleLinearTimeMapping(second(2)),
    enabled: true,
    picture: { layout: { x: 0, y: 0, width: 100, height: 100, fit: "contain" } },
  };
  return applyNleTransaction(createNleProject({
    id: "film",
    name: "Film",
    canvas: { width: 100, height: 100, clearColor: "black" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "Picture", kind: "picture", muted: false, items: [item] },
  }] });
}

test("packages project exact NLE Items through finite Timeline presentation vocabulary", () => {
  const document = project();
  const facet = createNleTimelinePresentationFacet({ components: [{
    component,
    displayName: "Title",
    tone: "orange",
    chrome: "standard",
    heightPx: 48,
    project: ({ item }) => ({
      title: "Opening title",
      layers: [{ kind: "text", role: "content", text: String(
        (item.parameters as Readonly<Record<string, unknown>>).text,
      ) }],
    }),
  }] });
  const host = createNleTimelinePresentationHost(nleTimelinePresentationPackagesFromFacets([facet]));
  const observations = host.observations(document);
  assert.deepEqual(observations, [{
    item: "title",
    title: "Opening title",
    layers: [{ kind: "text", role: "content", text: "Package-owned title" }],
    presentation: { tone: "orange", chrome: "standard", heightPx: 48 },
  }]);

  const view = createNleTimelineView({ id: "film-main", name: "Film", project: { path: "film.nle.json" },
    tracks: ["picture"] });
  assert.deepEqual(projectNleTimeline(document, view, observations).tracks[0]?.items[0]?.presentation,
    { tone: "orange", chrome: "standard", heightPx: 48 });
  assert.equal(projectNleTimeline(document, view, observations).tracks[0]?.heightPx, 48);
});

test("package posters become cached Host resources and finite preview layers", async () => {
  const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
  let opened = 0;
  const host = createNleTimelinePresentationHost([{ components: [{
    component,
    displayName: "Title",
    tone: "orange",
    chrome: "standard",
    poster: {
      mediaType: "image/svg+xml",
      layout: "repeat-x",
      open: () => {
        opened += 1;
        return bytes;
      },
    },
  }] }]);
  const observations = host.observations(project(), (resource) => `/poster/${encodeURIComponent(resource)}`);
  const layer = observations[0]?.layers?.[0];
  assert.deepEqual(layer, {
    kind: "preview",
    role: "decoration",
    preview: {
      kind: "image",
      state: "ready",
      resource: "/poster/component%3A%40example%2Ftitle%23default",
    },
    layout: "repeat-x",
  });
  assert.equal(layer?.kind, "preview");
  if (layer?.kind !== "preview" || layer.preview.state !== "ready") return;
  const id = decodeURIComponent(layer.preview.resource.slice("/poster/".length));
  const resource = host.resource(id);
  assert.ok(resource !== undefined);
  const first = await resource.read();
  first[0] = 0;
  assert.deepEqual(await resource.read(), bytes);
  assert.equal(opened, 1);
});

test("packages can project Item-specific posters without owning browser URLs", async () => {
  const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="8"/>');
  const host = createNleTimelinePresentationHost([{ components: [{
    component,
    displayName: "Title",
    tone: "orange",
    chrome: "standard",
    project: ({ item }) => ({
      poster: { mediaType: "image/svg+xml", layout: "cover", open: () => bytes },
      layers: [{ kind: "text", role: "content", text: item.id }],
    }),
  }] }]);
  const observations = host.observations(project(), (resource) => `/poster/${encodeURIComponent(resource)}`);
  assert.match(observations[0]?.layers?.[0]?.kind === "preview"
    && observations[0].layers[0].preview.state === "ready"
    ? observations[0].layers[0].preview.resource : "", /item%3Atitle$/u);
  assert.deepEqual(observations[0]?.layers?.[1],
    { kind: "text", role: "content", text: "title" });
  const resource = host.resource("component:@example/title#default:item:title");
  assert.deepEqual(await resource?.read(), bytes);
});

test("Timeline presentation selection rejects duplicate owners and browser-facing layers", () => {
  const presentation = { component, displayName: "Title", tone: "magenta" as const, chrome: "standard" as const };
  assert.throws(() => createNleTimelinePresentationHost([
    { components: [presentation] },
    { components: [presentation] },
  ]), /multiple Component presentations/u);
  const invalid = createNleTimelinePresentationHost([{ components: [{
    ...presentation,
    project: () => ({ layers: [{
      kind: "preview", role: "content", preview: { kind: "image", state: "ready", resource: "/private" },
      layout: "cover",
    }] } as never),
  }] }]);
  assert.throws(() => invalid.observations(project()), /layer 0 is invalid/u);
  assert.throws(() => createNleTimelinePresentationHost([{ components: [{
    ...presentation,
    poster: { mediaType: "text/html", open: () => new Uint8Array([1]) },
  }] }]), /poster media type is invalid/u);
  assert.throws(() => createNleTimelinePresentationHost([{ components: [{
    ...presentation,
    poster: { mediaType: "image/png", layout: "browser" as never, open: () => new Uint8Array([1]) },
  }] }]), /poster layout is invalid/u);
});

test("package facts and Host preview layers compose without giving either side DOM ownership", () => {
  assert.deepEqual(mergeNleTimelineItemObservations([
    {
      item: "title",
      title: "Title",
      layers: [{ kind: "text", role: "content", text: "Hello" }],
      presentation: { tone: "teal", chrome: "standard" },
    },
    {
      item: "title",
      layers: [{
        kind: "preview",
        role: "decoration",
        preview: { kind: "image", state: "ready", resource: "/preview/title" },
        layout: "cover",
      }],
    },
  ]), [{
    item: "title",
    title: "Title",
    layers: [
      { kind: "text", role: "content", text: "Hello" },
      {
        kind: "preview",
        role: "decoration",
        preview: { kind: "image", state: "ready", resource: "/preview/title" },
        layout: "cover",
      },
    ],
    presentation: { tone: "teal", chrome: "standard" },
  }]);
  assert.throws(() => mergeNleTimelineItemObservations([
    { item: "title", title: "One" },
    { item: "title", title: "Two" },
  ]), /conflict.*title/u);
});
