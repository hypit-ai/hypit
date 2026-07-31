import { copyFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fail } from "./diagnostics.js";
import {
  resolveArtifactFile,
  verifyArtifactExecutionDigests,
} from "./artifacts.js";
import { attachExecutionDigests } from "./digests.js";
import { emitHyperframesHtml } from "./hyperframes.js";
import {
  kernelTemporalContracts,
  loadKernels,
  type KernelManifest,
} from "./kernel.js";
import { createLock, verifyLockFile, type SvmlLock } from "./lock.js";
import type {
  AlignmentEvidence,
  AttributeValue,
  PlanIR,
  SourceDocument,
  SourceElement,
} from "./model.js";
import { buildPlan, topologicalInstances } from "./plan.js";
import type {
  HyperframesDocument,
  KernelProjection,
  RuntimeValue,
} from "./runtime-contract.js";
import { projectKernelIsolated } from "./sandbox.js";
import { validateKernelProjection } from "./runtime-validation.js";
import { locateScript } from "./script/locate.js";
import { estimateAlignment, type EstimateOptions } from "./script/estimate.js";
import { parseScript } from "./script/parse.js";
import { loadSourceClosure } from "./source/modules.js";
import { childElements, textContent } from "./source/query.js";
import { applyStyleSheets } from "./source/styles.js";
import { sha256 } from "./util.js";

export type Compilation = {
  document: SourceDocument;
  narrative: ReturnType<typeof parseScript>;
  plan: PlanIR;
  located: ReturnType<typeof locateScript>;
  html: string;
  target: HyperframesDocument;
  outputFile?: string;
  projections: Map<string, KernelProjection>;
  lock: SvmlLock;
  lockVerified: boolean;
  artifactsVerified: boolean;
  artifactManifestHash?: string;
  reproducible: boolean;
};

function childById(document: SourceDocument): Map<string, SourceElement> {
  const output = new Map<string, SourceElement>();
  for (const element of childElements(document.root)) {
    const id = element.attributes.id;
    if (typeof id === "string") output.set(id, element);
  }
  return output;
}

export function resolveScriptBindings(document: SourceDocument): Record<string, string> {
  const script = childElements(document.root, "script")[0];
  if (!script) return {};
  const declarations = childById(document);
  return Object.fromEntries(Object.entries(script.attributes).map(([name, value]) => {
    if (typeof value === "string") return [name, value];
    if (!value || typeof value !== "object" || value.kind !== "reference") {
      fail("script_slot_binding", `Script Slot "${name}" requires literal Text or a Text reference.`);
    }
    const declaration = declarations.get(value.path);
    if (!declaration || declaration.name !== "text") {
      fail(
        "script_slot_binding",
        `Script Slot "${name}" references "${value.path}", which is not a Text declaration.`,
      );
    }
    return [name, textContent(declaration).trim()];
  }));
}

function nestedValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isHyperframesDocument(value: unknown): value is HyperframesDocument {
  return !!value
    && typeof value === "object"
    && (value as HyperframesDocument).contract === "svml.hyperframes-document.v1";
}

async function stageDocumentAssets(
  document: HyperframesDocument,
  outputFile: string,
): Promise<HyperframesDocument> {
  const assetDirectory = resolve(dirname(outputFile), "assets");
  await mkdir(assetDirectory, { recursive: true });
  const staged = new Map<string, string>();
  const stage = async (source: string): Promise<string> => {
    if (!source.startsWith("file:")) return source;
    const existing = staged.get(source);
    if (existing) return existing;
    const local = fileURLToPath(source);
    const contentHash = sha256(await readFile(local));
    const name = `${contentHash.slice(0, 16)}-${basename(local)}`;
    await copyFile(local, resolve(assetDirectory, name));
    const relative = `./assets/${name}`;
    staged.set(source, relative);
    return relative;
  };
  const visuals = await Promise.all(document.visuals.map(async (fragment) => ({
    ...fragment,
    ...(fragment.source ? { source: await stage(fragment.source) } : {}),
  })));
  const audios = await Promise.all(document.audios.map(async (fragment) => ({
    ...fragment,
    source: await stage(fragment.source),
  })));
  return { ...document, visuals, audios };
}

