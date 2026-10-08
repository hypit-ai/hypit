import { aliases } from "./aliases.js";
import { catalog, models } from "@hypit/byteplus-models";
import { createProvider } from "@hypit/direct-model-kit/provider";
import type { Options, RemoteTask } from "@hypit/direct-model-kit/provider";
import {
  Client,
  assert,
  object,
  keyFor,
  bytesFor,
  post,
  clean,
} from "@hypit/direct-model-kit/transport";
import type { DirectModel } from "@hypit/direct-model-kit";
import type {
  GenerationMediaValue,
  GenerationRequest,
} from "@hypit/generation";
import type { EndpointInvocationContext } from "@hypit/endpoint-kit";
export type BytePlusProviderOptions = Options & {
  readonly publicAssetUrl?: (
    media: GenerationMediaValue,
    context: EndpointInvocationContext,
  ) => Promise<string>;
};
export async function bytePlusBody(
  m: DirectModel,
  r: GenerationRequest,
  c: EndpointInvocationContext,
  publish?: BytePlusProviderOptions["publicAssetUrl"],
) {
  const body: Record<string, unknown> = { model: m.model },
    content: Record<string, unknown>[] = [];
  for (const port of m.ports) {
    const values = r.ports[port.name];
    if (!values) continue;
    if (port.value.kind !== "media") {
      if (port.name === "prompt" && m.result === "video")
        content.push({ type: "text", text: values[0] });
      else if (port.name === "maxImages")
        body.sequential_image_generation_options = { max_images: values[0] };
      else body[m.fields[port.name]!.field] = values[0];
      continue;
    }
    const urls: string[] = [];
    for (const value of values) {
      const media = value as GenerationMediaValue;
      let url: string;
      if (publish) {
        url = await publish(media, c);
        assert(
          url.startsWith("https://"),
          "Published reference URL must use HTTPS",
        );
      } else {
        assert(
          media.role !== "video",
          "BytePlus video references require publicAssetUrl; local video publishing is not configured",
        );
        const bytes = await bytesFor(
          media.artifact,
          c,
          media.role === "audio" ? 15 * 1000 * 1000 : 30 * 1000 * 1000,
        );
        url = `data:${media.artifact.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
      }
      if (m.result === "image") urls.push(url);
      else {
        const role =
          port.name === "firstFrame"
            ? "first_frame"
            : port.name === "lastFrame"
              ? "last_frame"
              : `reference_${media.role}`;
        const type = `${media.role}_url`;
        content.push({ type, [type]: { url }, role });
      }
    }
    if (m.result === "image") body.image = urls.length === 1 ? urls[0] : urls;
  }
  if (m.result === "video") body.content = content;
  else body.response_format = "url";
  assert(
    Buffer.byteLength(JSON.stringify(body)) <= 64 * 1000 * 1000,
    "BytePlus request exceeds 64 MB",
  );
  return body;
}
export function createBytePlusProvider(options: BytePlusProviderOptions = {}) {
  const client = new Client(
    "BytePlus",
    options.baseUrl ?? "https://ark.ap-southeast.bytepluses.com/api/v3",
    "authorization",
    true,
    options.requestTimeoutMs,
    options.fetch,
  );
  return createProvider(
    {
      name: "byteplus",
      aliases,
      catalog,
      definition: models.definition,
      pricing: "https://docs.byteplus.com/en/docs/ModelArk/1099320",
      validateSupport(_m, request) {
        const input = (request.constraints as unknown as GenerationRequest)
          .ports;
        for (const values of Object.values(input))
          for (const v of values) {
            if (typeof v !== "object" || !("artifact" in v)) continue;
            const accepted =
              v.role === "image"
                ? [
                    "image/jpeg",
                    "image/png",
                    "image/webp",
                    "image/bmp",
                    "image/tiff",
                    "image/gif",
                    ...(_m.model.startsWith("dreamina")
                      ? ["image/heic", "image/heif"]
                      : []),
                  ]
                : v.role === "video"
                  ? ["video/mp4", "video/quicktime"]
                  : ["audio/mpeg", "audio/wav"];
            assert(
              accepted.includes(v.artifact.mediaType),
              `BytePlus does not accept ${v.artifact.mediaType}`,
            );
            const maximum =
              v.role === "image"
                ? 30_000_000
                : v.role === "video"
                  ? 200_000_000
                  : 15_000_000;
            assert(
              v.artifact.size > 0 && v.artifact.size <= maximum,
              "BytePlus reference exceeds byte limit",
            );
          }
        if (options.publicAssetUrl) return;
        const ports = (request.constraints as unknown as GenerationRequest)
          .ports;
        const video =
          Object.values(ports)
            .flat()
            .some((v) => typeof v === "object" && v.role === "video") ||
          request.pendingInputs?.some((p) => p.role === "video");
        assert(
          !video,
          "BytePlus video references require a configured publicAssetUrl publisher",
        );
      },
      asynchronous: (m) => m.result === "video",
      async submit(m, r, c) {
        const response = await client.json(
          m.path,
          keyFor(c),
          post(await bytePlusBody(m, r, c, options.publicAssetUrl)),
        );
        assert(
          typeof response.id === "string",
          "BytePlus submission has no task ID",
        );
        return response.id;
      },
      async poll(m, id, c): Promise<RemoteTask> {
        const r = await client.json(
          `${m.path}/${encodeURIComponent(id)}`,
          keyFor(c),
        );
        assert(r.id === id, "BytePlus returned a different task ID");
        if (["queued", "running"].includes(String(r.status)))
          return { id, status: "pending" };
        if (["failed", "expired", "cancelled"].includes(String(r.status))) {
          const e = object(r.error ?? {});
          return {
            id,
            status: "failed",
            code: clean(String(e.code ?? r.status), keyFor(c)),
            message: clean(String(e.message ?? "Generation failed"), keyFor(c)),
          };
        }
        assert(r.status === "succeeded", "Unknown BytePlus task status");
        const content = object(r.content);
        assert(
          typeof content.video_url === "string",
          "BytePlus task has no video",
        );
        return { id, status: "completed", urls: [content.video_url] };
      },
      download: (url, m, c) => client.download(url, m.result, c.resources),
      async immediate(m, r, c) {
        const response = await client.json(
          m.path,
          keyFor(c),
          post(await bytePlusBody(m, r, c, options.publicAssetUrl)),
        );
        assert(
          Array.isArray(response.data) && response.data.length > 0,
          "BytePlus image response has no data",
        );
        const blobs = [];
        for (const raw of response.data) {
          const d = object(raw);
          assert(
            !d.error,
            "BytePlus reported a failed image in the requested set",
          );
          assert(typeof d.url === "string", "BytePlus image has no URL");
          blobs.push(await client.download(d.url, "image", c.resources));
        }
        return { blobs };
      },
    },
    options,
  );
}
