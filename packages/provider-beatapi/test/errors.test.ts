import assert from "node:assert/strict";
import test from "node:test";
import { BeatApiHttpError } from "../src/errors.js";

test("HTTP errors name a signed transfer URL without its signature", () => {
  const signed = "https://cdn.example.test/out/video.mp4?X-Amz-Signature=SECRET&X-Amz-Credential=AKIA";
  const error = new BeatApiHttpError(403, { headers: new Headers() }, "", { method: "GET", path: signed });
  assert.match(error.message, /GET https:\/\/cdn\.example\.test\/out\/video\.mp4(?:;|$)/u);
  assert.doesNotMatch(error.message, /SECRET|AKIA/u);
  const api = new BeatApiHttpError(404, { headers: new Headers() }, "", { method: "GET", path: "/v1/tasks/t1" });
  assert.match(api.message, /GET \/v1\/tasks\/t1/u);
});
