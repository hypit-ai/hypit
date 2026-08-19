import type { TypeRef } from "@hypit/protocol";

import type { SurfaceAttributeVocabulary, SurfaceVocabulary } from "./types.js";

function typeKey(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}#${type.name}`;
}

function attributeRow(attribute: SurfaceAttributeVocabulary): string {
  const detail = [
    ...(attribute.values === undefined ? [] : attribute.values),
    ...(attribute.accepts === undefined ? [] : attribute.accepts.map(typeKey)),
  ];
  const kind = detail.length === 0 ? attribute.kind : `${attribute.kind} (${detail.join(", ")})`;
  return `| \`${attribute.name}\` | ${kind} | ${attribute.required ? "yes" : "no"} | ${attribute.summary} |`;
}

/** Render one package-owned element declaration as Markdown. */
export function describeSurfaceVocabulary(options: {
  readonly tag: string;
  readonly vocabulary: SurfaceVocabulary;
}): string {
  const { tag, vocabulary } = options;
  const lines: string[] = [`### \`<${tag}>\``, "", vocabulary.summary, ""];
  if (vocabulary.appearance !== undefined) lines.push(`**On screen.** ${vocabulary.appearance}`, "");
  if (vocabulary.preview !== undefined) lines.push(`**Preview.** \`${vocabulary.preview.path}\``, "");
  if (vocabulary.attributes.length > 0) {
    lines.push("| Attribute | Kind | Required | Meaning |", "|---|---|---|---|");
    for (const attribute of vocabulary.attributes) lines.push(attributeRow(attribute));
    lines.push("");
    for (const attribute of vocabulary.attributes) {
      if (attribute.recipe === undefined || attribute.recipe.length === 0) continue;
      lines.push(`\`${attribute.name}\` Recipe properties:`, "",
        "| Property | Required | Default | Meaning |", "|---|---|---|---|");
      for (const property of attribute.recipe) {
        const meaning = property.values === undefined
          ? property.summary
          : `${property.summary} One of ${property.values.join(", ")}.`;
        lines.push(`| \`${property.name}\` | ${property.required ? "yes" : "no"} | ${property.fallback === undefined ? "—" : `\`${property.fallback}\``} | ${meaning} |`);
      }
      lines.push("");
    }
  }
  if (vocabulary.children !== undefined && vocabulary.children.length > 0) {
    lines.push("| Child | Cardinality | Meaning |", "|---|---|---|");
    for (const child of vocabulary.children) {
      lines.push(`| \`<${child.tag}>\` | ${child.cardinality} | ${child.summary} |`);
    }
    lines.push("");
    for (const child of vocabulary.children) {
      if (child.attributes === undefined || child.attributes.length === 0) continue;
      lines.push(`\`<${child.tag}>\` attributes:`, "",
        "| Attribute | Kind | Required | Meaning |", "|---|---|---|---|");
      for (const attribute of child.attributes) lines.push(attributeRow(attribute));
      lines.push("");
      if (child.text !== undefined) lines.push(child.text, "");
    }
  }
  if (vocabulary.text !== undefined) lines.push(vocabulary.text, "");
  if (vocabulary.ports !== undefined && vocabulary.ports.length > 0) {
    lines.push("| Port | Type | Meaning |", "|---|---|---|");
    for (const port of vocabulary.ports) {
      lines.push(`| \`${port.name}\` | ${typeKey(port.type)} | ${port.summary} |`);
    }
    lines.push("");
  }
  lines.push("```svml", vocabulary.example.trim(), "```", "");
  for (const note of vocabulary.notes ?? []) lines.push(note, "");
  return lines.join("\n");
}
