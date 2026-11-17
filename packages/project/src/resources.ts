import type { MediaAssetReference } from "@hypit/media-asset";
import type {
  ProjectMediaResourceResolver,
  ProjectMediaService,
} from "@hypit/media-asset/service";

type ResolvedProjectResource = Awaited<ReturnType<ProjectMediaResourceResolver>>;

export type ProjectHostResource = {
  readonly token: string;
  readonly mediaType: string;
  readonly size?: number;
};

export type ProjectHostResourceResolution = {
  readonly address: string;
  readonly mediaType: string;
  readonly size?: number;
};

/** Project-scoped capability addresses for resources exposed by trusted product adapters. */
export class ProjectResourceGateway {
  readonly #media: ProjectMediaService;
  readonly #resolver: ProjectMediaResourceResolver;
  readonly #resources = new Map<string, ResolvedProjectResource>();
  #closed = false;

  constructor(media: ProjectMediaService, resolver: ProjectMediaResourceResolver) {
    this.#media = media;
    this.#resolver = resolver;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Project Resource Gateway is closed.");
  }

  async openMedia(reference: MediaAssetReference): Promise<ProjectHostResource> {
    this.#assertOpen();
    const resolved = await this.#media.resolveMedia(reference, this.#resolver);
    let token: string;
    do token = globalThis.crypto.randomUUID();
    while (this.#resources.has(token));
    this.#resources.set(token, structuredClone(resolved.resource));
    return {
      token,
      mediaType: resolved.resource.mediaType,
      ...(resolved.resource.size === undefined ? {} : { size: resolved.resource.size }),
    };
  }

  resolve(token: string): ProjectHostResourceResolution {
    this.#assertOpen();
    const resource = this.#resources.get(token);
    if (resource === undefined) throw new Error(`Unknown Project resource token ${token}.`);
    return structuredClone(resource);
  }

  revoke(token: string): void {
    if (this.#closed) return;
    this.#resources.delete(token);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#resources.clear();
  }
}

export function openProjectResourceGateway(
  media: ProjectMediaService,
  resolver: ProjectMediaResourceResolver,
): ProjectResourceGateway {
  return new ProjectResourceGateway(media, resolver);
}
