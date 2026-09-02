import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import { hypitHostPackageRoot, inspectHostPackage, prepareHostPackages } from "@hypit/runtime-host-node";

import type { ParsedArgs } from "../arguments.js";
import type { CliDistribution } from "../distribution.js";
import { acquireOAuthCredential } from "../oauth.js";
import { writeCliOutput } from "../output.js";
import type { CliIo } from "../output.js";
import { hypitHostStateRoot, hypitProjectStateRoot } from "../paths.js";
import type { CliRuntimeController } from "../runtime-port.js";
import { queueLaneLines, summarizeQueueLanes } from "../runtime-view.js";
import type { OperationalWriter } from "./types.js";

export async function runEnvironmentCommand(input: {
  readonly args: ParsedArgs;
  readonly io: CliIo;
  readonly distribution: CliDistribution;
  readonly projectRoot: string;
  readonly packageRootForProject: () => Promise<string>;
  readonly runtimeHost: (profile: string, packageRoot?: string) => Promise<NodeRuntimeHost>;
  readonly runtimeController: (profile: string) => Promise<CliRuntimeController>;
  readonly write: OperationalWriter;
}): Promise<boolean> {
  const {
    args, io, distribution, projectRoot, packageRootForProject, runtimeHost, runtimeController, write,
  } = input;
  const reportProgramProgress = args.json || args.jsonl
    ? undefined
    : (event: { readonly id: string; readonly phase: "checking" | "installing" | "starting" | "waiting" | "ready" }): void => {
      const verb = {
        checking: "Checking",
        installing: "Installing",
        starting: "Starting",
        waiting: "Waiting for",
        ready: "Ready",
      }[event.phase];
      io.write(`  · ${verb} ${event.id}\n`);
    };
  const reportPackageProgress = args.json || args.jsonl
    ? undefined
    : (event: { readonly specifier: string; readonly phase: "checking" | "installing" | "ready" }): void => {
      if (event.phase === "installing") io.write(`  · Installing ${event.specifier}\n`);
    };

  if (args.command === "paths") {
    const runtimePaths = args.runtime === undefined
      ? undefined
      : await (await runtimeHost(args.runtime)).resolvePaths();
    const machine = {
      format: "hypit.cli-paths@1" as const,
      project: projectRoot,
      projectState: hypitProjectStateRoot(projectRoot),
      ...(args.runtime === undefined ? {} : { profile: args.runtime }),
      ...(runtimePaths === undefined ? {} : { runtimeData: runtimePaths.runtimeDataRoot }),
      hostState: hypitHostStateRoot(),
      machinePackages: hypitHostPackageRoot(),
      ...(distribution.packageRoot === undefined ? {} : { distribution: distribution.packageRoot }),
    };
    write(machine, "Hypit paths", "info", [
      ["Project", machine.project],
      ["Project state", machine.projectState],
      ["Runtime Profile", machine.profile ?? "not selected"],
      ["Runtime data", machine.runtimeData ?? "not selected"],
      ["Host state", machine.hostState],
      ["Machine packages", machine.machinePackages],
      ["Distribution", machine.distribution ?? "embedded"],
    ]);
    return true;
  }

  if (args.command === "packages") {
    if (args.action !== "install" && args.action !== "status") {
      throw new Error("packages takes install or status");
    }
    if (args.file === undefined) throw new Error(`packages ${args.action} requires package@exact-version`);
    const root = hypitHostPackageRoot();
    const existing = await inspectHostPackage(args.file, root);
    const reports = args.action === "install"
      ? await prepareHostPackages([args.file], {
        root,
        ...(reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress }),
      })
      : existing === undefined ? [] : [existing];
    const ready = reports.length === 1;
    write({
      format: "hypit.cli-package@2",
      action: args.action,
      package: args.file,
      ready,
    }, args.action === "install" ? "Machine package is ready" : "Machine package status",
    ready ? "success" : "warning", [
      ["Package", args.file],
      ["Ready", String(ready)],
    ]);
    if (!ready) io.setExitCode?.(1);
    return true;
  }

  if (args.command === "doctor") {
    if (args.packageRoot !== undefined) {
      throw new Error("doctor reads all deployment selection from the Runtime Profile itself");
    }
    const profileInput = args.runtime ?? args.file;
    const profile = profileInput === undefined ? undefined : resolve(profileInput);
    const [runtimeResult, projectResult] = await Promise.all([
      profile === undefined ? undefined : (await runtimeHost(profile)).doctor(),
      distribution.diagnoseProjectResults(projectRoot, {
        packageRoot: await packageRootForProject(),
        ...(distribution.packageRoot === undefined
          ? {}
          : { distributionPackageRoot: distribution.packageRoot }),
      }),
    ]);
    const diagnostics = [...(runtimeResult?.diagnostics ?? []), ...projectResult.diagnostics];
    const machine = {
      format: "hypit.cli-doctor@3" as const,
      ok: !diagnostics.some((item) => item.severity === "error"),
      project: projectRoot,
      ...(profile === undefined ? {} : { profile }),
      diagnosticCount: diagnostics.length,
      diagnostics: diagnostics.slice(0, args.limit),
      ...(diagnostics.length <= args.limit ? {} : { omittedDiagnostics: diagnostics.length - args.limit }),
    };
    writeCliOutput(io, {
      json: args.json || args.jsonl,
      jsonl: args.jsonl,
      color: args.color,
      verbose: args.verbose,
    }, { kind: "doctor", machine });
    if (!machine.ok) io.setExitCode?.(1);
    return true;
  }

  if (args.command === "programs") {
    if (args.file !== undefined && args.runtime !== undefined) {
      throw new Error("programs reads all deployment selection from the Runtime Profile itself; provide that Profile only once");
    }
    if (args.packageRoot !== undefined) {
      throw new Error("programs reads all deployment selection from the Runtime Profile itself");
    }
    if (args.action !== "up" && args.action !== "down" && args.action !== "status") {
      throw new Error("programs takes up, down or status");
    }
    if (args.action !== "up" && args.maxWaitMs !== undefined) {
      throw new Error("--max-wait-ms applies to programs up");
    }
    const profileInput = args.runtime ?? args.file;
    if (profileInput === undefined) throw new Error("programs requires a Runtime Profile");
    const profile = resolve(profileInput);
    const host = await runtimeHost(profile);
    if (args.action === "up") {
      await host.prepare(reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress });
    }
    const controller = await runtimeController(profile);
    const result = args.action === "up"
      ? await controller.programs.up({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        ...(reportProgramProgress === undefined ? {} : { onProgress: reportProgramProgress }),
      })
      : args.action === "down"
        ? await controller.programs.down()
        : await controller.programs.report();
    const ready = result.programs.every((item) => item.state.state === "ready");
    const desiredState = args.action === "down" ? !result.programs.some((item) => item.state.state === "ready") : ready;
    const lifecycleOk = args.action === "status" || desiredState;
    const shownPrograms = result.programs.filter((item) => item.state.state !== "ready").slice(0, args.limit);
    write({
      format: "hypit.cli-programs@2",
      action: args.action,
      ready,
      programs: result.programs.slice(0, args.limit).map((item) => ({
        id: item.id,
        state: item.state.state,
        ...(args.verbose && item.action !== undefined ? { action: item.action } : {}),
      })),
      ...(result.programs.length <= args.limit ? {} : { omittedPrograms: result.programs.length - args.limit }),
    }, `External programs ${args.action}`,
    args.action === "status" ? ready ? "success" : "info" : lifecycleOk ? "success" : "warning", [
      ["Programs", String(result.programs.length)],
      ["Ready", String(result.programs.filter((item) => item.state.state === "ready").length)],
    ], shownPrograms.map((item) => `${item.id}: ${item.state.state}`));
    if (!lifecycleOk) io.setExitCode?.(1);
    return true;
  }

  if (args.command === "runtime") {
    if (args.action !== "up" && args.action !== "down" && args.action !== "status" && args.action !== "logs") {
      throw new Error("runtime takes up, down, status or logs");
    }
    if (args.file !== undefined && args.runtime !== undefined) {
      throw new Error("runtime accepts the Runtime Profile either positionally or with --runtime, not both");
    }
    const profileInput = args.runtime ?? args.file;
    if (profileInput === undefined) throw new Error("runtime requires a Runtime Profile");
    const profile = resolve(profileInput);
    const controller = await runtimeController(profile);
    if (args.action === "up") {
      const packageRoot = await packageRootForProject();
      const host = await runtimeHost(profile, packageRoot);
      const prepared = await host.prepare(
        reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress },
      );
      const validated = await host.createRuntime();
      await validated.close();
      const external = await controller.programs.up({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        ...(reportProgramProgress === undefined ? {} : { onProgress: reportProgramProgress }),
      });
      const processState = await controller.worker.up({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      });
      const ok = processState.state === "running"
        && external.programs.every((item) => item.state.state === "ready");
      write({
        format: "hypit.cli-runtime-up@2",
        ready: ok,
        worker: processState.state,
        preparedPackages: prepared.length,
        programs: {
          total: external.programs.length,
          ready: external.programs.filter((item) => item.state.state === "ready").length,
        },
      }, "Runtime is up", ok ? "success" : "warning", [
        ["Machine packages", String(prepared.length)],
        ["Worker", processState.state],
        ["External programs", String(external.programs.length)],
      ]);
      if (!ok) io.setExitCode?.(1);
      return true;
    }
    if (args.action === "logs") {
      const logs = await controller.worker.logs();
      const lines = logs.text.length === 0 ? [] : logs.text.replace(/\n$/u, "").split("\n");
      const shown = lines.slice(-args.lines);
      write({
        format: "hypit.cli-runtime-logs@2",
        lines: shown,
        totalLines: lines.length,
        omittedLines: Math.max(0, lines.length - shown.length),
        ...(args.verbose ? { path: logs.path } : {}),
      }, "Runtime logs", "info", [
        ["Lines", `${shown.length}/${lines.length}`],
        ...(args.verbose ? [["Path", logs.path] as const] : []),
      ], shown.length === 0 ? ["No log output."] : shown);
      return true;
    }
    if (args.action === "down") {
      const worker = await controller.worker.down({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      });
      write({ format: "hypit.cli-runtime-down@2", worker: worker.state },
        "Runtime Worker is down", "success", [["Worker", worker.state]],
        ["External programs were left running. Stop them explicitly with hypit programs down."]);
      return true;
    }

    const runtimeLoading = (await runtimeHost(profile)).openControl({ readOnly: true });
    let runtime: Awaited<typeof runtimeLoading> | undefined;
    try {
      const [worker, external, selectedRuntime] = await Promise.all([
        controller.worker.status(),
        controller.programs.report(),
        runtimeLoading,
      ]);
      runtime = selectedRuntime;
      const activity = await runtime.activity();
      const counts = Object.fromEntries([
        ["starting", activity.builds.filter((item) => item.activity === "submitting" || item.activity === "ready").length],
        ["active", activity.builds.filter((item) => item.activity === "running").length],
        ["waiting", activity.builds.filter((item) => item.activity === "waiting").length],
        ["decided", activity.builds.filter((item) => item.activity === "saving-result").length],
      ]);
      const lanes = summarizeQueueLanes(activity.capacity);
      const ready = worker.state === "running"
        && external.programs.every((item) => item.state.state === "ready");
      const active = activity.builds.length;
      const attention = activity.builds.some((item) => item.issue !== undefined) || (active > 0 && !ready);
      const unavailable = external.programs.filter((item) => item.state.state !== "ready");
      const machine = {
        format: "hypit.cli-runtime-status@2" as const,
        ready,
        attention,
        worker: {
          state: worker.state,
          ...(worker.configuration === undefined ? {} : { configuration: worker.configuration }),
        },
        builds: counts,
        programs: {
          total: external.programs.length,
          ready: external.programs.length - unavailable.length,
          unavailable: unavailable.slice(0, args.limit).map((item) => ({ id: item.id, state: item.state.state })),
        },
        capacity: {
          active: activity.capacity.length,
          ...(args.verbose ? { lanes: lanes.slice(0, args.limit) } : {}),
        },
      };
      write(machine, "Runtime status", attention ? "warning" : ready ? "success" : "info", [
        ["Worker", worker.state],
        ["Starting", String(counts.starting ?? 0)],
        ["Active", String(counts.active ?? 0)],
        ["Waiting", String(counts.waiting ?? 0)],
        ["Decided", String(counts.decided ?? 0)],
        ["Programs", `${external.programs.length - unavailable.length}/${external.programs.length} ready`],
        ...(args.verbose ? [["Active requests", String(activity.capacity.length)] as const] : []),
      ], [
        ...unavailable.slice(0, args.limit).map((item) => `${item.id}: ${item.state.state}`),
        ...(args.verbose ? queueLaneLines(lanes.slice(0, args.limit)) : []),
      ]);
    } finally {
      if (runtime !== undefined) await runtime.close();
      else await runtimeLoading.then(async (loaded) => await loaded.close(), () => undefined);
    }
    return true;
  }

  if (args.command === "auth") {
    if (args.action !== "status" && args.action !== "login" && args.action !== "logout") {
      throw new Error("auth takes status, login or logout");
    }
    if (args.runtime === undefined) {
      throw new Error("auth requires a Runtime; run hypit runtime use <profile> or pass --runtime <profile>");
    }
    if (args.from !== undefined && args.action !== "login") throw new Error("--from applies only to auth login");
    const credentialsControl = await (await runtimeHost(args.runtime)).openCredentials(args.file!);
    try {
      let credentials = await credentialsControl.credentials(args.file!);
      if (args.slot !== undefined) credentials = credentials.filter((item) => item.slot === args.slot);
      if (credentials.length === 0) throw new Error(`Endpoint ${args.file} has no matching credential`);
      if (args.slot === undefined && credentials.length > 1 && args.action !== "status") {
        throw new Error(`Endpoint ${args.file} has several credentials; select one with --slot`);
      }
      if (args.action === "status") {
        const view = credentials.slice(0, args.limit).map((item) => ({
          endpoint: item.endpoint,
          slot: item.slot,
          label: item.label,
          kind: item.kind,
          configured: item.configured,
          writable: item.writable,
        }));
        write({
          format: "hypit.cli-auth-status@2",
          endpoint: args.file!,
          credentials: view,
          ...(credentials.length <= args.limit ? {} : { omittedCredentials: credentials.length - args.limit }),
        }, "Credential status", "info", [
          ["Endpoint", args.file!],
          ["Configured", `${credentials.filter((item) => item.configured).length}/${credentials.length}`],
        ], credentials.slice(0, args.limit).map((item) =>
          `${item.slot}: ${item.configured ? "configured" : "missing"} · ${item.writable ? "writable" : "read-only"}`));
      } else if (args.action === "login") {
        const [item] = credentials;
        if (item === undefined) throw new Error(`Endpoint ${args.file} has no matching credential`);
        if (!item.writable) {
          const source = item.ref.store === "env"
            ? `set ${item.ref.key} in the environment`
            : "select a writable credential source in the Runtime Profile";
          throw new Error(`${item.label} cannot be written by this command; ${source}`);
        }
        const raw = item.acquisition !== undefined && args.from === undefined
          ? await acquireOAuthCredential(io, item.acquisition)
          : args.from === undefined
            ? await io.readSecret?.(`${item.label}: `)
            : await readFile(args.from, "utf8");
        if (raw === undefined) throw new Error("interactive credential input is unavailable; use --from <file>");
        const secret = raw.trim();
        if (secret.length === 0) throw new Error("credential input is empty");
        if (item.kind === "json") {
          try { JSON.parse(secret); } catch { throw new Error(`${item.label} is not valid JSON`); }
        }
        const stored = await credentialsControl.putCredential(item.endpoint, item.slot, secret);
        write({
          format: "hypit.cli-auth-change@2",
          endpoint: args.file!,
          slot: stored.slot,
          configured: true,
        }, "Credential stored", "success", [["Endpoint", args.file!], ["Slot", stored.slot]]);
      } else {
        const [item] = credentials;
        if (item === undefined) throw new Error(`Endpoint ${args.file} has no matching credential`);
        const removed = await credentialsControl.deleteCredential(item.endpoint, item.slot);
        write({
          format: "hypit.cli-auth-change@2",
          endpoint: args.file!,
          slot: removed.credential.slot,
          configured: false,
          changed: removed.deleted,
        }, removed.deleted ? "Credential removed" : "Credential was absent",
        removed.deleted ? "success" : "warning", [
          ["Endpoint", args.file!], ["Slot", removed.credential.slot],
        ]);
      }
    } finally {
      await credentialsControl.close();
    }
    return true;
  }

  return false;
}
