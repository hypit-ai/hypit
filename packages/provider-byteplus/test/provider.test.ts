import assert from "node:assert/strict";
import test from "node:test";
import { createBytePlusProvider, bytePlusBody } from "../src/index.js";
import { catalog, models } from "@hypit/byteplus-models";
import {
  registrations,
  context,
  json,
  png,
} from "../../direct-model-kit/test/fixture.js";
import type { GenerationRequest } from "@hypit/generation";

test("all active BytePlus catalog models execute without changing Hypit output types", async () => {
  for (const model of catalog) {
    const bodies: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://assets.test/")) {
        assert(!new Headers(init?.headers).has("authorization"));
        return new Response(png, {
          headers: { "content-type": model.result + "/test" },
        });
      }
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer unit-test-key",
      );
      if (init?.method === "POST") {
        bodies.push(JSON.parse(String(init.body)));
        return model.result === "image"
          ? json({ data: [{ url: "https://assets.test/result" }] })
          : json({ id: "task-1" });
      }
      return json({
        id: "task-1",
        status: "succeeded",
        content: { video_url: "https://assets.test/result" },
      });
    };
    const reg = (
      await registrations(createBytePlusProvider({ fetch: fetcher }))
    ).find(
      (r) =>
        r.capability.module.name === "@hypit/byteplus-models" &&
        r.capability.name === model.model,
    )!;
    const c = context(reg, { prompt: ["A scene"] });
    if (reg.handler) {
      const r = await reg.handler(c);
      assert.equal(r.value.kind, "inline");
    } else {
      const started = await reg.async!.start({ ...c, operation: "op" });
      assert.equal(started.status, "pending");
      if (started.status !== "pending") throw Error("failed");
      const polled = await reg.async!.poll({
        ...c,
        operation: "op",
        handle: started.handle,
      });
      assert.equal(polled.status, "ready");
      if (polled.status !== "ready") throw Error("failed");
      const done = await reg.async!.collect!({
        ...c,
        operation: "op",
        handle: polled.handle,
      });
      assert.equal(done.status, "completed");
    }
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]!.model, model.model);
    if (model.result === "video")
      assert.deepEqual(bodies[0]!.content, [{ type: "text", text: "A scene" }]);
    else assert.equal(bodies[0]!.prompt, "A scene");
  }
  assert(!catalog.some((m) => m.model === "seedance-1-5-pro-251215"));
});

test("existing Seedance author requests map to exact BytePlus model, frame and audio parameters", async () => {
  let body: Record<string, unknown> = {};
  const regs = await registrations(
    createBytePlusProvider({
      fetch: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return json({ id: "seedance-1" });
      },
    }),
  );
  const reg = regs.find(
    (r) =>
      r.capability.module.name === "@hypit/seedance" &&
      r.capability.name === "seedance-2-mini",
  )!;
  const c = context(reg, {}),
    artifact = await c.resources.put(png, "image/png");
  const ports = {
    prompt: ["A cup"],
    firstFrame: [
      { role: "image", artifact, fields: { personReference: false } },
    ],
    aspectRatio: ["adaptive"],
    duration: [4],
    resolution: ["480p"],
    generateAudio: [false],
    webSearch: [false],
  };
  const start = await reg.async!.start({
    ...c,
    need: {
      ...c.need,
      constraints: {
        ports,
      } as unknown as import("@hypit/protocol").CanonicalValue,
    },
    operation: "op",
  });
  assert.equal(start.status, "pending");
  assert.equal(body.model, "dreamina-seedance-2-0-mini-260615");
  assert.equal(body.generate_audio, false);
  assert.equal(body.ratio, "adaptive");
  assert(!("web_search" in body));
  const content = body.content as Record<string, unknown>[];
  assert.equal(content[1]!.role, "first_frame");
});

test("unsupported durations and unsupported frame combinations are rejected before spending", async () => {
  let calls = 0;
  const regs = await registrations(
    createBytePlusProvider({
      fetch: async () => {
        calls++;
        return json({ id: "bad" });
      },
    }),
  );
  const reg = regs.find(
    (r) => r.capability.name === "dreamina-seedance-2-0-mini-260615",
  )!;
  const r = await reg.async!.start({
    ...context(reg, { prompt: ["A scene"], duration: [30] }),
    operation: "op",
  });
  assert.equal(r.status, "failed");
  assert.equal(calls, 0);
  const m = catalog.find((m) => m.model === "dreamina-seedance-2-5-260628")!,
    c = context(reg, {}),
    artifact = await c.resources.put(png, "image/png");
  assert.throws(
    () =>
      models.definition.endpoints[m.model]!.sealRequest({
        prompt: ["A scene"],
        firstFrame: [{ role: "image", artifact }],
        ratio: ["16:9"],
      }),
    /adaptive/,
  );
});

