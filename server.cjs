const { readFile } = require("node:fs/promises");
const { resolve, extname } = require("node:path");
const express = require("express");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const runtimePromise = import("./src/index.js").then((module) => module.runKinyarwanda);

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ikinyarwanda-server"
  });
});

app.post("/api/ikw/run", async (req, res) => {
  try {
    const runKinyarwanda = await runtimePromise;
    const { code, file, variables } = req.body || {};

    let sourceCode = typeof code === "string" ? code : null;
    if (!sourceCode && typeof file === "string") {
      const resolvedPath = resolve(process.cwd(), file);
      if (extname(resolvedPath) !== ".ikw") {
        res.status(400).json({ ok: false, error: "Only .ikw files are supported." });
        return;
      }

      sourceCode = await readFile(resolvedPath, "utf8");
    }

    if (!sourceCode) {
      res.status(400).json({ ok: false, error: "Provide code or file in request body." });
      return;
    }

    const result = await runKinyarwanda(sourceCode, {
      variables: variables && typeof variables === "object" ? variables : {}
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.use(express.static(process.cwd()));

app.listen(PORT, () => {
  console.log(`IKW server running at http://localhost:${PORT}`);
  console.log(`Static files: http://localhost:${PORT}/`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Run endpoint: POST http://localhost:${PORT}/api/ikw/run`);
});
