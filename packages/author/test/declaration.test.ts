import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorDeclarationError,
  AuthorDeclarationRegistry,
  compileAuthorDeclarations,
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationCompiler,
} from "@hypit/author";
import type { TypeRef } from "@hypit/protocol";

const module = { name: "example.declarations", version: "1" } as const;
const textType = { module, name: "Text" } satisfies TypeRef;

function literal(declaration: AuthorDeclaration, name: string): string {
  const value = declarationField(declaration, name);
  if (value?.kind !== "literal") throw new Error(`${name} must be literal.`);
  return value.value;
}

const valueCompiler: AuthorDeclarationCompiler = {
  module,
  declaration: "value",
  outputs: [textType],
  shape: {
    summary: "Authors one text value.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the value." },
      { name: "value", kind: "literal", required: true, summary: "Provides the text." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, ref: { kind: "record", id }, type: textType }];
  },
  compile({ declaration }) {
    const id = literal(declaration, "id");
    return {
      records: [{ id, type: textType, value: literal(declaration, "value"), range: declaration.range }],
      components: [],
    };
  },
};

const copyCompiler: AuthorDeclarationCompiler = {
  module,
  declaration: "copy",
  outputs: [textType],
  shape: {
    summary: "Copies one authored text value.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the copy." },
      { name: "source", kind: "reference", required: true, accepts: [textType], summary: "Chooses the source." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, ref: { kind: "record", id }, type: textType }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const source = declarationField(declaration, "source");
    if (source?.kind !== "reference") throw new Error("source must be a reference.");
    const resolved = await resolveReference(source.path);
    if (resolved?.record === undefined) throw new Error("copy requires an authored Record value.");
    return {
      records: [{ id, type: textType, value: resolved.record.value, range: declaration.range }],
      components: [],
    };
  },
};

const registry = new AuthorDeclarationRegistry();
registry.register(valueCompiler);
registry.register(copyCompiler);

const range = (start: number, end: number) => ({ start, end });

test("Author Declarations compile by references rather than source order", async () => {
  const decoded = await compileAuthorDeclarations({
    sourceName: "forward.svml",
    registry,
    resolveAsset: () => { throw new Error("unused"); },
    declarations: [
      {
        module,
        name: "copy",
        fields: [
          { name: "id", value: { kind: "literal", value: "copy", range: range(6, 12) } },
          { name: "source", value: { kind: "reference", path: "original", range: range(13, 23) } },
        ],
        children: [],
        range: range(0, 30),
      },
      {
        module,
        name: "value",
        fields: [
          { name: "id", value: { kind: "literal", value: "original", range: range(36, 46) } },
          { name: "value", value: { kind: "literal", value: "kept", range: range(47, 53) } },
        ],
        children: [],
        range: range(30, 60),
      },
    ],
  });

  assert.deepEqual(decoded.records.map((record) => [record.id, record.value]), [
    ["original", "kept"],
    ["copy", "kept"],
  ]);
  assert.deepEqual(decoded.exports.map((item) => item.name), ["copy", "original"]);
});

test("Author Declarations retain provenance for nested semantic outputs and child inputs", async () => {
  const nestedRegistry = new AuthorDeclarationRegistry();
  nestedRegistry.register({
    module,
    declaration: "document",
    outputs: [textType],
    shape: {
      summary: "Authors a document with one addressable section.",
      fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the document." }],
      children: [{
        name: "Section",
        cardinality: "one",
        summary: "Authors one nested section.",
        fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the section." }],
      }],
    },
    bindings() {
      return [
        { name: "document", ref: { kind: "record", id: "document" }, type: textType },
        { name: "section", ref: { kind: "record", id: "section" }, type: textType },
      ];
    },
    compile({ declaration }) {
      const section = declaration.children[0]!;
      return {
        records: [
          { id: "document", type: textType, value: "whole", range: declaration.range },
          { id: "section", type: textType, value: "part", range: section.range! },
        ],
        components: [],
      };
    },
  });
  const decoded = await compileAuthorDeclarations({
    sourceName: "nested.svml",
    registry: nestedRegistry,
    resolveAsset: () => { throw new Error("unused"); },
    declarations: [{
      module,
      name: "document",
      fields: [{ name: "id", value: { kind: "literal", value: "document", range: range(5, 13) } }],
      children: [{
        name: "Section",
        fields: [{ name: "id", value: { kind: "literal", value: "section", range: range(24, 31) } }],
        children: [],
        range: range(15, 40),
      }],
      range: range(0, 50),
    }],
  });

  assert.deepEqual(decoded.provenance, [
    {
      range: range(0, 50),
      records: ["document"],
      components: [],
      outputs: [],
      inputs: [{ name: "id", range: range(5, 13), kind: "literal" }],
    },
    {
      range: range(15, 40),
      records: ["section"],
      components: [],
      outputs: [],
      inputs: [{ name: "id", range: range(24, 31), kind: "literal" }],
    },
  ]);
});