test("existing Seedream quality and aspect ratio select a real pixel size", async () => {
  let body: Record<string, unknown> = {};
  const regs = await registrations(
    createBytePlusProvider({
      fetch: async (url, init) => {
        if (init?.method === "POST") {
          body = JSON.parse(String(init.body));
          return json({ data: [{ url: "https://assets.test/p.png" }] });
        }
        return new Response(png, { headers: { "content-type": "image/png" } });
      },
    }),
  );
  const reg = regs.find((r) => r.capability.module.name === "@hypit/seedream")!;
  await reg.handler!(
    context(reg, {
      prompt: ["A cup"],
      aspectRatio: ["9:16"],
      quality: ["basic"],
      outputFormat: ["png"],
      nsfwCheck: [true],
    }),
  );
  assert.equal(body.size, "1600x2848");
  assert.equal(body.output_format, "png");
  assert(!("quality" in body));
  assert(!("nsfw_check" in body));
});

test("poll throttling retains receipt, does not resubmit, and uses Retry-After", async () => {
  let posts = 0;
  const reg = (
    await registrations(
      createBytePlusProvider({
        fetch: async (_u, init) => {
          if (init?.method === "POST") {
            posts++;
            return json({ id: "job" });
          }
          return json({ error: { code: "Throttled", message: "wait" } }, 429, {
            "retry-after": "30",
          });
        },
      }),
    )
  ).find((r) => r.capability.name === "dreamina-seedance-2-0-mini-260615")!;
  const c = { ...context(reg, { prompt: ["Scene"] }), operation: "op" },
    started = await reg.async!.start(c);
  if (started.status !== "pending") throw Error("failed");
  const before = Date.now(),
    polled = await reg.async!.poll({ ...c, handle: started.handle });
  assert.equal(polled.status, "pending");
  if (polled.status !== "pending") throw Error("not pending");
  assert.equal(polled.receipt?.id, "job");
  assert((polled.wakeAt ?? 0) >= before + 30000);
  assert.equal(posts, 1);
});

test("video publication requirement is surfaced during support selection", async () => {
  const reg = (await registrations(createBytePlusProvider())).find(
    (r) => r.capability.name === "dreamina-seedance-2-0-mini-260615",
  )!;
  const request = {
    capability: reg.capability,
    returns: reg.returns,
    constraints: {
      ports: { prompt: ["A scene"] },
    } as import("@hypit/protocol").CanonicalValue,
    pendingInputs: [{ input: "video", role: "video" }],
  };
  const support = await reg.options.supports!(request);
  assert.equal(support.status, "unsupported");
  if (support.status === "unsupported")
    assert.match(support.reason, /publicAssetUrl/);
});

test("planning accepts future frame artifacts for both native and existing Seedance requests", async () => {
  const regs = await registrations(createBytePlusProvider());
  for (const native of [true, false]) {
    const reg = regs.find(
      (r) =>
        r.capability.module.name ===
          (native ? "@hypit/byteplus-models" : "@hypit/seedance") &&
        r.capability.name ===
          (native ? "dreamina-seedance-2-0-mini-260615" : "seedance-2-mini"),
    )!;
    const firstFrame = {
      role: "image",
      slot: "upstream-image",
      ...(native ? {} : { fields: { personReference: false } }),
    };
    const ports = {
      prompt: ["A scene"],
      firstFrame: [firstFrame],
      resolution: ["480p"],
      duration: [4],
      ...(native
        ? { ratio: ["adaptive"] }
        : {
            aspectRatio: ["adaptive"],
            generateAudio: [false],
            webSearch: [false],
          }),
    };
    const request = {
      capability: reg.capability,
      returns: reg.returns,
      constraints: {
        ports,
      } as unknown as import("@hypit/protocol").CanonicalValue,
      pendingInputs: [{ input: "firstFrame", role: "image" }],
    };
    assert.equal((await reg.options.supports!(request)).status, "supported");
    assert.equal(
      (await reg.options.supports!({ ...request, pendingInputs: [] })).status,
      "unsupported",
    );
  }
});
