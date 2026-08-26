import type { ValueSchema } from "@hypit/protocol";

/**
 * Read a declared shape back as prose an author can act on.
 *
 * A package that draws returns a Visual Track from its Producer, and every field on it — which
 * element kinds exist, which style names are admitted, which of them take an enum, how few keyframes
 * an animation may have — is declared in `composition`'s own schema. Nothing read that schema, so the
 * only way to learn the shape was to open another package and copy it, which is how a component gets
 * written against one example's habits rather than against the contract.
 *
 * This renders the schema instead. It is generated from the declaration, so it cannot say something
 * the code does not.
 */
export function describeSchema(schema: ValueSchema, indent = ""): string[] {
  const step = `${indent}  `;
  switch (schema.kind) {
    case "object": {
      const lines: string[] = [];
      for (const [name, field] of Object.entries(schema.fields)) {
        const inner = describeSchema(field.schema, step);
        const optional = field.optional === true ? " (optional)" : "";
        lines.push(`${indent}${name}${optional}: ${inner[0]!.trimStart()}`, ...inner.slice(1));
      }
      if (schema.allowUnknown === true) lines.push(`${indent}… further fields are admitted`);
      return lines;
    }
    case "oneOf": {
      // A union of objects each pinned by one literal is how the schema spells "these kinds"; naming
      // the discriminating values is more use than printing every variant in full.
      const pinned = schema.variants.map((variant) => {
        if (variant.kind !== "object") return undefined;
        const literal = Object.entries(variant.fields)
          .find(([, field]) => field.schema.kind === "literal");
        return literal === undefined ? undefined : String((literal[1].schema as { value: unknown }).value);
      });
      if (pinned.every((value) => value !== undefined)) return [`${indent}one of ${pinned.join(", ")}`];
      return [`${indent}one of ${schema.variants.length} shapes`];
    }
    case "array": {
      const bound = schema.minItems === undefined ? "" : ` (at least ${schema.minItems})`;
      const inner = describeSchema(schema.items, step);
      return [`${indent}a list${bound} of:`, ...inner];
    }
    case "string": {
      if (schema.enum !== undefined) return [`${indent}one of ${schema.enum.join(", ")}`];
      const bound = schema.minLength === undefined ? "text" : `text, at least ${schema.minLength} characters`;
      return [`${indent}${bound}`];
    }
    case "number": {
      const parts = [schema.integer === true ? "a whole number" : "a number"];
      if (schema.minimum !== undefined) parts.push(`at least ${schema.minimum}`);
      if (schema.maximum !== undefined) parts.push(`at most ${schema.maximum}`);
      return [`${indent}${parts.join(", ")}`];
    }
    case "literal": return [`${indent}exactly ${JSON.stringify(schema.value)}`];
    case "boolean": return [`${indent}true or false`];
    case "null": return [`${indent}null`];
    default: return [`${indent}${(schema as { kind: string }).kind}`];
  }
}