test("Author Declarations reject unresolved references before package compilation", async () => {
  await assert.rejects(
    compileAuthorDeclarations({
      sourceName: "missing.svml",
      registry,
      resolveAsset: () => { throw new Error("unused"); },
      declarations: [{
        module,
        name: "copy",
        fields: [
          { name: "id", value: { kind: "literal", value: "copy" } },
          { name: "source", value: { kind: "reference", path: "missing" } },
        ],
        children: [],
        range: range(0, 20),
      }],
    }),
    (error: unknown) => error instanceof AuthorDeclarationError
      && error.code === "AUTHOR_DECLARATION_REFERENCE_UNKNOWN",
  );
});

test("Author Declaration shape is the single structural and reference-type authority", async () => {
  await assert.rejects(
    compileAuthorDeclarations({
      sourceName: "shape.svml",
      registry,
      resolveAsset: () => { throw new Error("unused"); },
      declarations: [{
        module,
        name: "value",
        fields: [
          { name: "id", value: { kind: "literal", value: "value" } },
          { name: "value", value: { kind: "literal", value: "kept" } },
          { name: "extra", value: { kind: "literal", value: "not declared" } },
        ],
        children: [],
        range: range(0, 30),
      }],
    }),
    (error: unknown) => error instanceof AuthorDeclarationError
      && error.code === "AUTHOR_DECLARATION_FIELD_UNKNOWN",
  );

  await assert.rejects(
    compileAuthorDeclarations({
      sourceName: "type.svml",
      registry,
      resolveAsset: () => { throw new Error("unused"); },
      resolveReference: (path) => ({
        path,
        ref: { kind: "record", id: "external" },
        type: { module, name: "Other" },
      }),
      declarations: [{
        module,
        name: "copy",
        fields: [
          { name: "id", value: { kind: "literal", value: "copy" } },
          { name: "source", value: { kind: "reference", path: "external" } },
        ],
        children: [],
        range: range(0, 20),
      }],
    }),
    (error: unknown) => error instanceof AuthorDeclarationError
      && error.code === "AUTHOR_DECLARATION_REFERENCE_TYPE",
  );
});

test("Author Declaration shapes express package-local recursive child grammars", async () => {
  const recursiveRegistry = new AuthorDeclarationRegistry();
  recursiveRegistry.register({
    module,
    declaration: "tree",
    outputs: [textType],
    shape: {
      summary: "Authors one recursively grouped tree.",
      fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the tree." }],
      children: { group: "members" },
      childGroups: {
        members: [{
          name: "Leaf",
          cardinality: "many",
          summary: "Adds one leaf.",
          fields: [{ name: "value", kind: "literal", required: true, summary: "Supplies its value." }],
        }, {
          name: "Branch",
          cardinality: "many",
          summary: "Adds one recursively nested branch.",
          fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the branch." }],
          children: { group: "members" },
        }],
      },
    },
    bindings(declaration) {
      const id = literal(declaration, "id");
      return [{ name: id, ref: { kind: "record", id }, type: textType }];
    },
    compile({ declaration }) {
      const id = literal(declaration, "id");
      return { records: [{ id, type: textType, value: "tree", range: declaration.range }], components: [] };
    },
  });
  const declaration: AuthorDeclaration = {
    module,
    name: "tree",
    fields: [{ name: "id", value: { kind: "literal", value: "tree" } }],
    children: [{
      name: "Branch",
      fields: [{ name: "id", value: { kind: "literal", value: "outer" } }],
      children: [{
        name: "Branch",
        fields: [{ name: "id", value: { kind: "literal", value: "inner" } }],
        children: [{
          name: "Leaf",
          fields: [{ name: "value", value: { kind: "literal", value: "kept" } }],
          children: [],
        }],
      }],
    }],
    range: range(0, 100),
  };
  const decoded = await compileAuthorDeclarations({
    sourceName: "recursive.svml",
    registry: recursiveRegistry,
    declarations: [declaration],
    resolveAsset: () => { throw new Error("unused"); },
  });
  assert.equal(decoded.records[0]?.id, "tree");

  await assert.rejects(
    compileAuthorDeclarations({
      sourceName: "recursive-invalid.svml",
      registry: recursiveRegistry,
      declarations: [{
        ...declaration,
        children: [{
          ...declaration.children[0]!,
          children: [{ name: "Unknown", fields: [], children: [] }],
        }],
      }],
      resolveAsset: () => { throw new Error("unused"); },
    }),
    (error: unknown) => error instanceof AuthorDeclarationError
      && error.code === "AUTHOR_DECLARATION_CHILD_UNKNOWN",
  );
});
