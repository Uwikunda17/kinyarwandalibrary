import { parseArgs, parseValue } from "./utils.js";

function ensureDocument() {
  if (typeof document === "undefined") {
    throw new Error("fata(...) requires a browser-like environment with document.");
  }

  return document;
}

function ensureFetch() {
  if (typeof fetch !== "function") {
    throw new Error("Network commands require fetch to be available.");
  }
}

export async function networkCommand(line, variables = {}) {
  if (line.startsWith("fata")) {
    const [selectorRaw] = parseArgs(line, "fata");
    const selector = String(parseValue(selectorRaw, variables));

    const doc = ensureDocument();
    const form = doc.querySelector(selector);
    if (!form) {
      throw new Error(`Form not found: ${selector}`);
    }

    return new FormData(form);
  }

  if (line.startsWith("subiza_json")) {
    const [urlRaw, payloadRaw] = parseArgs(line, "subiza_json");
    const url = String(parseValue(urlRaw, variables));
    const payload = parseValue(payloadRaw, variables);
    ensureFetch();

    const response = await fetch(url, {
      method: "POST",
      headers: payload instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: payload instanceof FormData ? payload : JSON.stringify(payload)
    });

    return parseResponseBody(response);
  }

  if (line.startsWith("subiza")) {
    const [urlRaw, payloadRaw] = parseArgs(line, "subiza");
    const url = String(parseValue(urlRaw, variables));
    const payload = parseValue(payloadRaw, variables);
    ensureFetch();

    const body = payload instanceof FormData ? payload : JSON.stringify(payload);
    const headers = payload instanceof FormData ? undefined : { "Content-Type": "application/json" };

    return fetch(url, {
      method: "POST",
      headers,
      body
    });
  }

  if (line.startsWith("zana_json")) {
    const [urlRaw] = parseArgs(line, "zana_json");
    const url = String(parseValue(urlRaw, variables));
    ensureFetch();

    const response = await fetch(url, { method: "GET" });
    return parseResponseBody(response);
  }

  if (line.startsWith("zana")) {
    const [urlRaw] = parseArgs(line, "zana");
    const url = String(parseValue(urlRaw, variables));
    ensureFetch();

    return fetch(url, { method: "GET" });
  }

  return null;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
