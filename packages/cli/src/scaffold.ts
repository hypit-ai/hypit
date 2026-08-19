import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * The files a new component package starts life with.
 *
 * These are pure string templates over one package name, so they need nothing the generic
 * command engine does not already have: no compiler, no Host, no Provider and no new
 * dependency. Anything a template cannot decide — the nominal Types, the Producers, the
 * renderer — is left to the author with the comment that says where it goes, rather than
 * guessed here.
 */

export type ScaffoldRequest = {
  /** Full package name, such as `@hypit/local-notepad-list`. */
  readonly name: string;
  /** Directory the package is written into; defaults to `packages/<slug>` under `cwd`. */
  readonly to?: string;
  /** A package that draws nothing skips the still-render entry and the preview picture. */
  readonly visual?: boolean;
  readonly cwd: string;
};

export type ScaffoldedPackage = {
  readonly name: string;
  /** Absolute directory the package was written into. */
  readonly root: string;
  /** The Markup tag its one Surface declaration answers to. */
  readonly tag: string;
  /** The Surface's declared name inside the Module. */
  readonly surface: string;
  readonly visual: boolean;
  /** Package-relative paths, in the order they were written. */
  readonly files: readonly string[];
};

const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

/** `@hypit/local-notepad-list` → `local-notepad-list`; an unscoped name is its own slug. */
function slugOf(name: string): string {
  const separator = name.indexOf("/");
  return separator === -1 ? name : name.slice(separator + 1);
}

function words(slug: string): readonly string[] {
  return slug.split(/[^a-z0-9]+/u).filter((word) => word.length > 0);
}

function pascal(parts: readonly string[]): string {
  return parts.map((word) => word[0]!.toUpperCase() + word.slice(1)).join("");
}

function camel(parts: readonly string[]): string {
  const value = pascal(parts);
  return value[0]!.toLowerCase() + value.slice(1);
}

/**
 * A package installed only by one project is conventionally named `local-…`; that prefix
 * says where the package lives, not what its element is, so it is not part of the tag.
 */
function tagWords(slug: string): readonly string[] {
  const parts = words(slug);
  const stripped = parts[0] === "local" ? parts.slice(1) : parts;
  return stripped.length > 0 ? stripped : parts;
}

export type ScaffoldNames = {
  readonly slug: string;
  readonly tag: string;
  readonly surface: string;
  /** Identifier prefix every exported binding carries. */
  readonly symbol: string;
};

export function scaffoldNames(name: string): ScaffoldNames {
  if (!NAME.test(name)) {
    throw new Error(`${name} is not a package name; write it as @scope/kebab-case-name`);
  }
  const slug = slugOf(name);
  const parts = tagWords(slug);
  return {
    slug,
    tag: pascal(parts),
    surface: parts.join("-"),
    symbol: camel(parts),
  };
}

