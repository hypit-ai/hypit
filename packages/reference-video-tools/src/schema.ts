import type { ValueSchema } from "@hypit/protocol";

/** Render a declared value shape as prose an author can act on. */
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
