import { parseArgs, parseValue } from "./utils.js";

export const DOM_NO_MATCH = Symbol("DOM_NO_MATCH");

function ensureDocument() {
  if (typeof document === "undefined") {
    throw new Error("DOM commands require a browser-like environment with document.");
  }

  return document;
}

function getElement(selector) {
  const doc = ensureDocument();
  const element = doc.querySelector(selector);

  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  return element;
}

function readElementValue(selector) {
  const element = getElement(selector);

  if ("value" in element) {
    return element.value;
  }

  return element.textContent ?? "";
}

function writeElementValue(selector, value) {
  const element = getElement(selector);

  if ("value" in element) {
    element.value = String(value);
    return;
  }

  element.textContent = String(value);
}

export function runDOMCommand(line, variables = {}, options = {}) {
  if (line.startsWith("andika")) {
    const args = parseArgs(line, "andika").map((token) => parseValue(token, variables));
    console.log(...args);
    return undefined;
  }

  if (line.startsWith("muburire")) {
    const [valueRaw] = parseArgs(line, "muburire");
    const value = parseValue(valueRaw, variables);

    if (typeof alert === "function") {
      alert(String(value));
    } else {
      console.warn("alert is not available in this environment:", value);
    }

    return undefined;
  }

  if (line.startsWith("shyiramo")) {
    const [selectorRaw, valueRaw] = parseArgs(line, "shyiramo");
    const selector = String(parseValue(selectorRaw, variables));
    const value = parseValue(valueRaw, variables);

    getElement(selector).innerText = String(value);
    return undefined;
  }

  if (line.startsWith("hindura_ibuju")) {
    const [selectorRaw, colorRaw] = parseArgs(line, "hindura_ibuju");
    const selector = String(parseValue(selectorRaw, variables));
    const color = String(parseValue(colorRaw, variables));

    getElement(selector).style.color = color;
    return undefined;
  }

  if (line.startsWith("fata_agaciro")) {
    const [selectorRaw] = parseArgs(line, "fata_agaciro");
    const selector = String(parseValue(selectorRaw, variables));
    return readElementValue(selector);
  }

  if (line.startsWith("shyiraho_agaciro")) {
    const [selectorRaw, valueRaw] = parseArgs(line, "shyiraho_agaciro");
    const selector = String(parseValue(selectorRaw, variables));
    const value = parseValue(valueRaw, variables);

    writeElementValue(selector, value);
    return undefined;
  }

  if (line.startsWith("tegeka")) {
    const [selectorRaw, eventRaw, handlerRaw] = parseArgs(line, "tegeka");
    const selector = String(parseValue(selectorRaw, variables));
    const eventName = String(parseValue(eventRaw, variables));
    const handlerName = resolveHandlerName(handlerRaw, variables);

    const element = getElement(selector);
    element.addEventListener(eventName, (event) => {
      if (typeof options.onEvent !== "function") {
        return;
      }

      const maybePromise = options.onEvent(handlerName, event);
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch((error) => {
          console.error(error instanceof Error ? error.message : String(error));
        });
      }
    });

    return undefined;
  }

  return DOM_NO_MATCH;
}

function resolveHandlerName(token, variables) {
  const trimmed = token.trim();
  const identifierMatch = trimmed.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/);

  if (identifierMatch) {
    if (trimmed in variables) {
      return String(parseValue(trimmed, variables));
    }

    return trimmed;
  }

  return String(parseValue(trimmed, variables));
}
