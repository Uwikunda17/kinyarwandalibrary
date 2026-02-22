#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";
import { runKinyarwanda } from "../src/index.js";

const [, , arg1, arg2] = process.argv;
const { command, filePath } = normalizeArgs(arg1, arg2);

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (command !== "run") {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

const scriptPath = filePath || "index.ikw";

const resolvedPath = resolve(process.cwd(), scriptPath);
if (extname(resolvedPath) !== ".ikw") {
  console.error(`Expected a .ikw file, received: ${scriptPath}`);
  process.exit(1);
}

try {
  const code = await readFile(resolvedPath, "utf8");
  const result = await runKinyarwanda(code);

  if (!result.ok) {
    console.error(`Validation failed at line: ${result.failedLine}`);
    process.exit(2);
  }

  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function normalizeArgs(firstArg, secondArg) {
  if (!firstArg) {
    return { command: "run", filePath: "index.ikw" };
  }

  if (firstArg === "run") {
    return { command: "run", filePath: secondArg || "index.ikw" };
  }

  if (firstArg.endsWith(".ikw")) {
    return { command: "run", filePath: firstArg };
  }

  return { command: firstArg, filePath: secondArg };
}

function printHelp() {
  console.log(
    "ikin - Kinyarwanda language CLI\n\nUsage:\n  ikin\n  ikin run <file.ikw>\n  ikin <file.ikw>\n  ikin --help\n\nDefaults:\n  if no file is provided, index.ikw is used."
  );
}
