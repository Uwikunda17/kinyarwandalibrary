import { runKinyarwanda } from "../src/index.js";

const codeInput = document.getElementById("code");
const runButton = document.getElementById("runBtn");
const output = document.getElementById("output");

runButton.addEventListener("click", async () => {
  const previousLog = console.log;
  const lines = [];

  console.log = (...args) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };

  try {
    const result = await runKinyarwanda(codeInput.value);

    if (!result.ok) {
      lines.push(`Validation failed at: ${result.failedLine}`);
    }

    output.textContent = lines.join("\n") || "Done.";
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    console.log = previousLog;
  }
});
