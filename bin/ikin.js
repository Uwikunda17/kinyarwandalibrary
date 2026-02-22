#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";
import { runKinyarwanda } from "../src/index.js";

const [, , command, filePath] = process.argv;

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (command !== "run") {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

if (!filePath) {
  console.error("Missing file path. Example: ikin run examples/hello.ikw");
  process.exit(1);
}

const resolvedPath = resolve(process.cwd(), filePath);
if (extname(resolvedPath) !== ".ikw") {
  console.error(`Expected a .ikw file, received: ${filePath}`);
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

function printHelp() {
  console.log(`ikin - Kinyarwanda language CLI\n\nUsage:\n  ikin run <file.ikw>\n  ikin --help`);
}
