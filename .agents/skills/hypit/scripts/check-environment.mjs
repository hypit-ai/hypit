#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";
const commands = [
  ["node", ["--version"]],
  ["hypit", ["paths", "--json"]],
  ["ffmpeg", ["-version"]],
  ["ffprobe", ["-version"]],
  ["uv", ["--version"]],
];
for (const [command, args] of commands) {
  try {
    const version = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim().split(/\r?\n/, 1)[0];
    console.log(`${command}\tok\t${version}`);
  } catch { console.log(`${command}\tmissing`); }
}
console.log(`platform\t${process.platform}\t${process.arch}`);
