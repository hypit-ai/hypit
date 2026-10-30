/** Scope belongs to the command; a suggested command must keep the same project and Runtime. */
export type CommandScope = {
  readonly projectRoot?: string;
  readonly runtimeProfile?: string;
};

/** Display copyable arguments for POSIX shells or PowerShell, without expanding their contents. */
export function commandHint(
  args: readonly string[],
  scope: CommandScope = {},
  shell: "posix" | "powershell" = process.platform === "win32" ? "powershell" : "posix",
): string {
  const quote = (value: string): string => /^[a-zA-Z0-9_./:@=+-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", shell === "powershell" ? "''" : "'\"'\"'")}'`;
  return ["hypit", ...args,
    ...(scope.projectRoot === undefined ? [] : ["--project", scope.projectRoot]),
    ...(scope.runtimeProfile === undefined ? [] : ["--runtime", scope.runtimeProfile]),
  ].map(quote).join(" ");
}
