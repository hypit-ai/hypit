import assert from "node:assert/strict";
import test from "node:test";

import { compositionTypes } from "@hypit/composition";
import { narrativeTypes } from "@hypit/narrative";

import type { CompiledSource } from "../src/compile.js";
import { traceFor } from "../src/studio-trace.js";

test("Track traces retain direct references to author Records", () => {
  const source = {
    compiled: {
      program: {
        records: [{
          id: "source::record::story.caption",
          type: narrativeTypes.captionDocument,
          value: { kind: "inline", value: {} },
        }],
      },
      provenance: {
        elements: [{
          records: [{ local: "story.caption", id: "source::record::story.caption" }],
        }],
      },
    },
    observations: {
      placements: [{
        tag: "caption-fine:Track",
        surface: "track",
        module: { name: "@hypit/caption-fine", version: "1" },
        id: "captions",
        outputs: ["source::output::captions.track"],
        outputPorts: [{ name: "track", ref: "source::output::captions.track" }],
        resolvedReferenceAttributes: { document: "source::record::story.caption" },
        children: [],
      }],
    },
    exports: [{
      name: "captions.track",
      type: compositionTypes.visualTrack.name,
      typeRef: compositionTypes.visualTrack,
      ref: "source::output::captions.track",
    }],
  } as unknown as CompiledSource;

  assert.deepEqual(traceFor(source, "source::output::captions.track").references, [{
    input: "document",
    name: "story.caption",
    ref: "source::record::story.caption",
    type: narrativeTypes.captionDocument.name,
    typeRef: narrativeTypes.captionDocument,
  }]);
});
