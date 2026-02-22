import test from "node:test";
import assert from "node:assert/strict";
import { runKinyarwanda } from "../src/index.js";

test("runs variable assignment and arithmetic", async () => {
  const result = await runKinyarwanda(`
    let count = 2;
    count = count + 3;
    export count;
  `);

  assert.equal(result.ok, true);
  assert.equal(result.variables.count, 5);
  assert.equal(result.exports.count, 5);
});

test("supports const and blocks reassignment", async () => {
  await assert.rejects(
    () =>
      runKinyarwanda(`
        const value = 10;
        value = 11;
      `),
    /Cannot reassign const variable/
  );
});

test("supports function, loop and return", async () => {
  const result = await runKinyarwanda(`
    umukoro double(n) {
      garura n * 2;
    }

    let sum = 0;
    subiramo(i, 1, 3) {
      let doubled = double(i);
      sum = sum + doubled;
    }

    export sum;
  `);

  assert.equal(result.ok, true);
  assert.equal(result.exports.sum, 12);
});

test("supports import/export through dependencies", async () => {
  const result = await runKinyarwanda(
    `
      import math from 'math';
      import { max as biggest } from 'math';
      let answer = koresha(math, 'min', 4, 9);
      answer = koresha(biggest, answer, 7);
      export { answer as finalAnswer };
    `,
    {
      dependencies: {
        math: Math
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.exports.finalAnswer, 7);
});

test("supports custom commands and command lifecycle hooks", async () => {
  const starts = [];
  const ends = [];

  const result = await runKinyarwanda(
    `
      let value = dubura(2, 4);
      andika(value);
      export value;
    `,
    {
      commands: {
        dubura({ args }) {
          return Number(args[0]) * Number(args[1]);
        }
      },
      onCommandStart(event) {
        starts.push(event.name);
      },
      onCommandEnd(event) {
        ends.push(event.name);
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.exports.value, 8);
  assert.deepEqual(starts, ["dubura", "andika"]);
  assert.deepEqual(ends, ["dubura", "andika"]);
});
