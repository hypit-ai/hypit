import { relative, dirname } from "node:path";
import type { MockTarget } from "./graph.js";

export function previewRunSource(author: string, runFile: string, targets: readonly string[], geometry: { width: number; height: number }, mocks: readonly MockTarget[]): string {
  const authorRef = relative(dirname(runFile), author).replaceAll("\\", "/");
  const declarations: string[] = [];
  const satisfactions: string[] = [];
  const needsEstimate = mocks.some((mock) => mock.kind === "semantic-take");
  const importLine = needsEstimate
    ? `  <import from="@hypit/semantic-take-estimate@1" as="estimate"/>\n`
    : "";
  for (const [index, mock] of mocks.entries()) {
    const fragment = mock.kind === "semantic-take" ? "estimate:semantic-take"
      : mock.kind === "image" ? "mock:image" : mock.kind === "video" ? "mock:video" : "mock:silence";
    const id = `mock-${index}`;
    const inputs = Object.entries(mock.inputs).map(([name, from]) => `<input name="${name}" from="${from}"/>`).join("");
    declarations.push(`  <fragment id="${id}" using="${fragment}">${inputs}</fragment>`);
    const exportName = mock.kind === "semantic-take" ? "take" : mock.kind === "audio" ? "audio" : mock.kind;
    satisfactions.push(`  <satisfy output="${mock.output}" candidate="${id}.${exportName}"/>`);
  }
  return `<?svml using="@hypit/run-markup@1"?>\n<svrun version="1">\n  <author source="${authorRef}"/>\n  <import from="@hypit/mock-media@1" as="mock"/>\n${importLine}${targets.map((target) => `  <target output="${target}"/>`).join("\n")}\n${declarations.join("\n")}\n${satisfactions.join("\n")}\n</svrun>\n`;
}
