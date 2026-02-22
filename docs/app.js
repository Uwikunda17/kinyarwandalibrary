import { runKinyarwanda, runKinyarwandaScripts } from "../src/index.js";

const codeInput = document.getElementById("code");
const runButton = document.getElementById("runBtn");
const output = document.getElementById("output");
const runtimeNote = document.getElementById("runtimeNote");

if (window.location.protocol === "file:") {
  runtimeNote.textContent =
    "Open through http://localhost, not file://. Run: npx serve . then open /docs/index.html";
} else {
  runKinyarwandaScripts().catch((error) => {
    output.textContent = error instanceof Error ? error.message : String(error);
  });
}

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
