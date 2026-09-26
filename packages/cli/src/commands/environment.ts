import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { distributionPackageDeclaring, locateNodePackage } from "@hypit/package-loader-node";
import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import { hypitHostPackageRoot, inspectHostPackage, parseRegistryPackageSpec, prepareHostPackages } from "@hypit/runtime-host-node";

import type { CliCommand, EnvironmentCommand } from "../command.js";
import { commandHint } from "../command-hint.js";
import type { CliDistribution } from "../distribution.js";
import { acquireOAuthCredential } from "../oauth.js";
import { writeCliOutput } from "../output.js";
import type { CliIo } from "../output.js";
import { hypitHostStateRoot, hypitProjectStateRoot } from "../paths.js";
import type { CliManagedProgramProgress, CliManagedProgramReport, CliRuntimeController } from "../runtime-port.js";
import type { OperationalWriter } from "./types.js";

type PackageStatus = {
  readonly ready: boolean;
  readonly declaredBy?: string;
  readonly installation?: string;
  readonly installedVersion?: string;
  readonly detail?: string;
};

/**
 * Whether `specifier` will resolve when a Build needs it.
 *
 * The loader finds an external package in two places — the node_modules chain above whoever
 * requires it, and the machine home addressed by the version that requirer declares — and both
 * start from the requiring package. So the requirer is located first and the loader asked once,
 * rather than reimplementing either half here: a second opinion is exactly how this command came
 * to disagree with the thing it reports on.
 *
 * Without a Distribution on disk there is no requirer to find, and the machine home remains the
 * only place this command can speak about.
 */
