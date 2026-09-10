import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import { hypitHostPackageRoot, inspectHostPackage, prepareHostPackages } from "@hypit/runtime-host-node";

import type { CliCommand, EnvironmentCommand } from "../command.js";
import type { CliDistribution } from "../distribution.js";
import { acquireOAuthCredential } from "../oauth.js";
import { writeCliOutput } from "../output.js";
import type { CliIo } from "../output.js";
import { hypitHostStateRoot, hypitProjectStateRoot } from "../paths.js";
import type { CliManagedProgramReport, CliRuntimeController } from "../runtime-port.js";
import type { OperationalWriter } from "./types.js";

function programRecord(item: CliManagedProgramReport) {
  return {
    ...item,
    state: item.state.state,
    ...(item.state.state === "ready" ? {} : { stateDetail: item.state.detail }),
  };
}

function programDescription(item: CliManagedProgramReport): string {
  const details = [...new Set([
    ...(item.state.state === "ready" ? [] : [item.state.detail]),
    ...(item.detail === undefined ? [] : [item.detail]),
  ])];
  return `${item.id}: ${item.state.state}${details.length === 0 ? "" : ` — ${details.join("; ")}`}`
    + (item.pid === undefined ? "" : ` · PID ${item.pid}`)
    + (item.logPath === undefined ? "" : ` · log ${item.logPath}`);
}

export function isEnvironmentCommand(args: CliCommand): args is EnvironmentCommand {
  return args.command === "paths" || args.command === "packages" || args.command === "doctor"
    || args.command === "programs" || args.command === "auth"
    || (args.command === "runtime"
      && (args.action === "up" || args.action === "down" || args.action === "status" || args.action === "logs"));
}

