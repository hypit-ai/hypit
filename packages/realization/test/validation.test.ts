import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  digestOf,
  link,
  sealCompiledGraph,
  sealTypedModule,
} from "@narratage/core";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import {
  createProvidedCandidate,
  resolveRealization,
  sealRealizationOverlay,
} from "@narratage/realization";
import {
  TypeValidatorRegistry,
  validateValue,
} from "@narratage/validation";

const moduleRef = { name: "example.validated-existing", version: "1" } as const;
const mediaType = { module: moduleRef, name: "Media" } satisfies TypeRef;
const validatorDigest = digestOf("example.validated-existing/validator@1");
const manifest: ModuleManifest = {
  format: "svml.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [{
    name: mediaType.name,
    schema: { kind: "string", minLength: 1 },
    validator: {
      abi: "svml.type-validator@1",
      implementation: {
        kind: "registered",
        locator: "example.validated-existing/validator",
        digest: validatorDigest,
      },
    },
  }],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: "generate",
    inputs: [],
    outputs: [{ name: "media", type: mediaType }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "example.validated-existing/generate",
      digest: digestOf("example.validated-existing/generate@1"),
    },
  }],
};

function fixture() {
  const closure = createResolvedClosure([manifest]);
  const program = link(closure, [sealTypedModule({
    id: "author:empty",
    closureDigest: closure.digest,
    records: [],
  })]);
  const source = sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [{
      id: "media",
      type: mediaType,
      primary: "generated",
      semanticInputs: [],
    }],
    candidates: [{
      id: "generated",
      type: mediaType,
      root: { kind: "operation", result: { kind: "operation-result", operation: "generate" } },
    }],
    operations: [{
      id: "generate",
      producer: { module: moduleRef, name: "generate" },
      inputs: {},
      result: { kind: "output", name: "media", record: "media:generated" },
    }],
  });
  return { program, source };
}

function validators(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registry.register(mediaType, validatorDigest, ({ value }) => {
    if (value.kind !== "inline" || typeof value.value !== "string" || !value.value.startsWith("approved:")) {
      throw new Error("media is not approved");
    }
  });
  return registry;
}

test("provided Candidates pass the same Type-owner admission gate", async () => {
  const { program, source } = fixture();
  const value = { kind: "inline" as const, value: "approved:clip" };
  const validation = await validateValue(program.closure, mediaType, value, validators());
  assert.ok(validation);
  const accepted = createProvidedCandidate({
    type: mediaType,
    value,
    validation,
  });
  assert.doesNotThrow(() => resolveRealization(program, source, [sealRealizationOverlay({
    sourceGraph: source.id,
    candidates: [accepted],
    operations: [],
  })]));

  const missing = createProvidedCandidate({ type: mediaType, value });
  assert.throws(
    () => resolveRealization(program, source, [sealRealizationOverlay({
      sourceGraph: source.id,
      candidates: [missing],
      operations: [],
    })]),
    /requires .*validator/u,
  );

  const tampered = createProvidedCandidate({
    type: mediaType,
    value,
    validation: { ...validation, recordDigest: digestOf("another-value") },
  });
  assert.throws(
    () => resolveRealization(program, source, [sealRealizationOverlay({
      sourceGraph: source.id,
      candidates: [tampered],
      operations: [],
    })]),
    /validation receipt belongs to another value/u,
  );
});