export async function checkSource(file: string): Promise<{
  document: SourceDocument;
  narrative: ReturnType<typeof parseScript>;
  plan: PlanIR;
  manifests: KernelManifest[];
  lock: SvmlLock;
}> {
  const closure = await loadSourceClosure(file);
  const kernels = await loadKernels(closure);
  const document = await applyStyleSheets(closure, kernels);
  const narrative = parseScript(
    document.file,
    document.scriptSource,
    document.scriptOffset,
    resolveScriptBindings(document),
  );
  const plan = buildPlan(document, kernels, narrative);
  await attachExecutionDigests(plan, kernels);
  const manifests = [...kernels.values()];
  return {
    document,
    narrative,
    plan,
    manifests,
    lock: createLock(document, manifests, plan),
  };
}

export async function estimateSource(
  file: string,
  options: EstimateOptions = {},
): Promise<{
  evidence: AlignmentEvidence;
  located: ReturnType<typeof locateScript>;
}> {
  const checked = await checkSource(file);
  const evidence = estimateAlignment(checked.narrative, options);
  return {
    evidence,
    located: locateScript(checked.narrative, evidence),
  };
}

export async function compileSource(args: {
  file: string;
  evidenceFile: string;
  outputFile?: string;
  lockFile?: string;
  artifactsFile?: string;
}): Promise<Compilation> {
  const checked = await checkSource(args.file);
  if (args.lockFile) await verifyLockFile(resolve(args.lockFile), checked.lock);
  const evidence = JSON.parse(
    await readFile(resolve(args.evidenceFile), "utf8"),
  ) as AlignmentEvidence;
  const located = locateScript(checked.narrative, evidence);
  const kernels = await loadKernels(checked.document);
  const artifacts = await resolveArtifactFile(args.artifactsFile, checked.plan, kernels);
  await attachExecutionDigests(checked.plan, kernels, artifacts.outputDigests);
  verifyArtifactExecutionDigests(artifacts, checked.plan);
  const elements = childById(checked.document);
  const root = checked.plan.instances.find((instance) => instance.id === checked.plan.root);
  if (!root) fail("runtime_root_missing", `Root instance "${checked.plan.root}" is missing.`);
  const rootElement = elements.get(root.id);
  if (!rootElement) fail("runtime_root_element", `Root element "${root.id}" is missing.`);
  const width = Number(root.attributes.width ?? 1080);
  const height = Number(root.attributes.height ?? 1920);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    fail("runtime_dimensions", "Film width and height must be finite numbers.");
  }

  const values = new Map<string, RuntimeValue>(checked.plan.values.map((value) => {
    const absoluteSource = value.source
      ? pathToFileURL(resolve(dirname(value.module), value.source)).href
      : undefined;
    return [
      value.id,
      { ...value, ...(absoluteSource ? { absoluteSource } : {}) },
    ];
  }));
  const results = new Map<string, KernelProjection>();

  const resolvePath = (path: string): unknown => {
    if (path === "script") {
      return { narrative: checked.narrative, located };
    }
    if (path.startsWith("script.selection.")) {
      return located.selections[path.slice("script.selection.".length)];
    }
    if (path.startsWith("script.moment.")) {
      return located.moments[path.slice("script.moment.".length)];
    }
    if (path.startsWith("script.segment.")) {
      return located.segments[path.slice("script.segment.".length)];
    }
    const declarationIds = [
      ...checked.plan.values.map((value) => value.id),
      ...checked.plan.instances.map((instance) => instance.id),
    ].sort((left, right) => right.length - left.length);
    const owner = declarationIds.find((id) => path === id || path.startsWith(`${id}.`));
    if (!owner) fail("runtime_reference_unknown", `Unknown reference "${path}".`);
    const tail = path === owner ? [] : path.slice(owner.length + 1).split(".");
    const value = values.get(owner);
    if (value) return tail.length ? nestedValue(value, tail) : value;
    const projection = results.get(owner);
    if (!projection) fail("runtime_reference_unready", `Reference "${path}" is not ready.`);
    return tail.length ? nestedValue(projection.outputs, tail) : projection.outputs;
  };

  const resolveValue = (value: AttributeValue | undefined): unknown => {
    if (value && typeof value === "object" && value.kind === "reference") {
      return resolvePath(value.path);
    }
    return value;
  };

  const resolveNode = (node: SourceElement["children"][number]): unknown => {
    if (node.kind === "text") return { ...node };
    return {
      ...node,
      attributes: Object.fromEntries(Object.entries(node.attributes)
        .map(([name, value]) => [name, resolveValue(value)])),
      children: node.children.map(resolveNode),
    };
  };

  for (const instance of topologicalInstances(checked.plan)) {
    const manifest = kernels.get(instance.kernel);
    if (!manifest) fail("runtime_kernel_missing", `Kernel "${instance.kernel}" is missing.`);
    if (manifest.abiVersion !== "1") {
      fail(
        "runtime_kernel_abi",
        `Kernel "${manifest.name}" uses unsupported implementation ABI ${manifest.abiVersion}.`,
      );
    }
    if (manifest.profile === "capability-v1") {
      const projection = artifacts.projections.get(instance.id);
      if (!projection) {
        fail("artifact_projection_missing", `Capability "${instance.id}" has no resolved outputs.`);
      }
      results.set(instance.id, projection);
      continue;
    }
    const sourceElement = elements.get(instance.id);
    if (!sourceElement) fail("runtime_instance_element", `Element "${instance.id}" is missing.`);
    const element = {
      ...sourceElement,
      attributes: instance.attributes,
    };
    const resolvedElement = {
      ...element,
      attributes: Object.fromEntries(Object.entries(element.attributes)
        .map(([name, value]) => [name, resolveValue(value)])),
      children: element.children.map(resolveNode),
    };
    const context = {
      instance,
      element: resolvedElement,
      narrative: checked.narrative,
      located,
      alignment: evidence,
      plan: checked.plan,
      temporalContracts: kernelTemporalContracts(manifest),
      fps: evidence.fps,
      width,
      height,
    };
    results.set(
      instance.id,
      validateKernelProjection(await projectKernelIsolated(manifest, context)),
    );
  }

  const rootProjection = results.get(checked.plan.root);
  const documentOutput = rootProjection?.outputs.document;
  if (!isHyperframesDocument(documentOutput)) {
    fail(
      "runtime_root_output",
      `Root Kernel "${root.kernel}" did not output svml.hyperframes-document.v1.`,
    );
  }
  const outputFile = args.outputFile ? resolve(args.outputFile) : undefined;
  const materializedDocument = outputFile
    ? await stageDocumentAssets(documentOutput, outputFile)
    : documentOutput;
  const html = emitHyperframesHtml(materializedDocument);
  if (args.outputFile) {
    await mkdir(dirname(outputFile!), { recursive: true });
    await writeFile(outputFile!, html, "utf8");
  }
  return {
    document: checked.document,
    narrative: checked.narrative,
    plan: checked.plan,
    located,
    html,
    target: materializedDocument,
    ...(outputFile ? { outputFile } : {}),
    projections: results,
    lock: checked.lock,
    lockVerified: args.lockFile !== undefined,
    artifactsVerified: artifacts.verified,
    ...(artifacts.manifestHash
      ? { artifactManifestHash: artifacts.manifestHash }
      : {}),
    reproducible:
      args.lockFile !== undefined
      && checked.lock.reproducible
      && artifacts.verified,
  };
}