export async function runEnvironmentCommand(input: {
  readonly args: EnvironmentCommand;
  readonly runtimeProfile: string | undefined;
  readonly io: CliIo;
  readonly distribution: CliDistribution;
  readonly projectRoot: string;
  readonly packageRootForProject: () => Promise<string>;
  readonly runtimeHost: (profile: string, packageRoot?: string) => Promise<NodeRuntimeHost>;
  readonly runtimeController: (profile: string) => Promise<CliRuntimeController>;
  readonly write: OperationalWriter;
}): Promise<void> {
  const {
    args, runtimeProfile, io, distribution, projectRoot, packageRootForProject, runtimeHost, runtimeController, write,
  } = input;
  const reportProgramProgress = args.presentation.json
    ? undefined
    : (event: { readonly id: string; readonly phase: "checking" | "installing" | "starting" | "waiting" | "ready"; readonly logPath?: string }): void => {
      if (!args.presentation.verbose && event.phase !== "installing" && event.phase !== "starting") return;
      const verb = {
        checking: "Checking",
        installing: "Installing",
        starting: "Starting",
        waiting: "Waiting for",
        ready: "Ready",
      }[event.phase];
      io.write(`  · ${verb} ${event.id}${event.logPath === undefined ? "" : ` · log ${event.logPath}`}\n`);
    };
  const reportPackageProgress = args.presentation.json
    ? undefined
    : (event: { readonly specifier: string; readonly phase: "checking" | "installing" | "ready" }): void => {
      if (event.phase === "installing") io.write(`  · Installing ${event.specifier}\n`);
    };
  const reportCredentialProgress = args.presentation.json
    ? io.writeProgress
    : io.writeProgress ?? io.write;

  if (args.command === "paths") {
    const runtimePaths = runtimeProfile === undefined
      ? undefined
      : await (await runtimeHost(runtimeProfile)).resolvePaths();
    const machine = {
      format: "hypit.cli-paths@1" as const,
      project: projectRoot,
      projectState: hypitProjectStateRoot(projectRoot),
      ...(runtimeProfile === undefined ? {} : { profile: runtimeProfile }),
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
    return;
  }

  if (args.command === "packages") {
    const root = hypitHostPackageRoot();
    const existing = await inspectHostPackage(args.package, root);
    const reports = args.action === "install"
      ? await prepareHostPackages([args.package], {
        root,
        ...(reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress }),
      })
      : existing === undefined ? [] : [existing];
    const ready = reports.length === 1;
    write({
      format: "hypit.cli-package@1",
      action: args.action,
      package: args.package,
      ready,
    }, args.action === "install" ? "Machine package is ready" : "Machine package status",
    ready ? "success" : "warning", [
      ["Package", args.package],
      ["Ready", String(ready)],
    ]);
    if (!ready) io.setExitCode?.(1);
    return;
  }

  if (args.command === "doctor") {
    const profile = runtimeProfile === undefined ? undefined : resolve(runtimeProfile);
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
      format: "hypit.cli-doctor@1" as const,
      ok: !diagnostics.some((item) => item.severity === "error"),
      project: projectRoot,
      ...(profile === undefined ? {} : { profile }),
      diagnosticCount: diagnostics.length,
      diagnostics: diagnostics.slice(0, args.limit),
      ...(diagnostics.length <= args.limit ? {} : { omittedDiagnostics: diagnostics.length - args.limit }),
    };
    writeCliOutput(io, args.presentation, { kind: "doctor", machine });
    if (!machine.ok) io.setExitCode?.(1);
    return;
  }

  if (args.command === "programs") {
    if (runtimeProfile === undefined) throw new Error("programs requires a Runtime Profile");
    const profile = resolve(runtimeProfile);
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
    const shownPrograms = result.programs.filter((item) => args.presentation.verbose || item.state.state !== "ready").slice(0, args.limit);
    const title = args.action === "up"
      ? desiredState ? "External programs ready" : "External programs need attention"
      : args.action === "down"
        ? desiredState ? "External programs stopped" : "Some external programs are still running"
        : "External program status";
    write({
      format: "hypit.cli-programs@1",
      action: args.action,
      ready,
      programs: result.programs.slice(0, args.limit).map(programRecord),
      ...(result.programs.length <= args.limit ? {} : { omittedPrograms: result.programs.length - args.limit }),
    }, title,
    args.action === "status" ? ready ? "success" : "info" : lifecycleOk ? "success" : "warning", [
      ...(!args.presentation.verbose && lifecycleOk && args.action !== "status" ? [] : [
        ["Programs", String(result.programs.length)] as const,
        ["Ready", String(result.programs.filter((item) => item.state.state === "ready").length)] as const,
      ]),
    ], shownPrograms.map(programDescription));
    if (!lifecycleOk) io.setExitCode?.(1);
    return;
  }

  if (args.command === "runtime") {
    if (runtimeProfile === undefined) throw new Error("runtime requires a Runtime Profile");
    const profile = resolve(runtimeProfile);
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
        format: "hypit.cli-runtime-up@1",
        ready: ok,
        worker: processState.state,
        preparedPackages: prepared.length,
        programs: {
          total: external.programs.length,
          ready: external.programs.filter((item) => item.state.state === "ready").length,
          items: external.programs.map(programRecord),
        },
      }, ok ? "Local Runtime ready" : "Local Runtime needs attention", ok ? "success" : "warning", [
        ...(!args.presentation.verbose && ok ? [] : [
          ["Machine packages", String(prepared.length)] as const,
          ["Worker", processState.state] as const,
          ["Managed programs", `${external.programs.filter((item) => item.state.state === "ready").length}/${external.programs.length} ready`] as const,
        ]),
      ], external.programs.filter((item) => args.presentation.verbose || item.state.state !== "ready")
        .map(programDescription));
      if (!ok) io.setExitCode?.(1);
      return;
    }
    if (args.action === "logs") {
      const logs = await controller.worker.logs();
      const lines = logs.text.length === 0 ? [] : logs.text.replace(/\n$/u, "").split("\n");
      const shown = lines.slice(-args.lines);
      write({
        format: "hypit.cli-runtime-logs@1",
        lines: shown,
        totalLines: lines.length,
        omittedLines: Math.max(0, lines.length - shown.length),
        ...(args.presentation.verbose ? { path: logs.path } : {}),
      }, "Runtime logs", "info", [
        ["Lines", `${shown.length}/${lines.length}`],
        ...(args.presentation.verbose ? [["Path", logs.path] as const] : []),
      ], shown.length === 0 ? ["No log output."] : shown);
      return;
    }
    if (args.action === "down") {
      const worker = await controller.worker.down({
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
      });
      write({ format: "hypit.cli-runtime-down@1", worker: worker.state },
        "Runtime Worker is down", "success", [["Worker", worker.state]],
        ["Managed programs were left running. Stop them explicitly with hypit programs down."]);
      return;
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
        ["submitting", activity.builds.filter((item) => item.activity === "submitting").length],
        ["working", activity.builds.filter((item) =>
          item.activity === "ready" || item.activity === "running" || item.activity === "waiting").length],
        ["savingResult", activity.builds.filter((item) => item.activity === "saving-result").length],
      ]);
      const ready = worker.state === "running"
        && external.programs.every((item) => item.state.state === "ready");
      const active = activity.builds.length;
      const attention = activity.builds.some((item) => item.issue !== undefined) || (active > 0 && !ready);
      const unavailable = external.programs.filter((item) => item.state.state !== "ready");
      const machine = {
        format: "hypit.cli-runtime-status@1" as const,
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
        },
      };
      write(machine, attention
        ? "Local Runtime needs attention"
        : ready ? "Local Runtime ready" : "Runtime Worker stopped",
      attention ? "warning" : ready ? "success" : "info", [
        ["Worker", worker.state],
        ["Active Builds", String(activity.builds.length)],
        ["Programs", `${external.programs.length - unavailable.length}/${external.programs.length} ready`],
        ...(args.presentation.verbose ? [
          ["Submitting", String(counts.submitting ?? 0)] as const,
          ["Working", String(counts.working ?? 0)] as const,
          ["Saving Result", String(counts.savingResult ?? 0)] as const,
          ["Capacity in use", String(activity.capacity.length)] as const,
        ] : []),
      ], [
        ...unavailable.slice(0, args.limit).map((item) => `${item.id}: ${item.state.state}`),
      ]);
    } finally {
      if (runtime !== undefined) await runtime.close();
      else await runtimeLoading.then(async (loaded) => await loaded.close(), () => undefined);
    }
    return;
  }

  if (args.command === "auth") {
    if (runtimeProfile === undefined) {
      throw new Error("auth requires a Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>");
    }
    const credentialsControl = await (await runtimeHost(runtimeProfile)).openCredentials(args.endpoint);
    try {
      let credentials = await credentialsControl.credentials(args.endpoint);
      if (args.slot !== undefined) credentials = credentials.filter((item) => item.slot === args.slot);
      if (credentials.length === 0) throw new Error(`Endpoint ${args.endpoint} has no matching credential`);
      if (args.slot === undefined && credentials.length > 1 && args.action !== "status") {
        throw new Error(`Endpoint ${args.endpoint} has several credentials; select one with --slot`);
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
          format: "hypit.cli-auth-status@1",
          endpoint: args.endpoint,
          credentials: view,
          ...(credentials.length <= args.limit ? {} : { omittedCredentials: credentials.length - args.limit }),
        }, "Credential status", "info", [
          ["Endpoint", args.endpoint],
          ["Configured", `${credentials.filter((item) => item.configured).length}/${credentials.length}`],
        ], credentials.slice(0, args.limit).map((item) =>
          `${item.slot}: ${item.configured ? "configured" : "missing"} · ${item.writable ? "writable" : "read-only"}`));
      } else if (args.action === "login") {
        const [item] = credentials;
        if (item === undefined) throw new Error(`Endpoint ${args.endpoint} has no matching credential`);
        if (!item.writable) {
          const source = item.ref.store === "env"
            ? `set ${item.ref.key} in the environment`
            : "select a writable credential source in the Runtime Profile";
          throw new Error(`${item.label} cannot be written by this command; ${source}`);
        }
        const raw = item.acquisition !== undefined && args.credentialFile === undefined
          ? await acquireOAuthCredential(item.acquisition, {
            ...(reportCredentialProgress === undefined ? {} : {
              onProgress: (message) => reportCredentialProgress(`  · ${message}\n`),
            }),
          })
          : args.credentialFile === undefined
            ? await io.readSecret?.(`${item.label}: `)
            : await readFile(args.credentialFile, "utf8");
        if (raw === undefined) throw new Error("interactive credential input is unavailable; use --from <file>");
        const secret = raw.trim();
        if (secret.length === 0) throw new Error("credential input is empty");
        if (item.kind === "json") {
          try { JSON.parse(secret); } catch { throw new Error(`${item.label} is not valid JSON`); }
        }
        const stored = await credentialsControl.putCredential(item.endpoint, item.slot, secret);
        write({
          format: "hypit.cli-auth-change@1",
          endpoint: args.endpoint,
          slot: stored.slot,
          configured: true,
        }, "Credential stored", "success", [["Endpoint", args.endpoint], ["Slot", stored.slot]]);
      } else {
        const [item] = credentials;
        if (item === undefined) throw new Error(`Endpoint ${args.endpoint} has no matching credential`);
        const removed = await credentialsControl.deleteCredential(item.endpoint, item.slot);
        write({
          format: "hypit.cli-auth-change@1",
          endpoint: args.endpoint,
          slot: removed.credential.slot,
          configured: false,
          changed: removed.deleted,
        }, removed.deleted ? "Credential removed" : "Credential was absent",
        removed.deleted ? "success" : "warning", [
          ["Endpoint", args.endpoint], ["Slot", removed.credential.slot],
        ]);
      }
    } finally {
      await credentialsControl.close();
    }
    return;
  }
}
