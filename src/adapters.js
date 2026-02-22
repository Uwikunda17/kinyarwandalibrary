import { runKinyarwanda } from "./interpreter.js";
import { runKinyarwandaScripts } from "./browser.js";

export function createKinyarwandaRunner(baseOptions = {}) {
  return {
    async run(code, options = {}) {
      return runKinyarwanda(code, mergeRuntimeOptions(baseOptions, options));
    },

    async runFile(filePath, options = {}) {
      const { readFile } = await import("node:fs/promises");
      const script = await readFile(filePath, "utf8");
      return runKinyarwanda(script, mergeRuntimeOptions(baseOptions, options));
    },

    withOptions(nextOptions = {}) {
      return createKinyarwandaRunner(mergeRuntimeOptions(baseOptions, nextOptions));
    }
  };
}

export function createBackendKinyarwanda(options = {}) {
  return createKinyarwandaRunner(options);
}

export function createReactKinyarwanda(options = {}) {
  return createKinyarwandaRunner(options);
}

export function createVueKinyarwanda(options = {}) {
  return createKinyarwandaRunner(options);
}

export function createHtmlKinyarwanda(options = {}) {
  return {
    run(code, runOptions = {}) {
      return runKinyarwanda(code, mergeRuntimeOptions(options, runOptions));
    },

    runFromElement(selector, runOptions = {}) {
      ensureDocument();
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }

      const code = element.textContent || "";
      return runKinyarwanda(code, mergeRuntimeOptions(options, runOptions));
    },

    runScriptTags(scriptOptions = {}) {
      const mergedRunOptions = mergeRuntimeOptions(options, scriptOptions.runOptions || {});
      return runKinyarwandaScripts({
        ...scriptOptions,
        runOptions: mergedRunOptions
      });
    }
  };
}

function mergeRuntimeOptions(base, override) {
  return {
    ...base,
    ...override,
    variables: {
      ...(base.variables || {}),
      ...(override.variables || {})
    },
    dependencies: {
      ...(base.dependencies || {}),
      ...(override.dependencies || {})
    },
    commands: {
      ...(base.commands || {}),
      ...(override.commands || {})
    }
  };
}

function ensureDocument() {
  if (typeof document === "undefined") {
    throw new Error("HTML adapter requires document.");
  }
}
