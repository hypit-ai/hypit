import {
  defineEndpointPackage,
  wakeAfter,
  credentialRef,
  canonicalize,
} from "@hypit/endpoint-kit";
import type {
  AsyncEndpoint,
  EndpointInvocationContext,
  EndpointOutcome,
  CredentialRef,
  EndpointActionLimits,
} from "@hypit/endpoint-kit";
import {
  generationTypes,
  verifyGenerationMediaBinding,
} from "@hypit/generation";
import type { GenerationRequest } from "@hypit/generation";
import type { ExactModelEndpoint, ExactModelModule } from "@hypit/model-kit";
import type { BlobRef } from "@hypit/protocol";
import type { DirectModel } from "./index.js";
import { ApiError, assert, object, clean } from "./transport.js";

/** Planning names future media by slot; it must not pretend that those bytes already exist. */
function validatePlanningDraft(
  endpoint: ExactModelEndpoint,
  constraints: unknown,
  pending: readonly import("@hypit/endpoint-kit").EndpointInputSlot[] = [],
  remapped = false,
) {
  const ports = object(object(constraints).ports, "planned ports");
  const known: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const [name, raw] of Object.entries(ports)) {
    const port = endpoint.ports.ports.find((p) => p.name === name);
    assert(port && Array.isArray(raw), `Invalid planned port ${name}`);
    assert(
      raw.length > 0 && raw.length <= port.maxItems,
      `${name} accepts at most ${port.maxItems} values`,
    );
    counts[name] = raw.length;
    for (const value of raw) {
      if (
        port.value.kind === "media" &&
        value &&
        typeof value === "object" &&
        "slot" in value
      ) {
        const slot = object(value);
        assert(
          typeof slot.slot === "string" &&
            slot.slot.length > 0 &&
            !("artifact" in slot),
          "Invalid pending media slot",
        );
        assert(
          pending.some(
            (p) => (remapped || p.input === name) && p.role === slot.role,
          ),
          "Undeclared pending media input",
        );
        verifyGenerationMediaBinding(
          port as import("@hypit/generation").GenerationMediaPort,
          slot,
        );
      } else (known[name] ??= []).push(value);
    }
  }
  for (const rule of endpoint.ports.requires) {
    if (rule.kind === "atMostOneOf")
      assert(
        rule.ports.filter((p) => counts[p]).length <= 1,
        `Incompatible ports: ${rule.ports.join(", ")}`,
      );
    else if (rule.kind === "requiresPresent" && counts[rule.port])
      assert(
        rule.needs.every((p) => counts[p]),
        `${rule.port} requires ${rule.needs.join(", ")}`,
      );
    else if (rule.kind === "requiresAnyOf" && counts[rule.port])
      assert(
        rule.anyOf.some((p) => counts[p]),
        `${rule.port} requires ${rule.anyOf.join(" or ")}`,
      );
    else if (rule.kind === "weightedTotal")
      assert(
        Object.entries(rule.weights).reduce(
          (n, [p, w]) => n + (counts[p] ?? 0) * w,
          0,
        ) <= rule.maximum,
        "Reference count exceeds the model limit",
      );
  }
  endpoint.validateDraft({ ports: known });
}
export interface Options {
  readonly instance?: string;
  readonly pool?: string;
  readonly apiKey?: CredentialRef;
  readonly baseUrl?: string;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: EndpointActionLimits;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly fetch?: typeof fetch;
  readonly enabledModels?: readonly string[];
  readonly allowGatedModels?: boolean;
}
export interface RemoteTask {
  readonly id: string;
  readonly status: "pending" | "completed" | "failed";
  readonly code?: string;
  readonly message?: string;
  readonly urls?: readonly string[];
}
export interface Alias {
  readonly endpoint: ExactModelEndpoint;
  readonly model: DirectModel;
  readonly convert: (request: GenerationRequest) => GenerationRequest;
}
export interface Service {
  readonly aliases?: readonly Alias[];
  readonly validateSupport?: (
    model: DirectModel,
    request: import("@hypit/endpoint-kit").EndpointRequest,
  ) => void;
  readonly name: string;
  readonly catalog: readonly DirectModel[];
  readonly definition: ExactModelModule;
  readonly pricing: string;
  readonly asynchronous: (model: DirectModel) => boolean;
  readonly submit: (
    model: DirectModel,
    request: GenerationRequest,
    context: EndpointInvocationContext,
  ) => Promise<string>;
  readonly poll: (
    model: DirectModel,
    id: string,
    context: EndpointInvocationContext,
  ) => Promise<RemoteTask>;
  readonly download: (
    url: string,
    model: DirectModel,
    context: EndpointInvocationContext,
  ) => Promise<BlobRef>;
  readonly immediate: (
    model: DirectModel,
    request: GenerationRequest,
    context: EndpointInvocationContext,
  ) => Promise<{ blobs: readonly BlobRef[]; receipt?: { id: string } }>;
}
export function createProvider(service: Service, options: Options = {}) {
  const moduleName = `@hypit/provider-${service.name}`,
    contract = `hypit.${service.name}-direct@1`;
  const timeout = options.operationTimeoutMs ?? 60 * 60 * 1000,
    interval = options.pollIntervalMs ?? 10000;
  for (const [name, value] of Object.entries({
    timeout,
    interval,
    requestTimeoutMs: options.requestTimeoutMs ?? 300000,
  }))
    assert(
      Number.isSafeInteger(value) && value > 0,
      `${name} must be a positive integer`,
    );
  const enabled = options.enabledModels
    ? new Set(options.enabledModels)
    : undefined;
  for (const name of enabled ?? [])
    assert(
      service.catalog.some((m) => m.model === name),
      `Unknown configured model ${name}`,
    );
  const why = (m: DirectModel) =>
    enabled && !enabled.has(m.model)
      ? `${m.model} is disabled in this endpoint`
      : m.gated && !options.allowGatedModels
        ? `${m.model} requires provider approval; enable allowGatedModels only after account access is granted`
        : undefined;
  const failure = (error: unknown): EndpointOutcome => ({
    status: "failed",
    failure: {
      code:
        error instanceof ApiError
          ? error.code
          : `${service.name.toUpperCase()}_ERROR`,
      message: clean(error instanceof Error ? error.message : String(error)),
    },
  });
  const result = (m: DirectModel, blobs: readonly BlobRef[]) => {
    assert(blobs.length > 0, "Provider returned no media");
    for (const b of blobs)
      assert(
        b.size > 0 && b.mediaType.startsWith(m.result + "/"),
        "Provider returned wrong media type",
      );
    return {
      value: {
        kind: "inline" as const,
        value: canonicalize({
          [m.result === "image"
            ? "images"
            : m.result === "video"
              ? "videos"
              : "audios"]: blobs,
        }),
      },
    };
  };
  const routes = [
    ...service.catalog.map((m) => ({
      model: m,
      endpoint: service.definition.endpoints[m.model]!,
      convert: (r: GenerationRequest) => r,
    })),
    ...(service.aliases ?? []),
  ];
  const capabilities = routes.map(({ model: m, endpoint, convert }) => {
    const validate = (request: GenerationRequest) => {
      const reason = why(m);
      assert(!reason, reason ?? "");
      endpoint.validateRequest(request);
      const native = convert(request);
      service.definition.endpoints[m.model]!.validateRequest(native);
      service.validateSupport?.(m, {
        capability: endpoint.capability,
        returns: endpoint.returns,
        constraints: canonicalize(native),
      });
      return native;
    };
    const base = {
      capability: endpoint.capability,
      returns:
        generationTypes[
          m.result === "image"
            ? "imageSet"
            : m.result === "video"
              ? "videoSet"
              : "audioSet"
        ],
      capacity: m.model,
      supports: (request: import("@hypit/endpoint-kit").EndpointRequest) => {
        try {
          const reason = why(m);
          assert(!reason, reason ?? "");
          validatePlanningDraft(
            endpoint,
            request.constraints,
            request.pendingInputs,
          );
          validatePlanningDraft(
            service.definition.endpoints[m.model]!,
            convert(request.constraints as unknown as GenerationRequest),
            request.pendingInputs,
            true,
          );
          service.validateSupport?.(m, request);
          return { status: "supported" as const };
        } catch (e) {
          return {
            status: "unsupported" as const,
            reason: clean(e instanceof Error ? e.message : String(e)),
          };
        }
      },
    };
    if (!service.asynchronous(m))
      return {
        ...base,
        lifecycle: "immediate" as const,
        handler: async (context: EndpointInvocationContext) => {
          const request = validate(
            context.need.constraints as unknown as GenerationRequest,
          );
          const r = await service.immediate(m, request, context);
          return result(m, r.blobs);
        },
      };
    const getHandle = (h: unknown) => {
      const value = object(h, "operation handle");
      assert(
        value.contract === contract &&
          value.model === m.model &&
          typeof value.id === "string" &&
          Number.isFinite(value.startedAt),
        "Invalid operation handle",
      );
      return value as {
        contract: string;
        model: string;
        id: string;
        startedAt: number;
        urls?: string[];
        polls?: number;
      };
    };
    const receipt = (id: string) => ({ id });
    const asyncEndpoint: AsyncEndpoint = {
      async start(context) {
        try {
          const request = validate(
            context.need.constraints as unknown as GenerationRequest,
          );
          const id = await service.submit(m, request, context);
          assert(
            id.length > 0,
            "Submission returned no task ID; remote outcome unknown",
          );
          const handle = canonicalize({
            contract,
            model: m.model,
            id,
            startedAt: Date.now(),
            polls: 0,
          });
          await context.checkpoint?.({ handle, receipt: receipt(id) });
          return {
            ...wakeAfter(
              handle,
              Math.max(m.result === "video" ? 10000 : 2000, interval),
            ),
            receipt: receipt(id),
          };
        } catch (e) {
          return failure(e);
        }
      },
      async poll(context) {
        const h = getHandle(context.handle);
        const rec = receipt(h.id);
        if (Date.now() - h.startedAt > timeout)
          return {
            status: "failed",
            receipt: rec,
            failure: {
              code: "OPERATION_TIMEOUT",
              message: `${service.name} task ${h.id} exceeded local wait limit; remote outcome is unknown`,
            },
          };
        try {
          const task = await service.poll(m, h.id, context);
          if (task.status === "failed")
            return {
              status: "failed",
              receipt: rec,
              failure: {
                code: task.code ?? "REMOTE_FAILED",
                message: clean(task.message ?? "Remote generation failed"),
              },
            };
          if (task.status === "completed") {
            assert(
              task.urls && task.urls.length > 0,
              "Completed task has no output",
            );
            return {
              status: "ready",
              handle: canonicalize({ ...h, urls: task.urls }),
              receipt: rec,
            };
          }
          return {
            ...wakeAfter(
              canonicalize({ ...h, polls: (h.polls ?? 0) + 1 }),
              Math.min(
                60000,
                Math.max(interval, m.result === "video" ? 10000 : 2000) *
                  2 ** Math.floor((h.polls ?? 0) / 6),
              ),
            ),
            receipt: rec,
          };
        } catch (e) {
          if (e instanceof ApiError && (e.status === 429 || e.status >= 500))
            return {
              ...wakeAfter(
                canonicalize(h),
                Math.max(interval, e.retryAfterMs ?? 0),
              ),
              receipt: rec,
            };
          return { ...failure(e), receipt: rec };
        }
      },
      async collect(context) {
        const h = getHandle(context.handle);
        try {
          // Refresh short-lived output URLs without submitting another generation.
          const task = await service.poll(m, h.id, context);
          assert(
            task.status === "completed" && task.urls?.length,
            "Output is unavailable at collection",
          );
          const blobs = [];
          for (const url of task.urls)
            blobs.push(await service.download(url, m, context));
          return {
            status: "completed",
            result: result(m, blobs),
            receipt: receipt(h.id),
          };
        } catch (e) {
          return { ...failure(e), receipt: receipt(h.id) };
        }
      },
    };
    return {
      ...base,
      lifecycle: "asynchronous" as const,
      endpoint: asyncEndpoint,
    };
  });
  return defineEndpointPackage({
    module: { name: moduleName, version: "1" },
    facet: "direct",
    instance: options.instance ?? `${service.name}.default`,
    pool: options.pool ?? options.instance ?? `${service.name}.default`,
    credentials: {
      apiKey: options.apiKey ?? credentialRef("os", `${service.name}.api-key`),
    },
    credentialInputs: { apiKey: { label: `${service.name} API key` } },
    pricing: { kind: "page", url: service.pricing },
    defaultConcurrency: options.defaultConcurrency ?? 2,
    ...(options.actionLimits ? { actionLimits: options.actionLimits } : {}),
    capabilities,
  });
}
