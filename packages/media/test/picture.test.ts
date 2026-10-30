import assert from "node:assert/strict";
import test from "node:test";

import { verifyPictureInterpretation, verifyPictureObservation } from "../src/index.js";

test("picture interpretation admits only the two implemented SDR signal families", () => {
  assert.doesNotThrow(() => verifyPictureObservation({
    colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
    colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
  }));
  assert.doesNotThrow(() => verifyPictureInterpretation({
    colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb",
    colorRange: "full", bitDepth: 8, alphaMode: "straight",
  }));
  assert.doesNotThrow(() => verifyPictureInterpretation({
    colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
    colorRange: "limited", bitDepth: 8, alphaMode: "opaque",
  }));
  assert.doesNotThrow(() => verifyPictureInterpretation({
    colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
    colorRange: "limited", bitDepth: 8, alphaMode: "straight",
  }));
  assert.throws(() => verifyPictureInterpretation({
    colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "bt709",
    colorRange: "full", bitDepth: 8, alphaMode: "straight",
  }), /not an implemented SDR picture signal/u);
});
