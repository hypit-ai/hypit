import { createReadStream } from "node:fs";
import type { NodeProjectMediaService } from "@hypit/media-asset/service/node";
import { defaultMediaSelection } from "@hypit/media";
import { inspectMediaFileForAdoption, mediaTypeFromFile } from "@hypit/media-local";
import type { ProjectHost } from "@hypit/project";
import { createNodeProjectResourceResolver } from "@hypit/project/node";
import type { MediaReference } from "@hypit/canvas";

export async function openProjectMedia(project: ProjectHost, reference: MediaReference) {
  const { resource } = await project.media.resolveMedia(reference, createNodeProjectResourceResolver(project.boundary.root));
  return { mediaType: resource.mediaType, ...(resource.size === undefined ? {} : { size: resource.size }),
    bytes: (async function* () { yield* createReadStream(resource.address); })() };
}

export async function importProjectMedia(
  project: ProjectHost,
  request: { sourcePath: string; sourceName: string },
  options: { readonly ffprobePath?: string },
  signal: AbortSignal,
) {
  const service = project.media as Partial<NodeProjectMediaService>;
  if (typeof service.adoptFile !== "function") throw new Error("This Project has no Media import port.");
  const mediaType = mediaTypeFromFile(request.sourceName);
  const result = await service.adoptFile({ ...request, mediaType }, {
    inspect: (path, context) => inspectMediaFileForAdoption(path, mediaType, {
      ...options,
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    }),
    select: inspection => defaultMediaSelection(inspection, mediaType),
  }, { signal });
  return { reference: result.reference };
}
