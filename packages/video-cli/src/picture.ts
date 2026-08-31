import type { CliPicture, CliPictureRequest } from "@hypit/cli";
import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { EndpointRegistry, MemoryArtifactStore } from "@hypit/driver-node";
import type { EndpointRegistration } from "@hypit/driver-node";
import type { EndpointOutcome } from "@hypit/endpoint-kit";
import { sealGenerationPortRequest, verifyGeneratedImageSet } from "@hypit/generation";
import type { GenerationPort, GenerationPortValue } from "@hypit/generation";
import { exactModelsFromHostFacets } from "@hypit/model-kit";
import type { ExactModelEndpoint } from "@hypit/model-kit";
import { loadNodePackageSelection } from "@hypit/package-loader-node";
import type { BlobRef, CanonicalValue, Need } from "@hypit/protocol";
import { createHypiHubProvider } from "@hypit/provider-hypihub";

/**
 * The exact model family this Distribution reaches for when the author names none.
 * It is a Host default, not a Core preference: `--model` replaces it outright.
 */
const defaultPictureModel = "@hypit/gpt-image";

/** Options this command exposes, mapped onto the port names models declare for them. */
const optionPorts = {
  aspectRatio: "--aspect-ratio",
  resolution: "--resolution",
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Read the exact image models one installed package declares. The package loader owns
 * which physical bytes answer to the specifier; this only reads the inert declaration.
 */
async function selectImageModel(
  specifier: string,
  packageRoot: string,
  distributionPackageRoot?: string,
): Promise<ExactModelEndpoint> {
  const loaded = await loadNodePackageSelection([specifier], packageRoot, {
    ...(distributionPackageRoot === undefined ? {} : { fallbackRoots: [distributionPackageRoot] }),
  });
  const selected = loaded.find((item) => item.specifier === specifier);
  assert(selected !== undefined, `installed package ${specifier} contributed nothing`);
  const declared = exactModelsFromHostFacets(selected.contribution.hostFacets ?? []);
  const images = declared.filter((item) => item.ports.result === "image");
  const [endpoint] = images;
  assert(endpoint !== undefined, declared.length === 0
    ? `${specifier} declares no exact model`
    : `${specifier} declares no exact image model; it offers ${declared.map((item) => item.ports.model).join(", ")}`);
  return endpoint;
}

/**
 * Fill every port the model requires. An option the author gave wins; everything else
 * takes the model's own first declared value, so the cheapest, most neutral rendering
 * is what an unqualified request buys.
 */
function portValue(
  port: GenerationPort,
  request: CliPictureRequest,
  model: string,
): GenerationPortValue | undefined {
  if (port.name === "prompt") return request.prompt;
  const supplied = port.name === "aspectRatio" ? request.aspectRatio
    : port.name === "resolution" ? request.resolution
      : undefined;
  if (supplied !== undefined) return supplied;
  if (port.minItems === 0) return undefined;
  const kind = port.value;
  if (kind.kind === "enum") return kind.values[0]!;
  if (kind.kind === "boolean") return true;
  if (kind.kind === "number") return kind.minimum ?? 1;
  throw new Error(`${model} requires ${port.name}, which hypit image cannot supply`);
}

function sealPictureRequest(endpoint: ExactModelEndpoint, request: CliPictureRequest): CanonicalValue {
  const table = endpoint.ports;
  for (const [name, option] of Object.entries(optionPorts)) {
    if (request[name as keyof typeof optionPorts] === undefined) continue;
    assert(table.ports.some((port) => port.name === name),
      `${table.model} has no ${name}; remove ${option}`);
  }
  const ports = Object.fromEntries(table.ports.flatMap((port) => {
    const value = portValue(port, request, table.model);
    return value === undefined ? [] : [[port.name, [value]] as const];
  }));
  return sealGenerationPortRequest(table, ports) as unknown as CanonicalValue;
}

/**
 * Reveal only the secrets this exact Endpoint registration declares. A missing one names
 * the environment variable to set rather than the Provider's internals.
 */
async function resolveCredentials(
  registration: EndpointRegistration,
): Promise<Readonly<Record<string, { readonly secret: string }>>> {
  const store = new EnvironmentCredentialStore();
  const resolved: Record<string, { readonly secret: string }> = {};
  for (const [slot, ref] of Object.entries(registration.credentials ?? {})) {
    const value = await store.resolve(ref);
    assert(value !== undefined, ref.store === "env"
      ? ref.key === "HYPIHUB_API_KEY"
        ? `credential ${slot} is unavailable; set ${ref.key} in the environment (get a HypiHub key at https://hypit.ai)`
        : `credential ${slot} is unavailable; set ${ref.key} in the environment`
      : `credential ${slot} lives in CredentialStore ${ref.store}, which hypit image cannot open`);
    resolved[slot] = value;
  }
  return resolved;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Read the single picture out of the completed generation, then out of the Store. */
async function readPicture(
  outcome: Extract<EndpointOutcome, { readonly status: "completed" }>,
  artifacts: MemoryArtifactStore,
): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
  const value = outcome.result.value;
  assert(value.kind === "inline", "the model returned no inline image set");
  verifyGeneratedImageSet(value.value);
  const [image] = (value.value as unknown as { readonly images: readonly BlobRef[] }).images;
  assert(image !== undefined, "the model returned no picture");
  const bytes = await artifacts.get(image.digest);
  assert(bytes !== undefined, `generated Artifact ${image.digest} was not stored`);
  return { bytes, mediaType: image.mediaType };
}

/**
 * Generate one picture with no Core graph.
 *
 * A package asset is authoring input, so nothing here is durable: the Need, the
 * ArtifactStore and the Provider all live for the length of this one call, and no
 * Build, Record or Runtime Profile observes any of it.
 */
export async function generateVideoCliPicture(request: CliPictureRequest): Promise<CliPicture> {
  const specifier = request.model ?? defaultPictureModel;
  const model = await selectImageModel(specifier, request.packageRoot, request.distributionPackageRoot);
  const need: Need = {
    id: "need:hypit-image",
    capability: model.capability,
    returns: model.returns,
    constraints: sealPictureRequest(model, request),
    result: "record:hypit-image",
  };
  const registry = new EndpointRegistry();
  await createHypiHubProvider({}).install(registry);
  const resolution = registry.resolve(need);
  assert(resolution.status === "resolved",
    `no Provider in this Distribution fulfils ${model.ports.model}`);
  const registration = resolution.registration;
  assert(registration.kind === "asynchronous",
    `${model.ports.model} is fulfilled by an Endpoint hypit image cannot drive`);
  const artifacts = new MemoryArtifactStore();
  const common = {
    command: { kind: "fulfill-need" as const, id: "command:hypit-image", need },
    need,
    artifacts,
    credentials: await resolveCredentials(registration),
    operation: "operation:hypit-image",
  };
  let outcome = await registration.endpoint.start(common);
  while (outcome.status === "pending") {
    const waitMs = outcome.wakeAt === undefined ? 0 : outcome.wakeAt - Date.now();
    if (waitMs > 0) await delay(waitMs);
    outcome = await registration.endpoint.poll({ ...common, handle: outcome.handle });
  }
  assert(outcome.status === "completed", outcome.status === "failed"
    ? `${model.ports.model} failed: ${outcome.failure.code} — ${outcome.failure.message}`
    : `${model.ports.model} returned no picture`);
  const picture = await readPicture(outcome, artifacts);
  return {
    package: specifier,
    model: model.ports.model,
    mediaType: picture.mediaType,
    bytes: picture.bytes,
  };
}
