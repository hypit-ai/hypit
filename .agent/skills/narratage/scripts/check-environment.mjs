#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import process from "node:process";
for (const command of ["node", "pnpm", "corepack", "ffmpeg", "ffprobe", "uv"]) {
  try {
    const version = execFileSync(command, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split(/\r?\n/, 1)[0];
    console.log(`${command}\tok\t${version}`);
  } catch { console.log(`${command}\tmissing`); }
}
console.log(`platform\t${process.platform}\t${process.arch}`);
