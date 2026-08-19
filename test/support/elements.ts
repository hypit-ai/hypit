import { readdir, readFile } from "node:fs/promises";

import { describeSurfaceVocabulary } from "@hypit/markup";
import type { MarkupSurfaceDeclaration, SurfaceVocabulary } from "@hypit/markup";

type RegisteredSurface = MarkupSurfaceDeclaration & {
  readonly module: { readonly name: string; readonly version: string };
  readonly surface: string;
  readonly vocabulary?: SurfaceVocabulary;
};

const markupSurfaceHostFacetAbi = "hypit.markup-surface-host@1";

const preamble = [
  "---",
  "title: Element Reference",
  "description: Every element every installed package defines, rendered from the packages themselves.",
  "---",
  "",
  "# Element Reference",
  "",
  "Every element in this repository, as each package describes itself on its own Markup Surface",
  "declaration. Nothing here is written by hand: this page is rendered from those declarations, and a",
  "test fails when it stops matching them.",
  "",
  "Regenerate with `pnpm docs:elements`.",
  "",
].join("\n");

/** Load every installed package's contribution and render the elements it offers. */
export async function renderElementReference(packagesRoot: URL): Promise<string> {
  const directories = (await readdir(packagesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const sections: { readonly module: string; readonly body: string }[] = [];
  for (const name of directories) {
    let manifest: { readonly hypit?: { readonly activation?: string } };
    try {
      manifest = JSON.parse(await readFile(new URL(`${name}/package.json`, packagesRoot), "utf8"));
    } catch {
      continue;
    }
    const activation = manifest.hypit?.activation;
    if (activation === undefined) continue;
    const entry = new URL(`${name}/${activation.replace(/^\.\//u, "")}`, packagesRoot);
    const contribution = (await import(entry.href)).default as {
      readonly hostFacets?: readonly { readonly abi: string; readonly implementation: unknown }[];
    };
    const surfaces = (contribution.hostFacets ?? [])
      .filter((facet) => facet.abi === markupSurfaceHostFacetAbi)
      .map((facet) => facet.implementation as RegisteredSurface)
      .filter((surface) => surface.vocabulary !== undefined)
      .sort((left, right) => left.tag.localeCompare(right.tag));
    if (surfaces.length === 0) continue;
    const module = `${surfaces[0]!.module.name}@${surfaces[0]!.module.version}`;
    sections.push({
      module,
      body: [
        `## \`${module}\``,
        "",
        ...surfaces.map((surface) => describeSurfaceVocabulary({
          tag: surface.tag,
          vocabulary: surface.vocabulary!,
        })),
      ].join("\n"),
    });
  }
  sections.sort((left, right) => left.module.localeCompare(right.module));
  return `${preamble}\n${sections.map((section) => section.body).join("\n")}`;
}
