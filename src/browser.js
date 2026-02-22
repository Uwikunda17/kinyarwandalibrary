import { runKinyarwanda } from "./interpreter.js";

export async function runKinyarwandaInBrowser(code, options = {}) {
  return runKinyarwanda(code, options);
}

export async function runKinyarwandaFile(url, options = {}) {
  ensureFetch();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch script: ${url} (${response.status})`);
  }

  const script = await response.text();
  return runKinyarwanda(script, options);
}

export async function runKinyarwandaScripts(options = {}) {
  ensureDocument();

  const selector = options.selector || "script[type='text/ikinyarwanda']";
  const runOptions = options.runOptions || {};
  const stopOnValidationFail = options.stopOnValidationFail !== false;

  const scripts = [...document.querySelectorAll(selector)];
  const results = [];

  for (const scriptTag of scripts) {
    const code = scriptTag.src ? await fetchScript(scriptTag.src) : scriptTag.textContent || "";
    const result = await runKinyarwanda(code, runOptions);

    results.push({
      script: scriptTag,
      result
    });

    if (!result.ok && stopOnValidationFail) {
      break;
    }
  }

  return results;
}

export function installKinyarwandaGlobal(options = {}) {
  if (typeof window === "undefined") {
    return null;
  }

  const runtime = {
    runKinyarwanda,
    runKinyarwandaInBrowser,
    runKinyarwandaFile,
    runKinyarwandaScripts
  };

  window.IkinyarwandaLang = runtime;

  const autoRun = options.autoRun === true;
  if (autoRun && typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        runKinyarwandaScripts(options).catch(logRuntimeError);
      });
    } else {
      runKinyarwandaScripts(options).catch(logRuntimeError);
    }
  }

  return runtime;
}

function ensureDocument() {
  if (typeof document === "undefined") {
    throw new Error("Browser runtime requires document.");
  }
}

function ensureFetch() {
  if (typeof fetch !== "function") {
    throw new Error("Browser runtime requires fetch.");
  }
}

async function fetchScript(url) {
  ensureFetch();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch script: ${url} (${response.status})`);
  }

  return response.text();
}

function logRuntimeError(error) {
  console.error(error instanceof Error ? error.message : String(error));
}
