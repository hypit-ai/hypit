import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CliCommand, EnvironmentCommand } from "../command.js";
import { acquireOAuthCredential } from "../oauth.js";
import type { CliIo } from "@hypit/cli/public";
import { writeCliOutput } from "../output.js";
import type { CliDiagnostic, CliEnvironmentHost, CliPublicationStoreLocation, CliRuntimeHost } from "../runtime-port.js";
import type { OperationalWriter } from "./types.js";

export function isEnvironmentCommand(args: CliCommand): args is EnvironmentCommand {
  return args.command === "doctor" || args.command === "auth";
}

export async function runEnvironmentCommand(input: {
  readonly args: EnvironmentCommand;
  readonly runtimeProfile: string | undefined;
  readonly runtimeFromProject: boolean;
  readonly environmentProfile: string | undefined;
  readonly io: CliIo;
  readonly projectRoot: string;
  readonly diagnoseProjectResults: () => Promise<{
    readonly location?: CliPublicationStoreLocation;
    readonly diagnostics: readonly CliDiagnostic[];
  }>;
  readonly runtimeHost: (profile: string, packageRoot?: string) => Promise<CliRuntimeHost>;
  readonly environmentHost: (profile: string, packageRoot?: string) => Promise<CliEnvironmentHost>;
  readonly write: OperationalWriter;
}): Promise<void> {
  const {
    args, runtimeProfile, runtimeFromProject, environmentProfile, io, projectRoot,
    diagnoseProjectResults, runtimeHost, environmentHost, write,
  } = input;
  const profileSource: "none" | "argument" | "project" = environmentProfile !== undefined
    ? "argument" : runtimeProfile === undefined ? "none" : runtimeFromProject ? "project" : "argument";
  const openEnvironment = async (): Promise<CliEnvironmentHost | undefined> => environmentProfile !== undefined
    ? await environmentHost(environmentProfile)
    : runtimeProfile === undefined ? undefined : (await runtimeHost(runtimeProfile)).environment;
  const reportCredentialProgress = args.presentation.json
    ? io.writeProgress
    : io.writeProgress ?? io.write;

  if (args.command === "doctor") {
    const profile = environmentProfile ?? runtimeProfile;
    const [runtimeResult, projectResult] = await Promise.all([
      profile === undefined ? undefined : (await openEnvironment())?.doctor(args.endpoints === undefined ? {} : { endpoints: args.endpoints }),
      diagnoseProjectResults(),
    ]);
    const diagnostics = [...(runtimeResult?.diagnostics ?? []), ...projectResult.diagnostics];
    const machine = {
      format: "hypit.cli-doctor@1" as const,
      ok: !diagnostics.some((item) => item.severity === "error"),
      project: projectRoot,
      profileSource,
      ...(profile === undefined ? {} : {
        profileKind: environmentProfile === undefined ? "runtime" as const : "environment" as const,
      }),
      ...(profile === undefined ? {} : { profile: resolve(profile) }),
      diagnosticCount: diagnostics.length,
      diagnostics,
    };
    writeCliOutput(io, args.presentation, { kind: "doctor", machine });
    if (!machine.ok) io.setExitCode?.(1);
    return;
  }

  const selectedEnvironment = await openEnvironment();
  if (selectedEnvironment === undefined) {
    throw new Error("auth requires an Environment; pass --environment <profile>, or select/pass a Runtime that references one");
  }
  const credentialsControl = await selectedEnvironment.openCredentials(args.endpoint);
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
    const [item] = credentials;
    if (item === undefined) throw new Error(`Endpoint ${args.endpoint} has no matching credential`);
    if (args.action === "login") {
      if (!item.writable) {
        const source = item.ref.store === "env"
          ? `set ${item.ref.key} in the environment`
          : "select a writable credential source in the Environment Profile";
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
      return;
    }
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
  } finally {
    await credentialsControl.close();
  }
}
