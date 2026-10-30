import assert from "node:assert/strict";
import test from "node:test";

import { localHtmlRasterRejection } from "../src/support.js";
import {
  htmlProviderDelivery,
  htmlProviderDocument,
} from "./provider-scenario.js";

test("both local renderers implement Visual Process passes", () => {
  const processUsages = [{ order: 1, passes: 1,
    stageKeys: ["root-stage"], spans: [{ startFrame: 6, endFrameExclusive: 12 }] }];
  const program = { ...htmlProviderDocument(), processUsages };
  const request = { program, delivery: htmlProviderDelivery() };
  assert.equal(localHtmlRasterRejection(request, "chromium"), undefined);
  assert.equal(localHtmlRasterRejection(request, "electron"), undefined);
});

test("browser still support is narrower than explicitly transformed timed media", () => {
  const program = htmlProviderDocument();
  const picture = { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
    colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const;
  const withStill = { ...program, artifacts: [...program.artifacts, {
    kind: "picture" as const, id: "artifact-still-proof", artifact: { kind: "blob" as const, resource: "res_still-proof" as const,
      size: 1, mediaType: "image/png" }, picture,
    usage: { kind: "frames" as const, spans: [{ startFrame: 6, endFrameExclusive: 12 }] },
  }], html: program.html.replace("</body>", '<img src="hypit-artifact://artifact-still-proof"/></body>') };
  assert.match(localHtmlRasterRejection({ program: withStill, delivery: htmlProviderDelivery() }, "chromium") ?? "",
    /exact 8-bit sRGB still-picture support/u);
  assert.equal(localHtmlRasterRejection({ program: withStill, delivery: htmlProviderDelivery(),
    range: { startFrame: 0, endFrameExclusive: 6 } }, "chromium"), undefined);
});
