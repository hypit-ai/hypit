import { assertPublicationIntent } from "@hypit/protocol";
import type { CanonicalValue, PublicationIntent } from "@hypit/protocol";
import { assertProductPath } from "@hypit/product";
import type { ProductMaterializationState } from "@hypit/product";

export type ProductPublicationWriterState = ProductMaterializationState & {
  readonly publication: PublicationIntent;
};

function object(value: unknown, subject: string): Readonly<Record<string, unknown>> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, subject: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function pathMap(value: unknown, subject: string): Readonly<Record<string, string>> {
  const item = object(value, subject);
  return Object.fromEntries(Object.entries(item).map(([identity, path]) => {
    const decoded = text(path, `${subject}[${JSON.stringify(identity)}]`);
    assertProductPath(decoded, `${subject}[${JSON.stringify(identity)}]`);
    return [text(identity, `${subject} identity`), decoded];
  }));
}

export function decodeProductPublicationWriterState(
  value: unknown,
  subject = "Product publication writer state",
): ProductPublicationWriterState {
  const item = object(value, subject);
  const rawIntent = object(item.publication, `${subject}.publication`);
  if (!Array.isArray(rawIntent.outputs)) throw new Error(`${subject}.publication.outputs must be an array`);
  if (Object.keys(rawIntent).some((name) => name !== "outputs")) {
    throw new Error(`${subject}.publication must contain only outputs`);
  }
  const names = new Set<string>();
  const outputs = rawIntent.outputs.map((value, index) => {
    const output = object(value, `${subject}.publication.outputs[${index}]`);
    for (const key of Object.keys(output)) {
      if (key !== "name" && key !== "record" && key !== "publisher" && key !== "parameters") {
        throw new Error(`${subject}.publication.outputs[${index}] has an unexpected ${key} field`);
      }
    }
    const name = text(output.name, `${subject}.publication.outputs[${index}].name`);
    if (names.has(name)) throw new Error(`${subject} repeats published Product name ${name}`);
    names.add(name);
    return {
      name,
      record: text(output.record, `${subject}.publication.outputs[${index}].record`),
      publisher: text(output.publisher, `${subject}.publication.outputs[${index}].publisher`),
      ...(output.parameters === undefined ? {} : { parameters: output.parameters as CanonicalValue }),
    };
  });
  const publication = { outputs };
  assertPublicationIntent(publication);
  return {
    resources: pathMap(item.resources, `${subject}.resources`),
    values: pathMap(item.values, `${subject}.values`),
    publication,
  };
}
