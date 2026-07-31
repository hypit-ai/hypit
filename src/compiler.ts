import { copyFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fail } from "./diagnostics.js";
import { expandComposites } from "./composite.js";
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
import { createLock, freezeLock, verifyLockFile, type SvmlLock } from "./lock.js";
import type {
  AlignmentEvidence,
  AttributeValue,
  ExactSemanticMap,
  LocatedScript,
  PlanIR,
  SourceDocument,
  SourceElement,
  TemporalBasisProduction,
} from "./model.js";
import { buildPlan, topologicalInstances } from "./plan.js";
import type {
  HyperframesDocument,
  KernelProjection,
  RuntimeValue,
} from "./runtime-contract.js";
import { projectKernelIsolated } from "./sandbox.js";
import { validateKernelProjection } from "./runtime-validation.js";
import { bindSemanticMap, locateScript } from "./script/locate.js";
import { estimateAlignment, type EstimateOptions } from "./script/estimate.js";
import { parseScript } from "./script/parse.js";
import { loadSourceClosure } from "./source/modules.js";
import { childElements, textContent } from "./source/query.js";
import { applyStyleSheets } from "./source/styles.js";
import { sha256, stableJson } from "./util.js";
import {
  createProgramBasis,
  semanticMapFromAlignment,
  validateSemanticMap,
  validateTemporalBasisProduction,
} from "./temporal.js";