function packageJson(name: string, visual: boolean): string {
  const value = {
    name,
    version: "0.0.0-dev",
    license: "SEE LICENSE IN LICENSE",
    private: true,
    type: "module",
    exports: { ".": "./src/index.ts" },
    hypit: { activation: "./src/activation.ts" },
    dependencies: {
      "@hypit/component-kit": "workspace:*",
      "@hypit/markup": "workspace:*",
      "@hypit/protocol": "workspace:*",
    },
    ...(visual
      ? {
        devDependencies: {
          "@hypit/composition": "workspace:*",
          "@hypit/hyperframes": "workspace:*",
          "@hypit/program-space": "workspace:*",
          "@hypit/provider-hyperframes-local": "workspace:*",
        },
      }
      : {}),
  };
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

function manifest(name: string, names: ScaffoldNames, visual: boolean): string {
  const { tag, surface, symbol } = names;
  const preview = visual
    ? `    preview: previewImage("${tag}.png"),\n`
    : "";
  const previewHelper = visual
    ? [
      `import { readFile } from "node:fs/promises";`,
      ``,
      ``,
    ].join("\n")
    : "";
  const previewFunction = visual
    ? [
      `/** The picture this package ships for its own Surface, read from its own preview/ directory. */`,
      `const previewImage = (file: string) => ({`,
      `  mediaType: "image/png",`,
      `  path: \`preview/\${file}\`,`,
      `  open: async () => Uint8Array.from(await readFile(new URL(\`../preview/\${file}\`, import.meta.url))),`,
      `});`,
      ``,
      ``,
    ].join("\n")
    : "";
  const appearance = visual
    ? `    appearance: "Describe exactly what a viewer sees: the shapes, where they sit, how they enter, hold and leave. Replace this sentence before the package ships — a reader who cannot picture the element cannot choose it.",\n`
    : "";
  return `${previewHelper}import type { MarkupSurfaceDeclaration } from "@hypit/markup";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";

${previewFunction}export const ${symbol}ModuleRef = { name: "${name}", version: "1" } as const;

/**
 * Nominal Types this Module owns. Add one entry per authored value, declare the same name
 * in the Manifest below, and give it a TypeScript shape in types.ts.
 */
export const ${symbol}Types = {} satisfies Record<string, TypeRef>;

/**
 * Producers this Module declares. Add one entry per deterministic step, declare its inputs
 * and outputs in the Manifest below, and implement it in component.ts.
 */
export const ${symbol}Producers = {} satisfies Record<string, ProducerRef>;

export const ${symbol}MarkupSurfaces = [{
  name: "${surface}", tag: "${tag}", mode: "structured",
  // One entry per Type this element publishes, once the Manifest declares one.
  outputs: [],
  vocabulary: {
    summary: "One ${tag}. Say what the element is for in one sentence, in the author's terms.",
${appearance}${preview}    attributes: [
      { name: "id", kind: "identifier", required: true,
        summary: "Names this ${tag} and prefixes every binding it publishes." },
    ],
    example: \`<${surface}:${tag} id="example"/>\`,
    notes: [
      "The element is empty; it accepts no children and no text.",
      "This Surface publishes nothing yet: its Module declares no Type for it to carry.",
    ],
  },
}] as const satisfies readonly MarkupSurfaceDeclaration[];

export const ${symbol}Manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: ${symbol}ModuleRef.name,
  version: ${symbol}ModuleRef.version,
  // One entry per Module whose Types this one references.
  dependencies: [],
  types: [],
  capabilities: [],
  producers: [],
};

export const ${symbol}Dependency = { module: ${symbol}ModuleRef } as const;
`;
}

function types(names: ScaffoldNames): string {
  const { tag } = names;
  return `/**
 * The TypeScript shapes the Manifest's nominal Types carry. Every value that crosses a
 * boundary belongs here, and gets an \`assert…\` and a \`seal…\` beside the code that builds it.
 */

/** Identity every ${tag} value is prefixed by. */
export type ${tag}Header = {
  readonly id: string;
};
`;
}

function surface(names: ScaffoldNames): string {
  const { tag, symbol } = names;
  return `import type { StructuredElement, StructuredSurfaceHandler } from "@hypit/markup";

import type { ${tag}Header } from "./types.js";

/** Exactly the attributes the vocabulary declares; add each new one here and there together. */
const ATTRIBUTES: readonly string[] = ["id"];

function requiredText(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(\`\${element.name}.\${name} must be text.\`);
  }
  return value.trim();
}

/** Reads what the vocabulary promises, and refuses anything else in the author's terms. */
export function read${tag}Header(element: StructuredElement): ${tag}Header {
  const unknown = Object.keys(element.attributes).find((name) => !ATTRIBUTES.includes(name));
  if (unknown !== undefined) throw new Error(\`\${element.name} does not accept \${unknown}.\`);
  if (element.children.length > 0) throw new Error(\`\${element.name} accepts no children.\`);
  return { id: requiredText(element, "id") };
}

/**
 * Decodes one <${tag}> element.
 *
 * It validates the element today and publishes nothing, because the Module declares no
 * Type yet. To publish: add the Type to \`${symbol}Types\`, list it in the Manifest and in
 * this Surface's \`outputs\`, then push a SurfaceRecordDraft here —
 *
 *   records.push({
 *     id: header.id,
 *     type: ${symbol}Types.program,
 *     value: { kind: "inline", value: seal${tag}Program(header) },
 *     range: element.range,
 *   });
 *
 * Operations the element needs run as Producers, wired by a GraphFragment in \`fragments\`.
 */
export const decode${tag}Surface: StructuredSurfaceHandler = ({ element }) => {
  read${tag}Header(element);
  return { records: [], components: [], fragments: [] };
};
`;
}

function component(names: ScaffoldNames): string {
  const { symbol } = names;
  return `import type { ComponentPackage } from "@hypit/component-kit";

/**
 * The deterministic handlers this package's Manifest declared, plus the Validators that
 * guard its nominal Types. Both lists stay in step with the Manifest: a Producer declared
 * there and missing here fails at load, not at Build.
 */
export const ${symbol}Component = {
  producers: [],
  validators: [],
} satisfies ComponentPackage;
`;
}

function activation(names: ScaffoldNames): string {
  const { tag, symbol } = names;
  return `import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decode${tag}Surface,
  ${symbol}Component,
  ${symbol}Manifest,
  ${symbol}MarkupSurfaces,
  ${symbol}ModuleRef,
} from "./index.js";

/** Everything a Host installs from this package, and nothing a Host has to know by name. */
export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: ${symbol}Manifest }],
  components: [${symbol}Component],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: ${symbol}ModuleRef,
      declaration: ${symbol}MarkupSurfaces[0],
      handler: decode${tag}Surface,
    }),
  ],
};

export default hypitPackage;
`;
}

function index(names: ScaffoldNames): string {
  const { tag, symbol } = names;
  return `export { ${symbol}Component } from "./component.js";
export {
  ${symbol}Dependency,
  ${symbol}Manifest,
  ${symbol}MarkupSurfaces,
  ${symbol}ModuleRef,
  ${symbol}Producers,
  ${symbol}Types,
} from "./manifest.js";
export { decode${tag}Surface, read${tag}Header } from "./surface.js";
export type { ${tag}Header } from "./types.js";
`;
}

function renderStill(names: ScaffoldNames): string {
  const { tag, slug } = names;
  return `/**
 * Renders one frame of this package through the local HyperFrames Runtime and writes it to
 * preview/${tag}.png — the picture this package's Surface declaration points at.
 *
 *   node --import tsx test/render-still.ts [frame]
 *
 * No Provider, no Build and no Runtime Profile take part: the preview is authoring input
 * that ships inside the package, so it is never anybody's Output.
 */
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { sealComposition, sealVisualTrack } from "@hypit/composition";
import type { VisualTrack } from "@hypit/composition";
import { compileHyperframesDocument, materializeHyperframesHtml } from "@hypit/hyperframes";
import { sealProgramSpace } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";

const CANVAS = { width: 1080, height: 1920, clearColor: "#101014" } as const;
const FPS = 10;
const TOTAL_FRAMES = 10;

/** The repository that owns the local HyperFrames Provider, whatever depth this package sits at. */
async function repositoryRoot(): Promise<string> {
  let directory = import.meta.dirname;
  while (true) {
    const marker = path.join(directory, "packages/provider-hyperframes-local/package.json");
    if (await stat(marker).then((entry) => entry.isFile(), () => false)) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("run this inside the repository that owns @hypit/provider-hyperframes-local");
    directory = parent;
  }
}

/**
 * Replace this with your renderer.
 *
 * Build the Program your Surface publishes and lower it to one VisualTrack, exactly as the
 * Producer will. Until then it draws one placeholder card, so the render path can be run
 * and looked at from the first minute.
 */
function render(space: ProgramSpace): VisualTrack {
  void space;
  return sealVisualTrack({
    visualIr: "hypit.visual-ir@1",
    id: "${slug}-preview",
    presents: [{
      id: "placeholder",
      span: { startFrame: 0, endFrameExclusive: TOTAL_FRAMES },
      stacking: { order: 0, tieBreak: "${slug}-preview" },
      elements: [{
        id: "card",
        order: 0,
        kind: "box",
        style: [
          { name: "background-color", value: "#f5f2e8" },
          { name: "border-radius", value: "48px" },
          { name: "height", value: "640px" },
          { name: "left", value: "120px" },
          { name: "position", value: "absolute" },
          { name: "top", value: "640px" },
          { name: "width", value: "840px" },
        ],
      }],
    }],
  });
}

async function main(): Promise<void> {
  const wanted = Number(process.argv[2] ?? "0");
  if (!Number.isSafeInteger(wanted) || wanted < 0) throw new Error("frame must be a whole number");
  const space = sealProgramSpace({
    durationSec: TOTAL_FRAMES / FPS,
    frameRate: { numerator: FPS, denominator: 1 },
  });
  const document = compileHyperframesDocument(sealComposition({
    id: "${slug}-preview",
    canvas: CANVAS,
    tracks: [render(space)],
  }), space);
  const hyperframesCli = createRequire(path.join(await repositoryRoot(), "packages/provider-hyperframes-local/package.json"))
    .resolve("hyperframes/bin/hyperframes.mjs");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "${slug}-still-"));
  try {
    if (document.artifacts.length > 0) {
      // Write each Artifact's bytes into \`temporary\` and return its file name below.
      throw new Error(\`this still does not carry Artifacts yet; \${document.artifacts.length} were required\`);
    }
    await writeFile(path.join(temporary, "index.html"), materializeHyperframesHtml(document, (artifact) => {
      throw new Error(\`unmapped Artifact \${artifact.digest}\`);
    }));
    const frames = path.join(temporary, "frames");
    await mkdir(frames);
    const rendered = spawnSync(process.execPath, [
      hyperframesCli, "render", temporary,
      "--format", "png-sequence", "--output", frames,
      "--fps", String(FPS), "--workers", "1",
      "--no-browser-gpu", "--no-best-effort", "--quiet",
    ], { encoding: "utf8", timeout: 600_000 });
    if (rendered.status !== 0) throw new Error(\`\${rendered.stdout}\\n\${rendered.stderr}\`);
    const produced = (await readdir(frames)).filter((name) => name.endsWith(".png")).sort();
    const chosen = produced[wanted];
    if (chosen === undefined) throw new Error(\`frame \${wanted} is out of range; \${produced.length} rendered\`);
    const output = path.join(import.meta.dirname, "../preview/${tag}.png");
    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(path.join(frames, chosen), output);
    process.stdout.write(\`\${output} (\${produced.length} frames rendered)\\n\`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

await main();
`;
}

function readme(name: string, names: ScaffoldNames, visual: boolean): string {
  const { tag, surface: surfaceName, symbol, slug } = names;
  const visualSection = visual
    ? `
## The preview picture

\`src/manifest.ts\` declares \`preview/${tag}.png\`. Write it with the still-render entry, which
renders one frame through the local HyperFrames Runtime and needs no Provider:

\`\`\`
node --import tsx test/render-still.ts
\`\`\`

It draws a placeholder card until \`render\` in \`test/render-still.ts\` calls your renderer.

Other pictures a component draws itself with — paper, a board, a panel — go in \`assets/\` and
are read with \`readFile(new URL("../assets/…", import.meta.url))\`. Generate one with
\`hypit image --prompt … --to assets/….png\` and commit the result: neither the preview nor an
asset is an input the installing project supplies, and neither is produced by a Build.
`
    : "";
  return `# ${name}

One component package: a Markup element authors write, and the deterministic code behind it.

## What is here

| File | Role |
|---|---|
| \`src/manifest.ts\` | Module identity, nominal Types, Producers and the Surface declaration with its vocabulary |
| \`src/types.ts\` | The TypeScript shapes those nominal Types carry |
| \`src/surface.ts\` | \`<${surfaceName}:${tag}>\` into typed Records and graph inputs |
| \`src/component.ts\` | The Producer handlers the Manifest declared, and the Type Validators |
| \`src/activation.ts\` | The Host facets a Host installs |
| \`src/index.ts\` | The package's public surface |
${visual ? `| \`test/render-still.ts\` | One frame rendered locally into \`preview/${tag}.png\` |\n` : ""}| \`assets/\` | Pictures this component draws itself with |
| \`preview/\` | The picture the Surface declaration points at |

\`docs/guide/component-anatomy.md\` describes every role, including the ones this package does
not have a file for yet: the value layer (\`assert…\`, \`seal…\`), the Style decoder, the renderer
and the Fragment.

## What is still yours to write

1. **The Types.** Add each nominal Type to \`${symbol}Types\` in \`src/manifest.ts\`, declare the
   same name under \`types\`, and give it a shape in \`src/types.ts\`. Write these first and stop
   changing them: everything else agrees with them.
2. **The value layer.** One \`assert…\` stating what is wrong in the author's terms and one
   \`seal…\` canonicalising it, for every value that crosses a boundary.
3. **The Producers.** Declare inputs and outputs under \`producers\` in the Manifest, then
   implement each one in \`src/component.ts\`.
4. **The Surface's real output.** \`decode${tag}Surface\` validates and publishes nothing today.
   Add the Records it pushes and the GraphFragment that wires the Producers.
5. **The vocabulary.** \`summary\`${visual ? ", `appearance`" : ""}, every attribute and every note in \`src/manifest.ts\` are what a
   reader chooses this element by. The scaffolded text is placeholder; replace it.
${visualSection}
## Installing it

The package is a workspace member. From the repository root:

\`\`\`
pnpm install
pnpm check
\`\`\`

Then a Source reaches it by Module name, and \`as\` chooses the prefix its element is written under:

\`\`\`
<?svml using="@hypit/markup@1"?>

<svml>
  <import as="${surfaceName}" from="${name}@1"/>

  <${surfaceName}:${tag} id="${slug}-one"/>
</svml>
\`\`\`

\`hypit check\` on that Source is the shortest proof the package loads.
`;
}

