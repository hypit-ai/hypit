#!/usr/bin/env node
import process from "node:process";
const names = process.argv.slice(2);
if (names.length === 0) { console.error("Usage: node check-credentials.mjs NAME [...NAME]"); process.exitCode = 2; }
for (const name of names) console.log(`${name}\t${process.env[name]?.trim() ? "set" : "missing"}`);
