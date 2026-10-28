import {
  declarationField,
  type AuthorDeclarationCompiler,
} from "@hypit/hypit/author";
import { sameType, typeKey } from "@hypit/hypit/protocol";

import { realizationModuleRef } from "./manifest.js";

export const realizationSelectAuthorDeclaration: AuthorDeclarationCompiler = {
  module: realizationModuleRef,
  declaration: "select",
  outputs: [],
  shape: {
    summary: "Selects one existing authored Record as the durable realization of one Component output.",
    fields: [
      {
        name: "output",
        kind: "reference",
        required: true,
        summary: "References the Component output whose durable realization is selected.",
      },
      {
        name: "record",
        kind: "reference",
        required: true,
        summary: "References the existing authored Record selected for that output.",
      },
    ],
  },
  bindings() {
    return [];
  },
  async compile({ declaration, resolveReference }) {
    const outputField = declarationField(declaration, "output");
    const recordField = declarationField(declaration, "record");
    if (outputField?.kind !== "reference" || recordField?.kind !== "reference") {
      throw new Error("Realization Select requires output and record references.");
    }
    const output = await resolveReference(outputField.path);
    const record = await resolveReference(recordField.path);
    if (output?.ref.kind !== "component-output") {
      throw new Error("Realization Select output must reference a Component output.");
    }
    if (record?.ref.kind !== "record") {
      throw new Error("Realization Select record must reference an authored Record.");
    }
    if (!sameType(output.type, record.type)) {
      throw new Error(
        "Realization Select cannot connect " + typeKey(record.type)
          + " to " + typeKey(output.type) + ".",
      );
    }
    return {
      records: [],
      components: [],
      realizations: [{
        output: output.ref,
        record: record.ref,
        range: declaration.range,
      }],
    };
  },
};

export const realizationAuthorDeclarations = [realizationSelectAuthorDeclaration] as const;
export const realizationMarkupDeclarations = [{
  name: "select",
  tag: "Select",
}] as const;