export type Compilation = {
  document: SourceDocument;
  narrative: ReturnType<typeof parseScript>;
  plan: PlanIR;
  basis: TemporalBasisProduction;
  semanticMap: ExactSemanticMap;
  located: LocatedScript;
  html: string;
  target: HyperframesDocument;
  outputFile?: string;
  projections: Map<string, KernelProjection>;
  lock: SvmlLock;
  sourceClosureVerified: boolean;
  temporalEvidenceVerified: boolean;
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

function validateTrackOutput(
  instanceId: string,
  portName: string,
  value: unknown,
  durationFrames: number,
): void {
  if (!value || typeof value !== "object") {
    fail("track_output_shape", `Track output "${instanceId}.${portName}" is not an object.`);
  }
  const track = value as { visuals?: unknown; audios?: unknown; styles?: unknown };
  if (!Array.isArray(track.visuals) || !Array.isArray(track.audios) || !Array.isArray(track.styles)) {
    fail(
      "track_output_shape",
      `Track output "${instanceId}.${portName}" requires flat visuals, audios and styles arrays.`,
    );
  }
  for (const contribution of [...track.visuals, ...track.audios] as Array<{
    id?: unknown;
    startFrame?: unknown;
    endFrameExclusive?: unknown;
  }>) {
    if (
      typeof contribution.id !== "string"
      || !Number.isInteger(contribution.startFrame)
      || !Number.isInteger(contribution.endFrameExclusive)
      || (contribution.startFrame as number) < 0
      || (contribution.endFrameExclusive as number) > durationFrames
      || (contribution.endFrameExclusive as number) <= (contribution.startFrame as number)
    ) {
      fail(
        "track_contribution_window",
        `Track "${instanceId}" contribution "${String(contribution.id)}" has invalid Program range ${String(contribution.startFrame)}..${String(contribution.endFrameExclusive)} for duration ${durationFrames}.`,
      );
    }
  }
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
  const styled = await applyStyleSheets(closure, kernels);
  const document = await applyStyleSheets(expandComposites(styled, kernels), kernels);
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
  basis: ReturnType<typeof createProgramBasis>;
  map: ReturnType<typeof semanticMapFromAlignment>;
  located: LocatedScript;
}> {
  const checked = await checkSource(file);
  const evidence = estimateAlignment(checked.narrative, options);
  const basis = createProgramBasis({
    fps: evidence.fps,
    durationFrames: Math.round(evidence.durationSec * evidence.fps),
    outcomeDigest: sha256(JSON.stringify({
      kind: "svml.estimated-program-basis.v1",
      evidence,
    })),
  });
  const map = semanticMapFromAlignment(
    checked.narrative,
    basis,
    evidence,
    { precision: "estimated" },
  );
  return {
    evidence,
    basis,
    map,
    located: bindSemanticMap(checked.narrative, basis, map),
  };
}

export async function compileSource(args: {
  file: string;
  outputFile?: string;
  lockFile?: string;
  artifactsFile?: string;
}): Promise<Compilation> {
  const checked = await checkSource(args.file);
  const suppliedLock = args.lockFile
    ? await verifyLockFile(resolve(args.lockFile), checked.lock)
    : undefined;
  const kernels = await loadKernels(checked.document);
  const artifacts = await resolveArtifactFile(args.artifactsFile, checked.plan, kernels);
  await attachExecutionDigests(checked.plan, kernels, artifacts.outputDigests);
  verifyArtifactExecutionDigests(artifacts, checked.plan);
  const elements = childById(checked.document);
  const root = checked.plan.instances.find((instance) => instance.id === checked.plan.root);
  if (!root) fail("runtime_root_missing", `Root instance "${checked.plan.root}" is missing.`);
  const rootElement = elements.get(root.id);
  if (!rootElement) fail("runtime_root_element", `Root element "${root.id}" is missing.`);
  const rootManifest = kernels.get(root.kernel);
  if (!rootManifest) fail("runtime_kernel_missing", `Kernel "${root.kernel}" is missing.`);
  const basisPort = rootManifest.ports.find((port) =>
    port.direction === "input" && port.type.split("|").includes("TemporalBasisProduction"));
  const semanticPort = rootManifest.ports.find((port) =>
    port.direction === "input" && port.type.split("|").includes("ExactSemanticMap"));
  if (!basisPort || !semanticPort) {
    fail("runtime_composition_contract", "Composition does not expose basis/map input ports.");
  }
  const width = Number(root.attributes.width ?? 1080);
  const height = Number(root.attributes.height ?? 1920);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    fail("runtime_dimensions", "Film width and height must be finite numbers.");
  }

  const valueEntries = await Promise.all(checked.plan.values.map(async (value) => {
    const absoluteSource = value.source
      ? pathToFileURL(resolve(dirname(value.module), value.source)).href
      : undefined;
    const data = value.type === "AlignmentEvidence" && value.source
      ? JSON.parse(await readFile(resolve(dirname(value.module), value.source), "utf8"))
      : undefined;
    return [
      value.id,
      {
        ...value,
        ...(absoluteSource ? { absoluteSource } : {}),
        ...(data !== undefined ? { data } : {}),
      },
    ] as const;
  }));
  const values = new Map<string, RuntimeValue>(valueEntries);
  const results = new Map<string, KernelProjection>();
  let located: LocatedScript | undefined;

  const resolvePath = (path: string): unknown => {
    if (path === "script") {
      return checked.narrative;
    }
    if (path.startsWith("script.selection.")) {
      if (!located) fail("runtime_temporal_unbound", `Temporal reference "${path}" is not bound yet.`);
      return located.selections[path.slice("script.selection.".length)];
    }
    if (path.startsWith("script.moment.")) {
      if (!located) fail("runtime_temporal_unbound", `Temporal reference "${path}" is not bound yet.`);
      return located.moments[path.slice("script.moment.".length)];
    }
    if (path.startsWith("script.segment.")) {
      return checked.narrative.segments.find(
        (segment) => segment.id === path.slice("script.segment.".length),
      );
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

  const executeInstance = async (instance: PlanIR["instances"][number]): Promise<void> => {
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
      return;
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
      temporalContracts: kernelTemporalContracts(manifest),
      ...(located ? {
        program: {
          basisDigest: located.basisDigest,
          fps: located.fps,
          durationFrames: located.durationFrames,
          durationSec: located.durationSec,
        },
      } : {}),
      fps: located?.fps ?? Number(root.attributes.fps ?? 30),
      width,
      height,
    };
    const projection = validateKernelProjection(await projectKernelIsolated(manifest, context));
    if (located) {
      for (const port of manifest.ports.filter((candidate) =>
        candidate.direction === "output" && candidate.type === "Track")) {
        validateTrackOutput(instance.id, port.name, projection.outputs[port.name], located.durationFrames);
      }
    }
    results.set(instance.id, projection);
  };

  const ordered = topologicalInstances(checked.plan);
  const instanceIds = ordered.map((instance) => instance.id)
    .sort((left, right) => right.length - left.length);
  const producerOf = (value: AttributeValue | undefined, label: string): string => {
    if (!value || typeof value !== "object" || value.kind !== "reference") {
      fail("runtime_composition_reference", `Composition ${label} must be an instance output reference.`);
    }
    const owner = instanceIds.find((id) => value.path === id || value.path.startsWith(`${id}.`));
    if (!owner) fail("runtime_composition_reference", `Composition ${label} has no producer.`);
    return owner;
  };
  const preBinding = new Set<string>();
  const addPreBinding = (id: string): void => {
    if (preBinding.has(id)) return;
    preBinding.add(id);
    const instance = ordered.find((candidate) => candidate.id === id);
    for (const dependency of instance?.dependencies ?? []) {
      if (ordered.some((candidate) => candidate.id === dependency)) addPreBinding(dependency);
    }
  };
  addPreBinding(producerOf(rootElement.attributes[basisPort.name], basisPort.name));
  addPreBinding(producerOf(rootElement.attributes[semanticPort.name], semanticPort.name));
  for (const instance of ordered) {
    if (preBinding.has(instance.id)) await executeInstance(instance);
  }

  const production = resolveValue(
    rootElement.attributes[basisPort.name],
  ) as TemporalBasisProduction | undefined;
  const semanticMap = resolveValue(
    rootElement.attributes[semanticPort.name],
  ) as ExactSemanticMap | undefined;
  if (production?.contract !== "svml.temporal-basis-production.v1") {
    fail("runtime_basis_missing", "Composition root must select one TemporalBasisProduction.");
  }
  if (semanticMap?.contract !== "svml.exact-semantic-map.v1") {
    fail("runtime_semantic_map_missing", "Composition root must select one ExactSemanticMap.");
  }
  validateTemporalBasisProduction(production);
  validateSemanticMap(checked.narrative, production.basis, semanticMap);
  located = locateScript(checked.narrative, production.basis, semanticMap);

  for (const instance of ordered) {
    if (!preBinding.has(instance.id)) await executeInstance(instance);
  }

  const rootProjection = results.get(checked.plan.root);
  const documentOutput = rootProjection?.outputs.document;
  if (!isHyperframesDocument(documentOutput)) {
    fail(
      "runtime_root_output",
      `Root Kernel "${root.kernel}" did not output svml.hyperframes-document.v1.`,
    );
  }
  const sourceDigests = new Map<string, string>();
  for (const value of values.values()) {
    const source = value.absoluteSource ?? value.source;
    if (source && value.contentDigest) sourceDigests.set(source, value.contentDigest);
  }
  const collectArtifactSources = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collectArtifactSources);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.source === "string" && typeof record.contentDigest === "string") {
      sourceDigests.set(record.source, record.contentDigest);
    }
    Object.values(record).forEach(collectArtifactSources);
  };
  results.forEach((projection) => collectArtifactSources(projection.outputs));
  const canonicalTarget = {
    ...documentOutput,
    visuals: documentOutput.visuals.map((fragment) => ({
      ...fragment,
      ...(fragment.source
        ? { source: sourceDigests.get(fragment.source) ?? fragment.source }
        : {}),
    })),
    audios: documentOutput.audios.map((fragment) => ({
      ...fragment,
      source: sourceDigests.get(fragment.source) ?? fragment.source,
    })),
  };
  const planDigest = sha256(stableJson({
    root: checked.plan.root,
    instances: checked.plan.instances.map((instance) => ({
      identity: instance.identity,
      executionDigest: instance.executionDigest,
    })),
    edges: checked.plan.edges,
    expansions: checked.plan.expansions,
  }));
  const frozenLock = freezeLock(checked.lock, {
    planDigest,
    ...(artifacts.manifestHash ? { artifactManifestHash: artifacts.manifestHash } : {}),
    basisDigest: production.basis.basisDigest,
    productionDigest: production.productionDigest,
    semanticIndexDigest: semanticMap.semanticIndexDigest,
    semanticMapDigest: semanticMap.mapDigest,
    locatorDigest: semanticMap.locatorDigest,
    evidenceDigests: semanticMap.evidenceDigests,
    quantizationPolicy: semanticMap.quantizationPolicy,
    anchors: semanticMap.anchors.map((anchor) => ({
      identity: anchor.identity,
      frame: anchor.point.frame,
      quality: anchor.quality,
    })),
    programSpace: {
      width: documentOutput.width,
      height: documentOutput.height,
      fps: documentOutput.fps,
      durationFrames: documentOutput.durationFrames,
    },
    targetDigest: sha256(stableJson(canonicalTarget)),
    htmlDigest: sha256(emitHyperframesHtml(canonicalTarget)),
  }, artifacts.verified);
  const temporalEvidenceVerified = !!suppliedLock?.execution
    && stableJson(suppliedLock) === stableJson(frozenLock);
  if (suppliedLock?.execution && !temporalEvidenceVerified) {
    fail(
      "lock_execution_mismatch",
      `${resolve(args.lockFile!)} does not match the compiled Basis, SemanticMap or HyperFrames target.`,
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
    basis: production,
    semanticMap,
    located,
    html,
    target: materializedDocument,
    ...(outputFile ? { outputFile } : {}),
    projections: results,
    lock: frozenLock,
    sourceClosureVerified: args.lockFile !== undefined,
    temporalEvidenceVerified,
    lockVerified: temporalEvidenceVerified,
    artifactsVerified: artifacts.verified,
    ...(artifacts.manifestHash
      ? { artifactManifestHash: artifacts.manifestHash }
      : {}),
    reproducible:
      temporalEvidenceVerified
      && frozenLock.reproducible
      && artifacts.verified,
  };
}
