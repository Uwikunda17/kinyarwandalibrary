#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import process from "node:process";
import { runKinyarwanda } from "../src/index.js";

const [, , arg1, arg2] = process.argv;
const { command, filePath } = normalizeArgs(arg1, arg2);

await main();

async function main() {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "serve") {
    await runServeCommand(filePath);
    return;
  }

  if (command !== "run") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  await runFileCommand(filePath || "index.ikw");
}

async function runFileCommand(scriptPath) {
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
}

async function runServeCommand(portArg) {
  if (portArg) {
    const maybePort = Number(portArg);
    if (!Number.isInteger(maybePort) || maybePort <= 0) {
      console.error(`Invalid port: ${portArg}`);
      process.exit(1);
    }

    process.env.PORT = String(maybePort);
  }

  await import("../server.cjs");
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

function normalizeArgs(firstArg, secondArg) {
  if (!firstArg) {
    return { command: "run", filePath: "index.ikw" };
  }

  if (firstArg === "run") {
    return { command: "run", filePath: secondArg || "index.ikw" };
  }

  if (firstArg === "serve" || firstArg === "server") {
    return { command: "serve", filePath: secondArg };
  }

  if (firstArg.endsWith(".ikw")) {
    return { command: "run", filePath: firstArg };
  }

  return { command: firstArg, filePath: secondArg };
}

function printHelp() {
  console.log(
    "ikin - Kinyarwanda language CLI\n\nUsage:\n  ikin\n  ikin run <file.ikw>\n  ikin <file.ikw>\n  ikin serve [port]\n  ikin --help\n\nDefaults:\n  if no file is provided, index.ikw is used.\n  serve uses port 3000 unless provided."
  );
}
