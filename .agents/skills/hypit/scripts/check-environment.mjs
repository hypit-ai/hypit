#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";
const commands = [
  ["node", "--version"],
  ["pnpm", "--version"],
  ["corepack", "--version"],
  ["ffmpeg", "-version"],
  ["ffprobe", "-version"],
  ["uv", "--version"],
];
for (const [command, versionFlag] of commands) {
  try {
    const version = execFileSync(command, [versionFlag], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim().split(/\r?\n/, 1)[0];
    console.log(`${command}\tok\t${version}`);
  } catch { console.log(`${command}\tmissing`); }
}
console.log(`platform\t${process.platform}\t${process.arch}`);