async function packageStatus(
  specifier: string,
  hostRoot: string,
  distributionRoot: string | undefined,
): Promise<PackageStatus> {
  const required = parseRegistryPackageSpec(specifier);
  if (distributionRoot === undefined) {
    const existing = await inspectHostPackage(specifier, hostRoot);
    return existing === undefined
      ? { ready: false, detail: "not installed in the machine package home" }
      : { ready: true, installation: existing.root, installedVersion: required.version };
  }
  const declaring = distributionPackageDeclaring(distributionRoot, required.name, required.version);
  if (declaring === undefined) {
    return { ready: false, detail: `no Distribution package declares ${specifier}` };
  }
  try {
    const located = locateNodePackage(required.name, {
      from: join(declaring, "__hypit_package_status__.mjs"),
      distributionRoots: [distributionRoot],
      externalRoots: [hostRoot],
      allowExternal: true,
    });
    const installed = located.manifest.version;
    return installed === required.version
      ? { ready: true, declaredBy: declaring, installation: located.root, installedVersion: installed }
      : {
        ready: false,
        declaredBy: declaring,
        installation: located.root,
        ...(installed === undefined ? {} : { installedVersion: installed }),
        detail: `resolved version is ${installed ?? "unknown"}`,
      };
  } catch (error) {
    return {
      ready: false,
      declaredBy: declaring,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

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
    + (item.endpoint === item.id ? "" : ` · endpoint ${item.endpoint}`)
    + (item.pid === undefined ? "" : ` · PID ${item.pid}`)
    + (item.logPath === undefined ? "" : ` · log ${item.logPath}`)
    + (item.installationLogPath === undefined || item.installationLogPath === item.logPath
      ? "" : ` · installation log ${item.installationLogPath}`)
    + (item.errorLogPath === undefined ? "" : ` · stderr ${item.errorLogPath}`);
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
  readonly runtimeSelectionFile: string | undefined;
  readonly io: CliIo;
  readonly distribution: CliDistribution;
  readonly projectRoot: string;
  readonly packageRootForProject: () => Promise<string>;
  readonly runtimeHost: (profile: string, packageRoot?: string) => Promise<NodeRuntimeHost>;
  readonly runtimeController: (profile: string) => Promise<CliRuntimeController>;
  readonly write: OperationalWriter;
}): Promise<void> {
  const {
    args, runtimeProfile, runtimeSelectionFile, io, distribution, projectRoot, packageRootForProject, runtimeHost, runtimeController, write,
  } = input;
  const profileSource: "none" | "argument" | "project" = runtimeProfile === undefined
    ? "none" : runtimeSelectionFile === undefined ? "argument" : "project";
  const selectionDescription = profileSource === "argument"
    ? "command argument (this invocation only)"
    : runtimeSelectionFile ?? "none";
  const progressWriter = args.presentation.json ? io.writeProgress : io.writeProgress ?? io.write;
  const reportProgramProgress = progressWriter === undefined
    ? undefined
    : (event: CliManagedProgramProgress): void => {
      if (!args.presentation.verbose && event.detail === undefined && event.phase !== "installing" && event.phase !== "starting") return;
      const verb = {
        checking: "Checking",
        installing: "Installing",
        starting: "Starting",
        waiting: "Waiting for",
        ready: "Ready",
      }[event.phase];
      progressWriter(`  · ${verb} ${event.id}${event.detail === undefined ? "" : ` — ${event.detail}`}${event.logPath === undefined ? "" : ` · log ${event.logPath}`}\n`);
    };
  const reportPackageProgress = progressWriter === undefined
    ? undefined
    : (event: { readonly specifier: string; readonly phase: "checking" | "installing" | "ready"; readonly logPath?: string }): void => {
      if (event.phase === "installing") progressWriter(`  · Installing ${event.specifier}${event.logPath === undefined ? "" : ` · log ${event.logPath}`}\n`);
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
      profileSource,
      selectionFile: resolve(projectRoot, ".hypit/runtime"),
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
      ["Runtime selection", selectionDescription],
      ["Runtime data", machine.runtimeData ?? "not selected"],
      ["Host state", machine.hostState],
      ["Machine packages", machine.machinePackages],
      ["Distribution", machine.distribution ?? "embedded"],
    ], runtimeProfile === undefined
      ? ["Select an existing Profile with hypit runtime use <profile> --workspace <project>, or create one with hypit runtime init."]
      : []);
    return;
  }

  if (args.command === "packages") {
    const root = hypitHostPackageRoot();
    if (args.action === "install") {
      const reports = await prepareHostPackages([args.package], {
        root,
        ...(reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress }),
      });
      const ready = reports.length === 1;
      write({
        format: "hypit.cli-package@1",
        action: args.action,
        package: args.package,
        ready,
        ...(reports[0] === undefined ? {} : { installation: reports[0].root }),
        ...(reports[0]?.logPath === undefined ? {} : { logPath: reports[0].logPath }),
      }, "Machine package is ready", ready ? "success" : "warning", [
        ["Package", args.package],
        ["Ready", String(ready)],
        ...(args.presentation.verbose && reports[0] !== undefined ? [["Installation", reports[0].root] as const] : []),
      ]);
      if (!ready) io.setExitCode?.(1);
      return;
    }

    // Status answers the question a Build asks: will the dependency resolve, at
    // the declared version? It therefore asks the loader rather than checking
    // one of the places the loader looks. Reading only the machine home called a
    // package that resolves perfectly well from the Distribution's own
    // node_modules "Ready false", and exited 1 saying so.
    const status = await packageStatus(args.package, root, distribution.packageRoot);
    write({
      format: "hypit.cli-package@1",
      action: args.action,
      package: args.package,
      ready: status.ready,
      ...(status.installation === undefined ? {} : { installation: status.installation }),
      ...(status.declaredBy === undefined ? {} : { declaredBy: status.declaredBy }),
      ...(status.installedVersion === undefined ? {} : { installedVersion: status.installedVersion }),
      ...(status.detail === undefined ? {} : { detail: status.detail }),
    }, "Machine package status", status.ready ? "success" : "warning", [
      ["Package", args.package],
      ["Ready", String(status.ready)],
      ...(status.declaredBy === undefined ? [] : [["Required by", status.declaredBy] as const]),
      ...(status.detail === undefined ? [] : [["Detail", status.detail] as const]),
      ...(status.installation === undefined ? [] : [["Installation", status.installation] as const]),
    ]);
    if (!status.ready) io.setExitCode?.(1);
    return;
  }

  if (args.command === "doctor") {
    const profile = runtimeProfile === undefined ? undefined : resolve(runtimeProfile);
    const [runtimeResult, projectResult] = await Promise.all([
      profile === undefined ? undefined : (await runtimeHost(profile)).doctor(args.endpoints === undefined ? {} : { endpoints: args.endpoints }),
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
      profileSource,
      ...(runtimeSelectionFile === undefined ? {} : { selectionFile: runtimeSelectionFile }),
      ...(profile === undefined ? {} : { profile }),
      diagnosticCount: diagnostics.length,
      diagnostics,
    };
    writeCliOutput(io, args.presentation, { kind: "doctor", machine });
    if (!machine.ok) io.setExitCode?.(1);
    return;
  }

  if (args.command === "programs") {
    if (runtimeProfile === undefined) {
      throw new Error("programs requires a Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>");
    }
    const profile = resolve(runtimeProfile);
    const host = await runtimeHost(profile);
    if (args.action === "up" || args.action === "prepare") {
      await host.prepare({ ...(args.endpoints === undefined ? {} : { endpoints: args.endpoints }), ...(reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress }) });
    }
    const controller = await runtimeController(profile);
    const result = args.action === "up"
      ? await controller.programs.up({
        ...(args.endpoints === undefined ? {} : { endpoints: args.endpoints }),
        ...(args.maxWaitMs === undefined ? {} : { maxWaitMs: args.maxWaitMs }),
        ...(reportProgramProgress === undefined ? {} : { onProgress: reportProgramProgress }),
      })
      : args.action === "prepare"
        ? await controller.programs.prepare({
          ...(args.endpoints === undefined ? {} : { endpoints: args.endpoints }),
          ...(reportProgramProgress === undefined ? {} : { onProgress: reportProgramProgress }),
        })
      : args.action === "down"
        ? await controller.programs.down(args.endpoints === undefined ? {} : { endpoints: args.endpoints })
        : await controller.programs.report(args.endpoints === undefined ? {} : { endpoints: args.endpoints });
    const ready = result.programs.every((item) => item.state.state === "ready");
    const needsAttention = (item: typeof result.programs[number]) => args.action === "down"
      ? item.action !== "nothing-to-stop"
        && (item.state.state !== "down" || item.action !== "stopped")
      : item.state.state !== "ready";
    // Readiness describes the service, not whether a stop was performed. An owned process can
    // still be loading, and another command may have declined a concurrent stop during preparation.
    const lifecycleOk = args.action === "status" || !result.programs.some(needsAttention);
    const stoppedAny = result.programs.some((item) => item.action === "stopped");
    const relevant = result.programs.filter((item) => args.presentation.verbose || args.action === "status" || needsAttention(item));
    const urgent = relevant.filter(needsAttention);
    const shownPrograms = [...urgent, ...relevant.filter((item) => !needsAttention(item)).slice(0, Math.max(0, args.limit - urgent.length))];
    const omittedPrograms = relevant.length - shownPrograms.length;
    const title = args.action === "prepare"
      ? lifecycleOk ? "External program resources prepared" : "External program preparation needs attention"
      : args.action === "up"
      ? lifecycleOk ? "External programs ready" : "External programs need attention"
      : args.action === "down"
        ? lifecycleOk ? stoppedAny ? "External programs stopped" : "No external programs to stop"
          : "External program stop needs attention"
        : "External program status";
    write({
      format: "hypit.cli-programs@1",
      action: args.action,
      ok: lifecycleOk,
      ready,
      programCount: result.programs.length,
      readyCount: result.programs.filter((item) => item.state.state === "ready").length,
      programs: shownPrograms.map(programRecord),
      ...(omittedPrograms === 0 ? {} : { omittedPrograms }),
    }, title,
    args.action === "status" ? ready ? "success" : "info" : lifecycleOk ? "success" : "warning", [
      ...(!args.presentation.verbose && lifecycleOk && args.action !== "status" ? [] : [
        ["Programs", String(result.programs.length)] as const,
        ["Ready", String(result.programs.filter((item) => item.state.state === "ready").length)] as const,
      ]),
    ], shownPrograms.map(programDescription).concat(omittedPrograms === 0 ? [] : [`${omittedPrograms} more programs · use --limit <count>`]));
    if (!lifecycleOk) io.setExitCode?.(1);
    return;
  }

  if (args.command === "runtime") {
    if (runtimeProfile === undefined) {
      throw new Error("runtime requires a Runtime; run hypit runtime init, select one with runtime use, or pass --runtime <profile>");
    }
    const profile = resolve(runtimeProfile);
    const controller = await runtimeController(profile);
    if (args.action === "up") {
      const packageRoot = await packageRootForProject();
      const host = await runtimeHost(profile, packageRoot);
      const prepared = await host.prepare(
        { ...(args.endpoints === undefined ? {} : { endpoints: args.endpoints }), ...(reportPackageProgress === undefined ? {} : { onProgress: reportPackageProgress }) },
      );
      const validated = await host.createRuntime(args.endpoints === undefined ? {} : { endpoints: args.endpoints });
      await validated.close();
      const external = await controller.programs.up({
        ...(args.endpoints === undefined ? {} : { endpoints: args.endpoints }),
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
          items: external.programs.filter((item) => args.presentation.verbose || item.state.state !== "ready").map(programRecord),
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
      const stopped = worker.state === "stopped";
      write({ format: "hypit.cli-runtime-down@1", worker: worker.state },
        stopped ? "Runtime Worker is down" : "Runtime Worker is still running",
        stopped ? "success" : "warning", [["Worker", worker.state]],
        [`Managed Programs are unchanged. To stop processes started by Hypit: ${commandHint(["programs", "down"], { projectRoot, runtimeProfile: resolve(profile) })}`]);
      if (!stopped) io.setExitCode?.(1);
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
        },
        builds: counts,
        programs: {
          total: external.programs.length,
          ready: external.programs.length - unavailable.length,
          unavailable: unavailable.map(programRecord),
        },
        capacity: {
          active: activity.capacity.length,
        },
      };
      write(machine, attention
        ? "Local Runtime needs attention"
        : ready ? "Local Runtime ready" : worker.state === "running"
          ? "Runtime Worker running; Programs not ready" : "Runtime Worker stopped",
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
        ...unavailable.map(programDescription),
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
      if (args.action === "status") {
        let credentials = await credentialsControl.credentials(args.endpoint);
        if (args.slot !== undefined) credentials = credentials.filter((item) => item.slot === args.slot);
        if (credentials.length === 0) throw new Error(`Endpoint ${args.endpoint} has no matching credential`);
        const view = credentials.slice(0, args.limit).map((item) => ({
          endpoint: item.endpoint,
          slot: item.slot,
          label: item.label,
          kind: item.kind,
          configured: item.configured,
          writable: item.writable,
          ...(item.acquisition === undefined ? {} : { acquisition: {
            kind: item.acquisition.kind,
            authorizationEndpoint: item.acquisition.authorizationEndpoint,
          } }),
        }));
        write({
          format: "hypit.cli-auth-status@1",
          endpoint: args.endpoint,
          credentials: view,
          ...(credentials.length <= args.limit ? {} : { omittedCredentials: credentials.length - args.limit }),
        }, "Credential status", "info", [
          ["Endpoint", args.endpoint],
          ["Configured", `${credentials.filter((item) => item.configured).length}/${credentials.length}`],
        ], credentials.slice(0, args.limit).map((item) => {
          const entry = !item.writable ? "managed by its external credential source"
            : item.acquisition === undefined ? "login uses secure secret input"
            : `login opens OAuth: ${item.acquisition.authorizationEndpoint}`;
          return `${item.slot}: ${item.configured ? "configured" : "missing"} · ${item.writable ? "writable" : "read-only"} · ${entry}`;
        }));
        return;
      }
      let credentials = await credentialsControl.describeCredentials(args.endpoint);
      if (args.slot !== undefined) credentials = credentials.filter((item) => item.slot === args.slot);
      if (credentials.length === 0) throw new Error(`Endpoint ${args.endpoint} has no matching credential`);
      if (args.slot === undefined && credentials.length > 1) {
        throw new Error(`Endpoint ${args.endpoint} has several credentials; select one with --slot`);
      }
      if (args.action === "login") {
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
