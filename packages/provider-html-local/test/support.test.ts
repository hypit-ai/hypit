import assert from "node:assert/strict";
import test from "node:test";

import { localHtmlRasterRejection } from "../src/support.js";
import {
  htmlProviderDelivery,
  htmlProviderDocument,
  htmlProviderHdr10Delivery,
  htmlProviderHdrDocument,
} from "./provider-scenario.js";

test("SDR renderers implement Visual Process passes and HDR rejects them explicitly", () => {
  const program = { ...htmlProviderDocument(), processPasses: 1 };
  const request = { program, delivery: htmlProviderDelivery() };
  assert.equal(localHtmlRasterRejection(request, "chromium"), undefined);
  assert.equal(localHtmlRasterRejection(request, "electron"), undefined);
  const hdrRequest = {
    program: { ...htmlProviderHdrDocument(), processPasses: 1 },
    delivery: htmlProviderHdr10Delivery(),
  };
  assert.match(localHtmlRasterRejection(hdrRequest, "electron") ?? "",
    /does not yet implement Visual Process input surfaces/u);
});
