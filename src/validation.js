import { parseArgs, parseValue } from "./utils.js";

function ensureDocument() {
  if (typeof document === "undefined") {
    throw new Error("Validation commands require a browser-like environment with document.");
  }

  return document;
}

function getInputValue(selector) {
  const doc = ensureDocument();
  const element = doc.querySelector(selector);

  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  if (typeof element.value !== "string") {
    throw new Error(`Element does not expose a string value: ${selector}`);
  }

  return element.value;
}

export function idafiteAgaciro(selector) {
  return getInputValue(selector).trim() === "";
}

export function siImererweNeza(selector) {
  const email = getInputValue(selector).trim();
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ntibihuye(selectorOne, selectorTwo) {
  return getInputValue(selectorOne) !== getInputValue(selectorTwo);
}

export function validateCommand(line, variables = {}) {
  if (line.startsWith("idafite_agaciro")) {
    const [selectorRaw] = parseArgs(line, "idafite_agaciro");
    return idafiteAgaciro(String(parseValue(selectorRaw, variables)));
  }

  if (line.startsWith("si_imererwe_neza")) {
    const [selectorRaw] = parseArgs(line, "si_imererwe_neza");
    return siImererweNeza(String(parseValue(selectorRaw, variables)));
  }

  if (line.startsWith("ntibihuye")) {
    const [leftRaw, rightRaw] = parseArgs(line, "ntibihuye");
    return ntibihuye(
      String(parseValue(leftRaw, variables)),
      String(parseValue(rightRaw, variables))
    );
  }

  return null;
}