/**
 * Writes one component package and returns what it wrote.
 *
 * The directory must not already hold files: a scaffold that merges into existing work has
 * no way to tell an intentional edit from something it is about to lose.
 */
export async function scaffoldComponentPackage(request: ScaffoldRequest): Promise<ScaffoldedPackage> {
  const names = scaffoldNames(request.name);
  const visual = request.visual ?? true;
  const root = resolve(request.cwd, request.to ?? join("packages", names.slug));
  const existing = await readdir(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (existing.length > 0) {
    throw new Error(`${root} is not empty; scaffold into a new directory`);
  }
  const files: (readonly [string, string])[] = [
    ["package.json", packageJson(request.name, visual)],
    ["README.md", readme(request.name, names, visual)],
    ["src/manifest.ts", manifest(request.name, names, visual)],
    ["src/types.ts", types(names)],
    ["src/surface.ts", surface(names)],
    ["src/component.ts", component(names)],
    ["src/activation.ts", activation(names)],
    ["src/index.ts", index(names)],
    ...(visual ? [["test/render-still.ts", renderStill(names)] as const] : []),
  ];
  for (const [file, contents] of files) {
    const target = join(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  // Both directories are part of the package's shape even before anything is put in them.
  for (const directory of ["assets", "preview"]) {
    await mkdir(join(root, directory), { recursive: true });
  }
  return {
    name: request.name,
    root,
    tag: names.tag,
    surface: names.surface,
    visual,
    files: [...files.map(([file]) => file), "assets/", "preview/"],
  };
}
