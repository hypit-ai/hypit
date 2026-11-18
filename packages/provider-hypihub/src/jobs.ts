import type { JsonValue, QuoteInputs } from "@hypit/execution";
import type { Capability } from "@hypit/execution/model";
import { bindProviderEndpoint, type ProviderReceipt } from "@hypit/execution/provider";
import { operationPath, verifyOffering, type Selection } from "./catalog.js";
import { failed, record, rejectedSubmission, transient, type HypiHubClient, type HypiHubInputs } from "./client.js";
import { HypiHubHttpError, HypiHubServiceError, hypiHubJobFailure } from "./errors.js";
import { quoteHypiHub } from "./pricing.js";

type JobRoute<Request extends JsonValue> = {
  readonly capability: Capability<Request>;
  readonly output: "image" | "video";
  select(request: Request): Selection;
  body(request: Request, input: HypiHubInputs): Promise<object>;
  mime(request: Request): string;
  quoteUsage?(request: Request, inputs: QuoteInputs): { readonly videos?: readonly string[]; readonly duration?: number };
};
const complete = (status: unknown) => status === "completed" || status === "succeeded";
const cancelled = (status: unknown) => status === "cancelled" || status === "canceled";

function jobPath(receipt: ProviderReceipt): string {
  return `/jobs/${encodeURIComponent(receipt.id)}`;
}

function expiry(client: HypiHubClient, receipt: ProviderReceipt) {
  const startedAt = record(receipt.resume, "job receipt").startedAt;
  if (typeof startedAt !== "number" || !Number.isSafeInteger(startedAt)) throw new Error("Invalid HypiHub job start time.");
  return Date.now() - startedAt >= client.operationTimeout
    ? failed(new Error("HypiHub job exceeded its deadline. Check its receipt for the remote outcome."), "hypihub-job-timeout")
    : undefined;
}

export function bindHypiHubJob<Request extends JsonValue>(id: string, client: HypiHubClient, route: JobRoute<Request>) {
  return bindProviderEndpoint<Request>({
    kind: "job", id, capability: route.capability,
    quote: (request, inputs, signal) => quoteHypiHub(client, route.select(request), inputs, signal, route.quoteUsage?.(request, inputs)),
    async submit(context) {
      const selection = route.select(context.request);
      let body: object;
      try {
        await verifyOffering(client, selection, context.signal);
        body = await route.body(context.request, client.inputs(context));
      } catch (error) {
        context.signal.throwIfAborted();
        return failed(error, "hypihub-prepare-failed");
      }
      let job;
      try {
        job = await client.json(operationPath(selection.operation), context.signal,
          client.post({ model: selection.model, ...body }, context.invocation));
      } catch (error) {
        if (rejectedSubmission(error)) return failed(error, "hypihub-submission-rejected");
        throw error;
      }
      const task = job.id ?? job.job_id;
      if (typeof task !== "string" || task.trim() === "") throw new Error("HypiHub submission has no job receipt.");
      const receipt = { id: task, resume: { startedAt: Date.now() } };
      const rejected = hypiHubJobFailure(job, receipt.id);
      if (rejected !== undefined) return { ...failed(rejected, "hypihub-job-failed"), receipt };
      return complete(job.status) ? { status: "ready", receipt } : { ...client.pending(undefined, "submitted"), receipt };
    },
    async poll({ receipt, signal }) {
      const expired = expiry(client, receipt);
      if (expired !== undefined) return expired;
      try {
        const job = await client.json(jobPath(receipt), signal);
        if (complete(job.status)) return { status: "ready" };
        if (cancelled(job.status)) return { status: "cancelled" };
        if (job.status === "queued" || job.status === "running" || job.status === "in_progress") {
          return client.pending(undefined, job.status);
        }
        return failed(hypiHubJobFailure(job, receipt.id) ?? new HypiHubServiceError("hypihub-job-status",
          "HypiHub returned an unrecognized job status."), "hypihub-job-failed");
      } catch (error) {
        signal.throwIfAborted();
        const authorization = client.credentialPending(error);
        if (authorization !== undefined) return authorization;
        if (transient(error)) return client.pending(error, "retrying job status");
        return failed(error, "hypihub-job-lookup-failed");
      }
    },
    async collect({ receipt, request, signal, writeResource }) {
      const expired = expiry(client, receipt);
      if (expired !== undefined) return expired;
      const names: string[] = [];
      try {
        const assets = await client.json(`${jobPath(receipt)}/assets`, signal);
        if (!Array.isArray(assets.items) || assets.items.length === 0) return client.pending(undefined, "waiting for job assets");
        const files = assets.items.map((raw, index) => {
          const asset = record(raw, "job asset");
          return { asset, ordinal: typeof asset.ordinal === "number" ? asset.ordinal : index };
        }).filter(({ asset }) => asset.kind === undefined || asset.kind === route.output)
          .sort((first, second) => first.ordinal - second.ordinal);
        if (files.length === 0) throw new Error(`HypiHub job ${receipt.id} has no ${route.output} assets.`);
        for (const [index, { asset }] of files.entries()) {
          const name = `${route.output}-${index + 1}`;
          const fallback = typeof asset.mime_type === "string" && asset.mime_type.startsWith(`${route.output}/`)
            ? asset.mime_type : route.mime(request);
          const bytes = await client.download(asset.url, signal, fallback);
          const size = typeof asset.bytes === "number" && Number.isSafeInteger(asset.bytes) && asset.bytes > 0
            ? asset.bytes : undefined;
          await writeResource(route.output, name, size === undefined ? bytes : { ...bytes, size });
          names.push(name);
        }
      } catch (error) {
        signal.throwIfAborted();
        const authorization = client.credentialPending(error);
        if (authorization !== undefined) return authorization;
        if (transient(error) || error instanceof HypiHubHttpError
          && ([401, 403, 404].includes(error.status) || error.code === "job_asset_not_ready")) {
          return client.pending(error, "retrying job assets");
        }
        if (error instanceof HypiHubHttpError) return failed(error, "hypihub-asset-download-failed");
        throw error;
      }
      return { status: "complete", values: { [route.output]: { [`${route.output}s`]: names } } };
    },
  });
}
